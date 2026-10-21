import assert from "node:assert/strict";
import test from "node:test";
import { parseCatalogQuery, listCatalog, getMedium } from "../lib/catalog.mjs";
import { testDatabase } from "./helpers/database.mjs";

test("Suchparameter werden begrenzt und validiert", () => {
  for (const query of ["type=other", "page=0", "page=1.5", "pageSize=101", "q=a&q=b", "unknown=x", `q=${"x".repeat(201)}`]) {
    assert.throws(() => parseCatalogQuery(new URLSearchParams(query)), { status: 400 });
  }
  assert.deepEqual(parseCatalogQuery(new URLSearchParams()), { type: "all", q: "", isbn: "", page: 1, pageSize: 20 });
  assert.throws(() => parseCatalogQuery(new URLSearchParams("isbn=9780306406158")), { status: 400 });
});

test("Katalogsuche, Typen, Exemplare und Verfügbarkeit", async (t) => {
  const { db } = await testDatabase(t);
  const books = await db.query("INSERT INTO books (title, author, isbn) VALUES ('Testwald', 'Ada Beispiel', '9780306406157'), ('Ohne Exemplar', 'Andere', '9780132350884') RETURNING id");
  const discs = await db.query("INSERT INTO cd_dvd (title, media_type) VALUES ('Testmusik', 'CD'), ('Testfilm', 'DVD') RETURNING id");
  const copies = await db.query("INSERT INTO exemplar (inventory_number, location, book_id, cd_dvd_id) VALUES ('T-1', 'A', $1, NULL), ('T-2', 'A', $1, NULL), ('T-3', 'B', NULL, $2) RETURNING id", [books.rows[0].id, discs.rows[0].id]);
  const user = await db.query("INSERT INTO users (name, email, password_hash, role) VALUES ('Test', 'test@example.test', '$argon2id$test-fixture', 'USER') RETURNING id");
  await db.query("INSERT INTO ausleihe (user_id, exemplar_id, loan_date, due_date, return_date) VALUES ($1, $2, '2026-01-01', '2026-01-31', '2026-01-15'), ($1, $3, '2026-02-01', '2026-03-03', NULL)", [user.rows[0].id, copies.rows[0].id, copies.rows[1].id]);

  const search = (query) => listCatalog(db, parseCatalogQuery(new URLSearchParams(query)));
  assert.equal((await search("")).total, 4);
  for (const [type, count] of [["book", 2], ["cd", 1], ["dvd", 1]]) {
    const result = await search(`type=${type}`);
    assert.equal(result.total, count);
    assert.ok(result.items.every((item) => item.type === type));
  }
  for (const q of ["wald", "Ada", "9780306406157"]) {
    const result = await search(`q=${q}`);
    assert.equal(result.total, 1);
    assert.equal(result.items[0].id, books.rows[0].id);
  }
  assert.equal((await search("q=%27%20OR%201%3D1--")).total, 0);
  assert.equal((await search("q=%25")).total, 0);
  for (const q of ["-", "--", "- -"]) {
    assert.equal((await search(`q=${encodeURIComponent(q)}`)).total, 0);
  }
  await db.query("UPDATE books SET title = 'Test-wald' WHERE id = $1", [books.rows[0].id]);
  const hyphen = await search("q=-");
  assert.equal(hyphen.total, 1);
  assert.equal(hyphen.items[0].id, books.rows[0].id);
  assert.equal((await search("isbn=978-0-306-40615-7")).total, 1);
  assert.equal((await search("q=978-0-306-40615-7")).total, 1);
  const page1 = await search("pageSize=1");
  const page2 = await search("pageSize=1&page=2");
  assert.equal(page2.total, 4);
  assert.notDeepEqual(page1.items, page2.items);
  assert.deepEqual((await search("page=10")).items, []);
  const detail = await getMedium(db, "book", books.rows[0].id, { page: 1, pageSize: 20 });
  assert.equal(detail.total_copies, 2);
  assert.equal(detail.available_copies, 1);
  assert.deepEqual(detail.exemplars.map((copy) => copy.available), [true, false]);
  assert.equal("user_id" in detail.exemplars[1], false);
  const empty = await getMedium(db, "book", books.rows[1].id, { page: 1, pageSize: 20 });
  assert.equal(empty.total_copies, 0);
  assert.deepEqual(empty.exemplars, []);
  await assert.rejects(getMedium(db, "book", "999999", { page: 1, pageSize: 20 }), { status: 404 });
  await assert.rejects(getMedium(db, "other", "1", { page: 1, pageSize: 20 }), { status: 400 });
  await assert.rejects(getMedium(db, "book", "9223372036854775808", { page: 1, pageSize: 20 }), { status: 400 });
});
