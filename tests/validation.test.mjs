import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, copyFile, readdir, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { testDatabase, migrationsDirectory } from "./helpers/database.mjs";
import { runMigrations } from "../scripts/migrations.mjs";
import { normalizeIsbn, isValidIsbn } from "../lib/isbn.mjs";

test("Frische Migrationen richten setup_check ohne manuelles SQL ein", async (t) => {
  const { db } = await testDatabase(t);
  const result = await db.query("SELECT message FROM setup_check");
  assert.deepEqual(result.rows, [{ message: "Datenbankverbindung erfolgreich" }]);
});

test("Vorhandene setup_check-Nachrichten bleiben bei Migration und Wiederholung erhalten", async (t) => {
  const { client } = await testDatabase(t, { migrate: false });
  await client.query("CREATE TABLE setup_check (id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY, message text NOT NULL)");
  await client.query("INSERT INTO setup_check (message) VALUES ('Eigene Nachricht'), ('Zweiter Eintrag')");
  const before = await client.query("SELECT * FROM setup_check ORDER BY id");
  await runMigrations(client, migrationsDirectory);
  assert.deepEqual((await client.query("SELECT * FROM setup_check ORDER BY id")).rows, before.rows);
  assert.deepEqual(await runMigrations(client, migrationsDirectory), []);
  assert.deepEqual((await client.query("SELECT * FROM setup_check ORDER BY id")).rows, before.rows);
});

test("Datenbank und API validieren ISBNs nach denselben Regeln", async (t) => {
  const { db } = await testDatabase(t);
  for (const value of ["978-0-306-40615-7", "0306406152", "0-8044-2957-x", "9780306406158", "123", "\t978 0 306 40615 7\n", "978\u00a00306406157", "978\u202f0306406157", "978\ufeff0306406157", "978\u00850306406157"]) {
    const result = await db.query("SELECT valid_isbn($1) AS valid, normalize_isbn($1) AS normalized", [value]);
    assert.equal(result.rows[0].valid, isValidIsbn(value));
    assert.equal(result.rows[0].normalized, normalizeIsbn(value));
  }
});

test("Setupfehler räumen Schema und Verbindungen sofort auf", async (t) => {
  const { db } = await testDatabase(t);
  const schemasSql = "SELECT nspname FROM pg_namespace WHERE nspname LIKE 'backend_test_%' ORDER BY nspname";
  const connectionsSql = "SELECT count(*)::integer AS count FROM pg_stat_activity WHERE application_name LIKE 'backend_test_%'";
  const schemasBefore = await db.query(schemasSql);
  const connectionsBefore = await db.query(connectionsSql);
  for (const options of [
    { migrationsDirectory: path.join(os.tmpdir(), randomUUID()) },
    { connectionString: "postgresql://127.0.0.1:1/does_not_exist" },
  ]) {
    const hooks = [];
    await assert.rejects(testDatabase({ after: (hook) => hooks.push(hook) }, options));
    assert.equal(hooks.length, 1);
    await hooks[0]();
    assert.deepEqual((await db.query(schemasSql)).rows, schemasBefore.rows);
    assert.deepEqual((await db.query(connectionsSql)).rows, connectionsBefore.rows);
  }
});

test("Konflikte stoppen Migration 007 mit konkreten IDs und ohne Datenänderungen", async (t) => {
  let directory;
  t.after(async () => {
    if (directory) {
      assert.ok(path.resolve(directory).startsWith(path.resolve(os.tmpdir()) + path.sep));
      await rm(directory, { recursive: true, force: true });
    }
  });
  directory = await mkdtemp(path.join(os.tmpdir(), "bibliothek-legacy-"));
  const files = await readdir(migrationsDirectory);
  for (const filename of files.filter((filename) => /^00[1-6]_.*\.sql$/.test(filename))) {
    await copyFile(path.join(migrationsDirectory, filename), path.join(directory, filename));
  }
  const { client } = await testDatabase(t, { migrationsDirectory: directory });
  await client.query("INSERT INTO books (title, author, isbn, publication_year) VALUES ('', 'Autor', 'falsch', -100), ('Titel', 'Autor', '9780306406157', NULL), ('Titel', 'Autor', '978-0-306-40615-7', NULL)");
  const before = await client.query("SELECT * FROM books ORDER BY id");
  await copyFile(path.join(migrationsDirectory, "007_validate_media_and_users.sql"), path.join(directory, "007_validate_media_and_users.sql"));
  await assert.rejects(runMigrations(client, directory), (error) => {
    assert.match(error.message, /books id=1.*title leer.*isbn ungueltig.*publication_year ungueltig/);
    assert.match(error.message, /books ids=\{2,3\}.*doppelte normalisierte ISBN/);
    return true;
  });
  assert.deepEqual((await client.query("SELECT * FROM books ORDER BY id")).rows, before.rows);
  assert.equal((await client.query("SELECT filename FROM schema_migrations WHERE filename LIKE '007_%'")).rowCount, 0);
});

test("Leere Pflichtfelder und ungültige Erscheinungsjahre werden abgelehnt", async (t) => {
  const { db } = await testDatabase(t);
  for (const blank of ["", "   ", "\t\n"]) {
    for (const values of [[blank, "Autor", "9780306406157"], ["Titel", blank, "9780306406157"], ["Titel", "Autor", blank]]) {
      await assert.rejects(db.query("INSERT INTO books (title, author, isbn) VALUES ($1, $2, $3)", values), { code: "23514" });
    }
    await assert.rejects(db.query("INSERT INTO cd_dvd (title, media_type) VALUES ($1, 'CD')", [blank]), { code: "23514" });
    for (let index = 0; index < 3; index++) {
      const values = ["Name", "valid@example.test", "$argon2id$test-fixture"];
      values[index] = blank;
      await assert.rejects(db.query("INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, 'USER')", values), { code: "23514" });
    }
  }
  for (const year of [-100, 0, new Date().getFullYear() + 2]) {
    await assert.rejects(db.query("INSERT INTO books (title, author, isbn, publication_year) VALUES ('Titel', 'Autor', '9780306406157', $1)", [year]), { code: "23514" });
  }
  const book = await db.query("INSERT INTO books (title, author, isbn) VALUES ('Titel', 'Autor', '9780306406157') RETURNING id");
  for (const values of [["", "Regal", book.rows[0].id], ["INV-1", "  ", book.rows[0].id]]) {
    await assert.rejects(db.query("INSERT INTO exemplar (inventory_number, location, book_id) VALUES ($1, $2, $3)", values), { code: "23514" });
  }
});

test("ISBN-Varianten sind eindeutig und falsche Prüfziffern werden abgelehnt", async (t) => {
  const { db } = await testDatabase(t);
  await db.query("INSERT INTO books (title, author, isbn) VALUES ('Titel', 'Autor', '9780306406157')");
  for (const isbn of ["978-0-306-40615-7", "978 0 306 40615 7", "978\u00a00306406157"]) {
    await assert.rejects(db.query("INSERT INTO books (title, author, isbn) VALUES ('Duplikat', 'Autor', $1)", [isbn]), { code: "23505" });
  }
  for (const isbn of ["9780306406158", "0306406153", "123", "ABC"]) {
    await assert.rejects(db.query("INSERT INTO books (title, author, isbn) VALUES ('Ungültig', 'Autor', $1)", [isbn]), { code: "23514" });
  }
  await db.query("INSERT INTO books (title, author, isbn) VALUES ('Alt', 'Autor', '0-306-40615-2')");
});
