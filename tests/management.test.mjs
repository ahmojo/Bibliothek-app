import assert from "node:assert/strict";
import test from "node:test";
import { testDatabase } from "./helpers/database.mjs";
import { createBook, updateBook, createDisc, updateDisc } from "../lib/media.mjs";
import { createExemplar, updateExemplar, listExemplars } from "../lib/exemplars.mjs";
import { createUser, updateUser, listUsers } from "../lib/users.mjs";
import { verifyPassword } from "../lib/passwords.mjs";
import { validateId } from "../lib/validation.mjs";

test("BIGINT und DATE bleiben unabhängig von der Sitzungszeitzone Strings", async (t) => {
  const { client } = await testDatabase(t);
  for (const zone of ["Europe/Zurich", "Pacific/Honolulu"]) {
    await client.query("SELECT set_config('TimeZone', $1, false)", [zone]);
    const { rows } = await client.query("SELECT 9007199254740993::bigint AS id, DATE '2026-03-29' AS date");
    assert.deepEqual(rows[0], { id: "9007199254740993", date: "2026-03-29" });
  }
});

test("Zentrale ID-Prüfung akzeptiert nur positive BIGINT-Strings", () => {
  assert.equal(validateId("9007199254740993"), "9007199254740993");
  for (const id of [1, "0", "-1", "1.5", "01", "9223372036854775808", null]) {
    assert.throws(() => validateId(id), { status: 400 });
  }
});

test("Medien erstellen und partiell bearbeiten mit übergebenem DB-Client", async (t) => {
  const { client } = await testDatabase(t);
  const book = await createBook(client, { title: "Buch", author: "Autor", isbn: "978-0-306-40615-7" });
  assert.equal(book.isbn, "9780306406157");
  assert.equal(typeof book.id, "string");
  const changed = await updateBook(client, book.id, { title: "Neuer Titel", publication_year: 2020 });
  assert.equal(changed.title, "Neuer Titel");
  assert.equal(changed.author, "Autor");
  const disc = await createDisc(client, { title: "Musik", media_type: "CD" });
  assert.equal((await updateDisc(client, disc.id, { title: "Film", media_type: "DVD" })).media_type, "DVD");
  for (const data of [ { title: "", author: "Autor", isbn: "9780132350884" }, { title: "B", author: "A", isbn: "9780306406158" } ]) {
    await assert.rejects(createBook(client, data), { status: 400 });
  }
  await assert.rejects(createBook(client, { title: "Duplikat", author: "A", isbn: "978 0 306 40615 7" }), { code: "23505" });
  await assert.rejects(updateBook(client, book.id, { publication_year: -100 }), { status: 400 });
  await assert.rejects(updateBook(client, book.id, { cover_image_path: "manipuliert" }), { status: 400 });
  await assert.rejects(createDisc(client, { title: "Film", media_type: "VHS" }), { status: 400 });
  await assert.rejects(updateDisc(client, "99999", { title: "Fehlt" }), { status: 404 });
});

test("Benutzerverwaltung normalisiert E-Mails und liefert niemals Passwort-Hashes", async (t) => {
  const { client } = await testDatabase(t);
  const data = { name: "Leser", email: " USER@EXAMPLE.TEST ", password: "Ein gutes Testpasswort!", role: "USER" };
  const user = await createUser(client, data);
  assert.equal(user.email, "user@example.test");
  assert.equal("password_hash" in user, false);
  const changed = await updateUser(client, user.id, { name: "Neuer Name", role: "ADMIN", password: "Ein neues Testpasswort!" });
  assert.equal(changed.role, "ADMIN");
  assert.equal(changed.email, user.email);
  const stored = await client.query("SELECT password_hash FROM users WHERE id = $1", [user.id]);
  assert.equal(await verifyPassword("Ein neues Testpasswort!", stored.rows[0].password_hash), true);
  const listed = await listUsers(client, { page: 1, pageSize: 20 });
  assert.equal(listed.total, 1);
  assert.equal(JSON.stringify(listed).includes("password"), false);
  await assert.rejects(createUser(client, { ...data, email: "user@example.test" }), { code: "23505" });
  await assert.rejects(updateUser(client, user.id, { role: "admin" }), { status: 400 });
  await assert.rejects(updateUser(client, user.id, { password_hash: "Klartext" }), { status: 400 });
  await assert.rejects(updateUser(client, user.id, { email: "nul\0@example.test" }), { status: 400 });
});

test("Exemplare ändern und zuordnen, ohne bestehende Ausleihen umzuhängen", async (t) => {
  const { client, db } = await testDatabase(t);
  const first = await createBook(client, { title: "Eins", author: "A", isbn: "9780306406157" });
  const second = await createDisc(client, { title: "Zwei", media_type: "CD" });
  const copy = await createExemplar(client, { inventory_number: "INV-1", location: "A", book_id: first.id });
  assert.equal((await updateExemplar(db, copy.id, { location: "B", inventory_number: "INV-2" })).location, "B");
  await updateExemplar(client, copy.id, { book_id: null, cd_dvd_id: second.id });
  await assert.rejects(createExemplar(client, { inventory_number: "INV-2", location: "A", book_id: first.id }), { code: "23505" });
  await assert.rejects(createExemplar(client, { inventory_number: "INV-3", location: "A" }), { status: 400 });
  await assert.rejects(updateExemplar(client, copy.id, { book_id: first.id }), { status: 400 });
  const user = await createUser(client, { name: "Leser", email: "loan@example.test", password: "Ein gutes Testpasswort!", role: "USER" });
  await client.query("INSERT INTO ausleihe (user_id, exemplar_id, loan_date, due_date, return_date) VALUES ($1, $2, '2026-01-01', '2026-01-31', '2026-01-20')", [user.id, copy.id]);
  const before = (await client.query("SELECT * FROM ausleihe")).rows;
  await assert.rejects(updateExemplar(db, copy.id, { book_id: first.id, cd_dvd_id: null }), { status: 409 });
  await updateExemplar(client, copy.id, { location: "C" });
  assert.deepEqual((await client.query("SELECT * FROM ausleihe")).rows, before);
  const copies = await listExemplars(client, { cd_dvd_id: second.id }, { page: 1, pageSize: 20 });
  assert.equal(copies.items[0].available, true);
  await client.query("INSERT INTO ausleihe (user_id, exemplar_id, loan_date, due_date) VALUES ($1, $2, '2026-02-01', '2026-03-03')", [user.id, copy.id]);
  assert.equal((await listExemplars(client, { cd_dvd_id: second.id }, { page: 1, pageSize: 20 })).items[0].available, false);
});
