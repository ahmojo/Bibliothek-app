import assert from "node:assert/strict";
import test from "node:test";
import { runMigrations } from "../scripts/migrations.mjs";
import { testDatabase, migrationsDirectory } from "./helpers/database.mjs";

test("Medien und Exemplare", async (t) => {
  const { client, schema, applied } = await testDatabase(t);

  const directory = migrationsDirectory;
  const expected = [
    "001_create_books.sql",
    "002_create_cd_dvd.sql",
    "003_create_exemplar.sql",
    "004_create_users.sql",
    "005_create_ausleihe.sql",
  ];
  assert.deepEqual(applied.filter((filename) => expected.includes(filename)), expected);
  assert.deepEqual(applied, [...applied].sort());

  await t.test("Alle Tabellen haben die erwarteten Spalten und Primärschlüssel", async () => {
    const expected = {
      books: ["id", "title", "author", "isbn", "publisher", "publication_year", "category", "description", "cover_image_path"],
      cd_dvd: ["id", "title", "media_type", "cover_image_path"],
      exemplar: ["id", "inventory_number", "location", "book_id", "cd_dvd_id"],
    };
    for (const [table, columns] of Object.entries(expected)) {
      const result = await client.query(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = $1 AND table_name = $2 ORDER BY ordinal_position`,
        [schema, table],
      );
      assert.deepEqual(result.rows.map((row) => row.column_name), columns);
      const primaryKey = await client.query(
        `SELECT k.column_name
         FROM information_schema.table_constraints c
         JOIN information_schema.key_column_usage k
           ON c.constraint_schema = k.constraint_schema AND c.constraint_name = k.constraint_name
         WHERE c.table_schema = $1 AND c.table_name = $2 AND c.constraint_type = 'PRIMARY KEY'`,
        [schema, table],
      );
      assert.deepEqual(primaryKey.rows, [{ column_name: "id" }]);
    }
  });

  await t.test("Bücher speichern Pflichtfelder und optionale Angaben", async () => {
    const minimal = await client.query(
      "INSERT INTO books (title, author, isbn) VALUES ($1, $2, $3) RETURNING *",
      ["Ein Buch", "Eine Autorin", "0306406152"],
    );
    assert.ok(minimal.rows[0].id);
    assert.equal(minimal.rows[0].isbn, "0306406152");
    for (const field of ["publisher", "publication_year", "category", "description"]) {
      assert.equal(minimal.rows[0][field], null);
    }

    const full = await client.query(
      `INSERT INTO books (title, author, isbn, publisher, publication_year, category, description)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      ["Weiteres Buch", "Ein Autor", "9780132350884", "Testverlag", 2026, "Roman", "Beschreibung"],
    );
    assert.equal(full.rows[0].publication_year, 2026);
    assert.equal(full.rows[0].publisher, "Testverlag");
    assert.equal(full.rows[0].category, "Roman");
    assert.equal(full.rows[0].description, "Beschreibung");
  });

  await t.test("Pflichtfelder und eindeutige ISBN werden erzwungen", async () => {
    for (const values of [
      [null, "Autor", "100"], ["Titel", null, "101"], ["Titel", "Autor", null],
    ]) {
      await assert.rejects(
        client.query("INSERT INTO books (title, author, isbn) VALUES ($1, $2, $3)", values),
        { code: "23502" },
      );
    }
    await assert.rejects(
      client.query("INSERT INTO books (title, author, isbn) VALUES ('Duplikat', 'Autor', '0306406152')"),
      { code: "23505" },
    );
    await assert.rejects(client.query("INSERT INTO cd_dvd (title, media_type) VALUES (NULL, 'CD')"),
      { code: "23502" });
    await assert.rejects(client.query("INSERT INTO cd_dvd (title, media_type) VALUES ('Titel', NULL)"),
      { code: "23502" });
  });

  await t.test("CD und DVD lassen sich speichern, andere Medientypen nicht", async () => {
    const result = await client.query(
      "INSERT INTO cd_dvd (title, media_type) VALUES ('Musik', 'CD'), ('Film', 'DVD') RETURNING *",
    );
    assert.deepEqual(result.rows.map((row) => row.media_type), ["CD", "DVD"]);
    for (const value of ["Blu-ray", "cd", ""]) {
      await assert.rejects(
        client.query("INSERT INTO cd_dvd (title, media_type) VALUES ('Ungültig', $1)", [value]),
        { code: "23514" },
      );
    }
  });

  const book = await client.query("SELECT id FROM books WHERE isbn = '0306406152'");
  const disc = await client.query("SELECT id FROM cd_dvd WHERE media_type = 'CD'");
  const bookId = book.rows[0].id;
  const discId = disc.rows[0].id;

  await t.test("Mehrere Exemplare können zu einem Buch oder einer CD gehören", async () => {
    await client.query(
      `INSERT INTO exemplar (inventory_number, location, book_id, cd_dvd_id) VALUES
       ('B-001', 'Regal A', $1, NULL), ('B-002', 'Regal B', $1, NULL),
       ('CD-001', 'Regal C', NULL, $2), ('CD-002', 'Regal C', NULL, $2)`,
      [bookId, discId],
    );
    const result = await client.query("SELECT book_id, cd_dvd_id FROM exemplar ORDER BY inventory_number");
    assert.deepEqual(result.rows, [
      { book_id: bookId, cd_dvd_id: null }, { book_id: bookId, cd_dvd_id: null },
      { book_id: null, cd_dvd_id: discId }, { book_id: null, cd_dvd_id: discId },
    ]);
  });

  await t.test("Inventarnummern sind eindeutig, Inventarnummer und Standort sind Pflicht", async () => {
    await assert.rejects(
      client.query("INSERT INTO exemplar (inventory_number, location, cd_dvd_id) VALUES ('B-001', 'Regal', $1)", [discId]),
      { code: "23505" },
    );
    for (const values of [[null, "Regal", bookId], ["B-003", null, bookId]]) {
      await assert.rejects(
        client.query("INSERT INTO exemplar (inventory_number, location, book_id) VALUES ($1, $2, $3)", values),
        { code: "23502" },
      );
    }
  });

  await t.test("Ein Exemplar braucht genau eine Medienzuordnung, auch bei Updates", async () => {
    await assert.rejects(
      client.query("INSERT INTO exemplar (inventory_number, location) VALUES ('X-001', 'Regal')"),
      { code: "23514" },
    );
    await assert.rejects(
      client.query("INSERT INTO exemplar (inventory_number, location, book_id, cd_dvd_id) VALUES ('X-002', 'Regal', $1, $2)", [bookId, discId]),
      { code: "23514" },
    );
    await assert.rejects(client.query("UPDATE exemplar SET book_id = NULL WHERE inventory_number = 'B-001'"),
      { code: "23514" });
    await assert.rejects(client.query("UPDATE exemplar SET cd_dvd_id = $1 WHERE inventory_number = 'B-001'", [discId]),
      { code: "23514" });
  });

  await t.test("Fremdschlüssel verhindern ungültige Referenzen und das Löschen zugeordneter Medien", async () => {
    await assert.rejects(
      client.query("INSERT INTO exemplar (inventory_number, location, book_id) VALUES ('X-003', 'Regal', -1)"),
      { code: "23503" },
    );
    await assert.rejects(
      client.query("INSERT INTO exemplar (inventory_number, location, cd_dvd_id) VALUES ('X-004', 'Regal', -1)"),
      { code: "23503" },
    );
    await assert.rejects(client.query("UPDATE exemplar SET book_id = -1 WHERE inventory_number = 'B-001'"),
      { code: "23503" });
    await assert.rejects(client.query("DELETE FROM books WHERE id = $1", [bookId]),
      { code: "23503" });
    await assert.rejects(client.query("DELETE FROM cd_dvd WHERE id = $1", [discId]),
      { code: "23503" });
  });

  await t.test("Erneuter Migrationslauf erhält vorhandene Bücher und Exemplare", async () => {
    const beforeBooks = await client.query("SELECT * FROM books ORDER BY id");
    const beforeDiscs = await client.query("SELECT * FROM cd_dvd ORDER BY id");
    const beforeCopies = await client.query("SELECT * FROM exemplar ORDER BY id");
    assert.deepEqual(await runMigrations(client, directory), []);
    assert.deepEqual((await client.query("SELECT * FROM books ORDER BY id")).rows, beforeBooks.rows);
    assert.deepEqual((await client.query("SELECT * FROM cd_dvd ORDER BY id")).rows, beforeDiscs.rows);
    assert.deepEqual((await client.query("SELECT * FROM exemplar ORDER BY id")).rows, beforeCopies.rows);
  });
});
