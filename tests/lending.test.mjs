import assert from "node:assert/strict";
import test from "node:test";
import { testDatabase } from "./helpers/database.mjs";
import { createLoan, returnLoan, listLoansForUser, listLoansForAdmin, parseLoanQuery } from "../lib/loans.mjs";
import { getMedium } from "../lib/catalog.mjs";

async function fixtures(t) {
  const database = await testDatabase(t);
  const { client } = database;
  const users = await client.query("INSERT INTO users (name, email, password_hash, role) VALUES ('Eins', 'one@example.test', '$argon2id$fixture', 'USER'), ('Zwei', 'two@example.test', '$argon2id$fixture', 'USER') RETURNING id");
  const book = await client.query("INSERT INTO books (title, author, isbn) VALUES ('Ausleihbuch', 'Autor', '9780306406157') RETURNING id");
  const copies = await client.query("INSERT INTO exemplar (inventory_number, location, book_id) VALUES ('LOAN-1', 'A', $1), ('LOAN-2', 'B', $1) RETURNING id", [book.rows[0].id]);
  return { ...database, users: users.rows, book: book.rows[0], copies: copies.rows };
}

test("Ausleihe und Rückgabe erhalten Historie und berechnen 30 Kalendertage", async (t) => {
  const { client, db, users, book, copies } = await fixtures(t);
  // Auch bei abweichender SQL-Sitzungszeitzone gilt Europe/Zurich.
  await client.query("SET TIME ZONE 'Pacific/Honolulu'");
  const loan = await createLoan(client, users[0].id, copies[0].id);
  assert.equal(loan.user_id, users[0].id);
  assert.equal(loan.return_date, null);
  const dates = await client.query("SELECT (statement_timestamp() AT TIME ZONE 'Europe/Zurich')::date AS today, due_date - loan_date AS days FROM ausleihe WHERE id = $1", [loan.id]);
  assert.equal(loan.loan_date, dates.rows[0].today);
  assert.equal(dates.rows[0].days, 30);
  assert.equal(typeof loan.due_date, "string");
  assert.equal((await getMedium(db, "book", book.id, { page: 1, pageSize: 20 })).available_copies, 1);
  await assert.rejects(createLoan(db, users[1].id, copies[0].id), { status: 409 });
  await assert.rejects(createLoan(db, users[0].id, "ungültig"), { status: 400 });
  await assert.rejects(createLoan(db, users[0].id, "999999"), { status: 404 });
  const returned = await returnLoan(client, loan.id);
  assert.equal(returned.return_date, dates.rows[0].today);
  assert.equal((await getMedium(db, "book", book.id, { page: 1, pageSize: 20 })).available_copies, 2);
  await assert.rejects(returnLoan(db, loan.id), { status: 409 });
  await assert.rejects(returnLoan(db, "999999"), { status: 404 });
  await createLoan(db, users[1].id, copies[0].id);
  const history = await client.query("SELECT * FROM ausleihe WHERE exemplar_id = $1 ORDER BY id", [copies[0].id]);
  assert.equal(history.rowCount, 2);
  assert.deepEqual(history.rows[0], returned);
});

test("Gleichzeitige Ausleihen und Rückgaben lassen jeweils nur einen Erfolg zu", async (t) => {
  const { db, users, copies } = await fixtures(t);
  const attempts = await Promise.allSettled(users.map((user) => createLoan(db, user.id, copies[0].id)));
  const successful = attempts.filter((result) => result.status === "fulfilled");
  const rejected = attempts.filter((result) => result.status === "rejected");
  assert.equal(successful.length, 1);
  assert.equal(rejected.length, 1);
  assert.equal(rejected[0].reason.status, 409);
  assert.match(rejected[0].reason.message, /bereits ausgeliehen/);
  assert.equal((await db.query("SELECT id FROM ausleihe WHERE exemplar_id = $1 AND return_date IS NULL", [copies[0].id])).rowCount, 1);
  const returns = await Promise.allSettled([returnLoan(db, successful[0].value.id), returnLoan(db, successful[0].value.id)]);
  assert.equal(returns.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(returns.find((result) => result.status === "rejected").reason.status, 409);
  assert.equal((await db.query("SELECT id FROM ausleihe WHERE exemplar_id = $1", [copies[0].id])).rowCount, 1);
});

test("Eigene und administrative Übersichten filtern, sortieren und erkennen Überfälligkeit", async (t) => {
  const { client, users, book, copies } = await fixtures(t);
  await client.query("SET TIME ZONE 'Pacific/Honolulu'");
  const today = "(statement_timestamp() AT TIME ZONE 'Europe/Zurich')::date";
  await client.query(`INSERT INTO ausleihe (user_id, exemplar_id, loan_date, due_date, return_date) VALUES
    ($1, $3, ${today} - 90, ${today} - 60, ${today} - 50),
    ($1, $3, ${today} - 60, ${today} - 30, ${today} - 10),
    ($1, $3, ${today} - 31, ${today} - 1, NULL),
    ($1, $4, ${today} - 30, ${today}, NULL),
    ($2, $4, ${today} - 90, ${today} - 60, ${today} - 55)`, [users[0].id, users[1].id, copies[0].id, copies[1].id]);
  const options = (status) => ({ status, page: 1, pageSize: 20 });
  const active = await listLoansForUser(client, users[0].id, options("active"));
  assert.equal(active.total, 2);
  assert.equal(active.items[0].overdue, true);
  assert.equal(active.items[1].overdue, false); // Am Fälligkeitstag noch nicht überfällig.
  assert.ok(active.items.every((loan) => loan.user_id === users[0].id && loan.media_id === book.id));
  assert.equal(active.items[0].inventory_number, "LOAN-1");
  assert.equal(active.items[0].title, "Ausleihbuch");
  assert.equal("user_email" in active.items[0], false);
  const history = await listLoansForUser(client, users[0].id, options("history"));
  assert.equal(history.total, 2);
  assert.ok(history.items[0].return_date > history.items[1].return_date);
  assert.ok(history.items.every((loan) => !loan.overdue));
  assert.equal((await listLoansForUser(client, users[1].id, options("active"))).total, 0);
  assert.equal((await listLoansForUser(client, users[1].id, options("history"))).total, 1);
  assert.equal((await listLoansForUser(client, users[0].id, options("overdue"))).total, 1);
  const admin = await listLoansForAdmin(client, options("history"));
  assert.equal(admin.total, 3);
  assert.equal(admin.items[0].user_name, "Eins");
  assert.equal(admin.items[0].user_email, "one@example.test");
  assert.equal(JSON.stringify(admin).includes("password"), false);
  assert.equal((await listLoansForAdmin(client, options("active"))).total, 2);
  assert.equal((await listLoansForAdmin(client, options("overdue"))).total, 1);
  const paged = await listLoansForAdmin(client, { status: "history", page: 2, pageSize: 1 });
  assert.equal(paged.total, 3);
  assert.equal(paged.items.length, 1);
});

test("Ausleihparameter erlauben nur Status und begrenzte Paginierung", () => {
  assert.deepEqual(parseLoanQuery(new URLSearchParams()), { status: "active", page: 1, pageSize: 20 });
  for (const query of ["user_id=2", "status=all", "status=active&status=history", "page=0", "pageSize=101"]) {
    assert.throws(() => parseLoanQuery(new URLSearchParams(query)), { status: 400 });
  }
});
