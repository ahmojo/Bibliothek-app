import assert from "node:assert/strict";
import test from "node:test";
import pg from "pg";
import { runMigrations } from "../scripts/migrations.mjs";
import { testDatabase, migrationsDirectory } from "./helpers/database.mjs";


// Fester Hashwert als Testfixture; keine Passwortverarbeitung im Test.
const passwordHash = "$2b$12$R9h/cIPz0gi.URNNX3kh2OPST9/PgBkqquzi.Ss7KIUgO2t0jWMUW";

test("Benutzer und Ausleihen", async (t) => {
  const { client, schema, applied } = await testDatabase(t);

  const directory = migrationsDirectory;
  const expected = [
    "001_create_books.sql", "002_create_cd_dvd.sql", "003_create_exemplar.sql",
    "004_create_users.sql", "005_create_ausleihe.sql",
  ];
  assert.deepEqual(applied.filter((filename) => expected.includes(filename)), expected);
  assert.deepEqual(applied, [...applied].sort());

  const users = await client.query(
    `INSERT INTO users (name, email, password_hash, role)
     VALUES ('Leserin', 'Leserin@example.test', $1, 'USER'),
            ('Admin', 'admin@example.test', $1, 'ADMIN') RETURNING id`,
    [passwordHash],
  );
  const userId = users.rows[0].id;
  const otherUserId = users.rows[1].id;
  const book = await client.query(
    "INSERT INTO books (title, author, isbn) VALUES ('Testbuch', 'Autor', '9780000000002') RETURNING id",
  );
  const copies = await client.query(
    `INSERT INTO exemplar (inventory_number, location, book_id)
     VALUES ('LOAN-001', 'Testregal', $1), ('LOAN-002', 'Testregal', $1) RETURNING id`,
    [book.rows[0].id],
  );
  const copyId = copies.rows[0].id;
  const otherCopyId = copies.rows[1].id;

  await t.test("Benutzer und Hashwert bleiben über eine neue Verbindung lesbar", async () => {
    const reader = new pg.Client({ connectionString: process.env.DATABASE_URL });
    try {
      await reader.connect();
      await reader.query(`SET search_path TO "${schema}"`);
      const result = await reader.query("SELECT name, email, password_hash, role FROM users ORDER BY id");
      assert.deepEqual(result.rows, [
        { name: "Leserin", email: "Leserin@example.test", password_hash: passwordHash, role: "USER" },
        { name: "Admin", email: "admin@example.test", password_hash: passwordHash, role: "ADMIN" },
      ]);
    } finally {
      await reader.end();
    }
  });

  await t.test("E-Mail-Duplikate werden unabhängig von der Schreibweise abgelehnt", async () => {
    for (const email of ["Leserin@example.test", "leserin@EXAMPLE.TEST"]) {
      await assert.rejects(
        client.query("INSERT INTO users (name, email, password_hash, role) VALUES ('Duplikat', $1, $2, 'USER')", [email, passwordHash]),
        { code: "23505", constraint: "users_email_lower_unique" },
      );
    }
    await assert.rejects(
      client.query("UPDATE users SET email = 'LESERIN@example.test' WHERE id = $1", [otherUserId]),
      { code: "23505" },
    );
  });

  await t.test("Ungültige Rollen und fehlende Benutzerpflichtfelder werden abgelehnt", async () => {
    for (const role of ["GUEST", "user", ""]) {
      await assert.rejects(
        client.query("INSERT INTO users (name, email, password_hash, role) VALUES ('Test', 'invalid@example.test', $1, $2)", [passwordHash, role]),
        { code: "23514", constraint: "users_role_valid" },
      );
    }
    for (let index = 0; index < 4; index++) {
      const values = ["Test", "missing@example.test", passwordHash, "USER"];
      values[index] = null;
      await assert.rejects(
        client.query("INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4)", values),
        { code: "23502" },
      );
    }
  });

  let activeLoanId;
  await t.test("Eine aktive Ausleihe wird mit Benutzer, Exemplar und DATE-Werten gespeichert", async () => {
    const result = await client.query(
      `INSERT INTO ausleihe (user_id, exemplar_id, loan_date, due_date)
       VALUES ($1, $2, '2026-01-01', '2026-01-31')
       RETURNING id, user_id, exemplar_id, loan_date::text, due_date::text, return_date`,
      [userId, copyId],
    );
    activeLoanId = result.rows[0].id;
    assert.deepEqual(result.rows[0], {
      id: activeLoanId, user_id: userId, exemplar_id: copyId,
      loan_date: "2026-01-01", due_date: "2026-01-31", return_date: null,
    });
  });

  await t.test("Ein Exemplar erlaubt nur eine aktive Ausleihe, auch für andere Benutzer", async () => {
    await assert.rejects(
      client.query("INSERT INTO ausleihe (user_id, exemplar_id, loan_date, due_date) VALUES ($1, $2, '2026-02-01', '2026-03-03')", [otherUserId, copyId]),
      { code: "23505", constraint: "ausleihe_one_active_per_exemplar" },
    );
    await client.query("INSERT INTO ausleihe (user_id, exemplar_id, loan_date, due_date) VALUES ($1, $2, '2026-01-01', '2026-01-31')", [userId, otherCopyId]);
    const result = await client.query("SELECT id FROM ausleihe WHERE user_id = $1 AND return_date IS NULL", [userId]);
    assert.equal(result.rowCount, 2);
  });

  await t.test("Rückgabe erlaubt eine neue aktive Ausleihe und erhält den alten Datensatz", async () => {
    await client.query("UPDATE ausleihe SET return_date = '2026-01-20' WHERE id = $1", [activeLoanId]);
    await client.query(
      `INSERT INTO ausleihe (user_id, exemplar_id, loan_date, due_date)
       VALUES ($1, $2, '2026-02-01', '2026-03-03')`,
      [otherUserId, copyId],
    );
    const history = await client.query("SELECT id, return_date::text FROM ausleihe WHERE exemplar_id = $1 ORDER BY id", [copyId]);
    assert.equal(history.rowCount, 2);
    assert.deepEqual(history.rows[0], { id: activeLoanId, return_date: "2026-01-20" });
    assert.equal(history.rows[1].return_date, null);
    await assert.rejects(client.query("UPDATE ausleihe SET return_date = NULL WHERE id = $1", [activeLoanId]),
      { code: "23505" });
  });

  await t.test("Mehrere historische Ausleihen desselben Exemplars bleiben gespeichert", async () => {
    await client.query(
      `INSERT INTO ausleihe (user_id, exemplar_id, loan_date, due_date, return_date) VALUES
       ($1, $2, '2025-10-01', '2025-10-31', '2025-10-15'),
       ($1, $2, '2025-11-01', '2025-12-01', '2025-11-20')`,
      [userId, copyId],
    );
    const result = await client.query(
      `SELECT count(*)::integer AS total,
       count(*) FILTER (WHERE return_date IS NULL)::integer AS active
       FROM ausleihe WHERE exemplar_id = $1`, [copyId],
    );
    assert.deepEqual(result.rows, [{ total: 4, active: 1 }]);
  });

  await t.test("Nicht vorhandene Benutzer und Exemplare werden abgelehnt", async () => {
    for (const ids of [[-1, copyId], [userId, -1]]) {
      await assert.rejects(
        client.query("INSERT INTO ausleihe (user_id, exemplar_id, loan_date, due_date, return_date) VALUES ($1, $2, '2025-01-01', '2025-01-31', '2025-01-15')", ids),
        { code: "23503" },
      );
    }
    await assert.rejects(client.query("UPDATE ausleihe SET user_id = -1 WHERE id = $1", [activeLoanId]), { code: "23503" });
    await assert.rejects(client.query("UPDATE ausleihe SET exemplar_id = -1 WHERE id = $1", [activeLoanId]), { code: "23503" });
  });

  await t.test("Ausleihen brauchen Benutzer, Exemplar und beide Pflichtdaten", async () => {
    for (let index = 0; index < 4; index++) {
      const values = [userId, copyId, "2025-01-01", "2025-01-31", "2025-01-15"];
      values[index] = null;
      await assert.rejects(
        client.query("INSERT INTO ausleihe (user_id, exemplar_id, loan_date, due_date, return_date) VALUES ($1, $2, $3, $4, $5)", values),
        { code: "23502" },
      );
    }
  });

  await t.test("Ungültige Kalenderdaten und Daten vor dem Ausleihdatum werden abgelehnt", async () => {
    for (const dates of [
      ["2025-01-02", "2025-01-01", "2025-01-03"],
      ["2025-01-02", "2025-02-01", "2025-01-01"],
    ]) {
      await assert.rejects(
        client.query("INSERT INTO ausleihe (user_id, exemplar_id, loan_date, due_date, return_date) VALUES ($1, $2, $3, $4, $5)", [userId, copyId, ...dates]),
        { code: "23514" },
      );
    }
    await assert.rejects(
      client.query("INSERT INTO ausleihe (user_id, exemplar_id, loan_date, due_date) VALUES ($1, $2, '2026-02-30', '2026-03-30')", [userId, copyId]),
      { code: "22008" },
    );
    await assert.rejects(client.query("UPDATE ausleihe SET due_date = '2025-12-31' WHERE id = $1", [activeLoanId]),
      { code: "23514" });
    await assert.rejects(client.query("UPDATE ausleihe SET return_date = '2025-12-31' WHERE id = $1", [activeLoanId]),
      { code: "23514" });
    await client.query(
      "INSERT INTO ausleihe (user_id, exemplar_id, loan_date, due_date, return_date) VALUES ($1, $2, '2025-01-01', '2025-01-01', '2025-01-01')", [userId, copyId],
    );
  });

  await t.test("Fremdschlüssel schützen auch historische Ausleihen vor kaskadierendem Löschen", async () => {
    await assert.rejects(client.query("DELETE FROM users WHERE id = $1", [userId]), { code: "23001" });
    await assert.rejects(client.query("DELETE FROM exemplar WHERE id = $1", [copyId]), { code: "23001" });
    const result = await client.query("SELECT id FROM ausleihe WHERE id = $1", [activeLoanId]);
    assert.equal(result.rowCount, 1);
  });

  await t.test("Kein available-Feld; erneute Migration erhält Benutzer und Ausleihhistorie", async () => {
    const columns = await client.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = $1 AND table_name IN ('exemplar', 'ausleihe') AND column_name = 'available'`, [schema],
    );
    assert.equal(columns.rowCount, 0);
    const beforeUsers = await client.query("SELECT * FROM users ORDER BY id");
    const beforeLoans = await client.query("SELECT * FROM ausleihe ORDER BY id");
    assert.deepEqual(await runMigrations(client, directory), []);
    assert.deepEqual((await client.query("SELECT * FROM users ORDER BY id")).rows, beforeUsers.rows);
    assert.deepEqual((await client.query("SELECT * FROM ausleihe ORDER BY id")).rows, beforeLoans.rows);
  });
});
