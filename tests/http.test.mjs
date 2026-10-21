import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import net from "node:net";
import path from "node:path";
import os from "node:os";
import { mkdtemp, rm } from "node:fs/promises";
import sharp from "sharp";
import { encode } from "next-auth/jwt";
import test from "node:test";
import { createInitialAdmin } from "../lib/users.mjs";
import { testDatabase } from "./helpers/database.mjs";

test("Produktionsserver: Anmeldung, Katalog, Admin-Verwaltung und Cover", { timeout: 60000 }, async (t) => {
  let server;
  let coversDirectory;
  t.after(async () => {
    if (server && server.exitCode === null) {
      const exited = once(server, "exit");
      server.kill();
      await exited;
    }
    if (coversDirectory) {
      assert.ok(coversDirectory.startsWith(path.resolve(os.tmpdir()) + path.sep));
      await rm(coversDirectory, { recursive: true, force: true });
    }
  });
  coversDirectory = await mkdtemp(path.join(os.tmpdir(), "bibliothek-http-covers-"));
  const { db, schema } = await testDatabase(t);
  const password = "Nur ein isoliertes Testpasswort 123!";
  const client = await db.connect();
  let admin;
  try {
    admin = await createInitialAdmin(client, { name: "HTTP Admin", email: "http@example.test", password });
  } finally {
    client.release();
  }
  const book = await db.query("INSERT INTO books (title, author, isbn) VALUES ('HTTP-Testbuch', 'Testautor', '9780201633610') RETURNING id");
  await db.query("INSERT INTO exemplar (inventory_number, location, book_id) VALUES ('HTTP-1', 'Testregal', $1)", [book.rows[0].id]);

  const listener = net.createServer();
  listener.listen(0, "127.0.0.1");
  await once(listener, "listening");
  const port = listener.address().port;
  await new Promise((resolve) => listener.close(resolve));
  const base = `http://127.0.0.1:${port}`;
  const root = path.resolve(import.meta.dirname, "..");
  const secret = randomBytes(32).toString("base64");
  server = spawn(process.execPath, [path.join(root, "node_modules/next/dist/bin/next"), "start", "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: root,
    windowsHide: true,
    env: {
      ...process.env, NODE_ENV: "production", NEXTAUTH_URL: base,
      NEXTAUTH_SECRET: secret,
      PGOPTIONS: `-c search_path=${schema}`,
      COVER_UPLOAD_DIR: coversDirectory,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  const capture = (chunk) => { output = (output + chunk.toString()).slice(-6000); };
  server.stdout.on("data", capture);
  server.stderr.on("data", capture);
  let ready = false;
  for (let attempt = 0; attempt < 80; attempt++) {
    if (server.exitCode !== null) throw new Error(`Testserver beendet: ${output}`);
    try {
      if ((await fetch(`${base}/api/auth/providers`)).ok) { ready = true; break; }
    } catch { /* Der Server startet noch. */ }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  assert.ok(ready, `Testserver nicht bereit: ${output}`);
  const home = await fetch(base);
  assert.equal(home.status, 200);
  assert.match(await home.text(), /Medienkatalog/);
  for (const url of ["/admin", "/meine-ausleihen"]) {
    const protectedPage = await fetch(base + url, { redirect: "manual" });
    assert.equal(protectedPage.status, 307);
    assert.equal(protectedPage.headers.get("location"), "/login");
  }

  const cookies = new Map();
  async function request(url, options = {}) {
    const response = await fetch(base + url, {
      ...options, redirect: "manual",
      headers: { ...options.headers, Cookie: [...cookies].map(([key, value]) => `${key}=${value}`).join("; ") },
    });
    for (const cookie of response.headers.getSetCookie()) {
      const [pair] = cookie.split(";");
      const index = pair.indexOf("=");
      const key = pair.slice(0, index);
      const value = pair.slice(index + 1);
      if (value) cookies.set(key, value); else cookies.delete(key);
    }
    return response;
  }
  async function login(email, enteredPassword) {
    const csrf = await (await request("/api/auth/csrf")).json();
    return request("/api/auth/callback/credentials", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ csrfToken: csrf.csrfToken, email, password: enteredPassword, json: "true" }),
    });
  }

  assert.deepEqual(await (await request("/api/auth/session")).json(), {});
  for (const [url, method] of [["/api/loans", "GET"], ["/api/loans", "POST"], ["/api/admin/loans", "GET"], ["/api/admin/loans/1/return", "POST"]]) {
    assert.equal((await request(url, { method })).status, 401);
  }
  const writes = ["/api/admin/books", "/api/admin/cd-dvd", "/api/admin/exemplars", "/api/admin/users"];
  for (const url of writes) assert.equal((await request(url, { method: "POST" })).status, 401);
  assert.equal((await request(`/api/admin/media/book/${book.rows[0].id}/cover`, { method: "PUT" })).status, 401);
  // Auch richtige Zugangsdaten dürfen die CSRF-Prüfung nicht umgehen.
  await request("/api/auth/callback/credentials", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ email: "http@example.test", password, json: "true" }),
  });
  assert.deepEqual(await (await request("/api/auth/session")).json(), {});
  assert.equal((await login("http@example.test", "falsch")).status, 401);
  assert.equal((await login("unknown@example.test", password)).status, 401);
  const signedIn = await login(" HTTP@EXAMPLE.TEST ", password);
  assert.equal(signedIn.status, 200);
  const sessionCookie = signedIn.headers.getSetCookie().find((cookie) => cookie.startsWith("next-auth.session-token="));
  assert.match(sessionCookie, /HttpOnly/i);
  assert.match(sessionCookie, /SameSite=Lax/i);
  const session = await (await request("/api/auth/session")).json();
  assert.equal(session.user.id, admin.id);
  assert.equal(session.user.role, "ADMIN");
  assert.equal(JSON.stringify(session).includes("password"), false);
  const adminPage = await request("/admin");
  assert.equal(adminPage.status, 200);
  assert.match(await adminPage.text(), /Aktive Ausleihen/);
  assert.match(await (await request("/admin?bereich=medien")).text(), /Medium hinzufügen/);
  assert.match(await (await request("/admin?bereich=exemplare")).text(), /Exemplare/);
  assert.match(await (await request("/admin?bereich=benutzer")).text(), /Benutzer hinzufügen/);
  const myLoansPage = await request("/meine-ausleihen");
  assert.equal(myLoansPage.status, 200);
  assert.match(await myLoansPage.text(), /Aktive Ausleihen[\s\S]*Ausleihhistorie/);
  const unsafeReturn = await request("/login?next=%2F%2Ffremd.example");
  assert.equal(unsafeReturn.status, 307);
  assert.equal(unsafeReturn.headers.get("location"), "/admin");
  async function adminRequest(url, data, method = "POST") {
    return request(url, { method, headers: { Origin: base, "Content-Type": "application/json" }, body: JSON.stringify(data) });
  }
  const deniedOrigin = await request("/api/admin/books", { method: "POST", headers: { Origin: "https://fremd.example", "Content-Type": "application/json" }, body: "{}" });
  assert.equal(deniedOrigin.status, 403);
  assert.equal((await request("/api/admin/books", { method: "POST" })).status, 403);
  assert.equal((await request("/api/admin/books", { method: "POST", headers: { Origin: base, "Content-Type": "application/json" }, body: "{" })).status, 400);
  assert.equal((await adminRequest("/api/admin/books", { title: "Ungültig", author: "A", isbn: "falsch" })).status, 400);
  const createdBook = await adminRequest("/api/admin/books", { title: "Adminbuch", author: "Autor", isbn: "978-0-13-235088-4" });
  assert.equal(createdBook.status, 201);
  const managedBook = await createdBook.json();
  assert.equal(managedBook.isbn, "9780132350884");
  assert.equal((await adminRequest("/api/admin/books", { title: "Duplikat", author: "A", isbn: managedBook.isbn })).status, 409);
  assert.equal((await adminRequest(`/api/admin/books/${managedBook.id}`, { title: "Bearbeitet" }, "PATCH")).status, 200);
  assert.equal((await request(`/api/admin/books/${managedBook.id}`)).status, 200);
  const discResponse = await adminRequest("/api/admin/cd-dvd", { title: "Musik", media_type: "CD" });
  assert.equal(discResponse.status, 201);
  const disc = await discResponse.json();
  assert.equal((await adminRequest(`/api/admin/cd-dvd/${disc.id}`, { title: "Musik bearbeitet" }, "PATCH")).status, 200);
  assert.equal((await request(`/api/admin/cd-dvd/${disc.id}`)).status, 200);
  const dvdResponse = await adminRequest("/api/admin/cd-dvd", { title: "Testfilm", media_type: "DVD" });
  assert.equal(dvdResponse.status, 201);
  const dvd = await dvdResponse.json();
  for (const [medium, type] of [[disc, "cd"], [dvd, "dvd"]]) {
    const exemplar = await adminRequest("/api/admin/exemplars", { inventory_number: `HTTP-${type}`, location: "D", cd_dvd_id: medium.id });
    assert.equal(exemplar.status, 201);
    const catalogEntry = await (await request(`/api/catalog/${type}/${medium.id}`)).json();
    assert.equal(catalogEntry.total_copies, 1);
    assert.equal(catalogEntry.available_copies, 1);
    const filtered = await (await request(`/api/catalog?type=${type}`)).json();
    assert.equal(filtered.total, 1);
    assert.equal(filtered.items[0].id, medium.id);
  }
  const copyResponse = await adminRequest("/api/admin/exemplars", { inventory_number: "ADMIN-1", location: "A", book_id: managedBook.id });
  assert.equal(copyResponse.status, 201);
  const copy = await copyResponse.json();
  assert.equal((await adminRequest(`/api/admin/exemplars/${copy.id}`, { location: "B" }, "PATCH")).status, 200);
  assert.equal((await (await request(`/api/admin/exemplars?book_id=${managedBook.id}`)).json()).total, 1);
  const userResponse = await adminRequest("/api/admin/users", { name: "Neu", email: "neu@example.test", password: "Neues sicheres Passwort!", role: "USER" });
  assert.equal(userResponse.status, 201);
  const managedUser = await userResponse.json();
  assert.equal("password_hash" in managedUser, false);
  assert.equal((await adminRequest(`/api/admin/users/${managedUser.id}`, { name: "Bearbeitet" }, "PATCH")).status, 200);
  const usersResponse = await request("/api/admin/users?pageSize=1");
  assert.equal(usersResponse.status, 200);
  const users = await usersResponse.json();
  assert.equal(users.items.length, 1);
  assert.equal(JSON.stringify(users).includes("password"), false);
  const secondCopyResponse = await adminRequest("/api/admin/exemplars", { inventory_number: "LOAN-HTTP-2", location: "C", book_id: managedBook.id });
  const secondCopy = await secondCopyResponse.json();
  const borrowed = await adminRequest("/api/loans", { exemplar_id: copy.id });
  assert.equal(borrowed.status, 201);
  const adminLoan = await borrowed.json();
  assert.equal(adminLoan.user_id, admin.id);
  assert.equal((await (await request(`/api/catalog/book/${managedBook.id}`)).json()).available_copies, 1);
  assert.equal((await login(managedUser.email, "Neues sicheres Passwort!")).status, 200);
  const forbiddenPage = await request("/admin");
  assert.equal(forbiddenPage.status, 307);
  assert.equal(forbiddenPage.headers.get("location"), "/");
  assert.equal((await (await request("/api/loans")).json()).total, 0);
  assert.equal((await request(`/api/loans?user_id=${admin.id}`)).status, 400);
  assert.equal((await adminRequest("/api/loans", { exemplar_id: secondCopy.id, user_id: admin.id })).status, 400);
  assert.equal((await adminRequest("/api/loans", { exemplar_id: secondCopy.id, due_date: "2099-01-01" })).status, 400);
  assert.equal((await request("/api/loans", { method: "POST" })).status, 403);
  assert.equal((await adminRequest("/api/loans", { exemplar_id: "abc" })).status, 400);
  assert.equal((await adminRequest("/api/loans", { exemplar_id: "999999" })).status, 404);
  assert.equal((await adminRequest("/api/loans", { exemplar_id: copy.id })).status, 409);
  const attempts = await Promise.all([adminRequest("/api/loans", { exemplar_id: secondCopy.id }), adminRequest("/api/loans", { exemplar_id: secondCopy.id })]);
  assert.deepEqual(attempts.map((response) => response.status).sort(), [201, 409]);
  const userLoan = await attempts.find((response) => response.status === 201).json();
  assert.equal(userLoan.user_id, managedUser.id);
  const ownLoans = await (await request("/api/loans")).json();
  assert.equal(ownLoans.total, 1);
  assert.ok(ownLoans.items.every((loan) => loan.user_id === managedUser.id));
  assert.equal("user_email" in ownLoans.items[0], false);
  assert.equal((await request("/api/admin/loans")).status, 403);
  assert.equal((await adminRequest(`/api/admin/loans/${userLoan.id}/return`)).status, 403);
  await db.query("UPDATE ausleihe SET loan_date = CURRENT_DATE - 31, due_date = CURRENT_DATE - 1 WHERE id = $1", [userLoan.id]);
  assert.equal((await (await request("/api/loans?status=overdue")).json()).total, 1);
  assert.equal((await login("http@example.test", password)).status, 200);
  assert.equal((await (await request("/api/admin/loans")).json()).total, 2);
  const overdue = await (await request("/api/admin/loans?status=overdue")).json();
  assert.equal(overdue.total, 1);
  assert.equal(overdue.items[0].user_email, managedUser.email);
  assert.equal(JSON.stringify(overdue).includes("password"), false);
  const returned = await adminRequest(`/api/admin/loans/${userLoan.id}/return`);
  assert.equal(returned.status, 200);
  assert.match((await returned.json()).return_date, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal((await adminRequest(`/api/admin/loans/${userLoan.id}/return`)).status, 409);
  assert.equal((await adminRequest(`/api/admin/loans/${adminLoan.id}/return`)).status, 200);
  assert.equal((await (await request("/api/admin/loans?status=history")).json()).total, 2);
  assert.equal((await (await request("/api/loans?status=history")).json()).total, 1);
  const borrowedAgain = await adminRequest("/api/loans", { exemplar_id: copy.id });
  assert.equal(borrowedAgain.status, 201);
  assert.equal((await adminRequest(`/api/admin/loans/${(await borrowedAgain.json()).id}/return`)).status, 200);
  async function upload(buffer, mime = "image/png") {
    const data = new FormData();
    data.set("file", new Blob([buffer], { type: mime }), "../../untrusted-name.png");
    return request(`/api/admin/media/book/${managedBook.id}/cover`, { method: "PUT", headers: { Origin: base }, body: data });
  }
  const png = await sharp({ create: { width: 2, height: 2, channels: 3, background: "blue" } }).png().toBuffer();
  for (const [medium, type] of [[disc, "cd"], [dvd, "dvd"]]) {
    const form = new FormData();
    form.set("file", new Blob([png], { type: "image/png" }), "cover.png");
    const response = await request(`/api/admin/media/${type}/${medium.id}/cover`, { method: "PUT", headers: { Origin: base }, body: form });
    assert.equal(response.status, 200);
    const filename = (await response.json()).cover_image_path;
    const detail = await (await request(`/api/catalog/${type}/${medium.id}`)).json();
    assert.equal(detail.cover_image_path, filename);
    const image = await request(`/api/covers/${filename}`);
    assert.equal(image.status, 200);
    const metadata = await sharp(Buffer.from(await image.arrayBuffer())).metadata();
    assert.equal(metadata.format, "webp");
    assert.equal(metadata.width, 2);
  }
  assert.equal((await upload(Buffer.from("kein Bild"))).status, 415);
  assert.equal((await upload(Buffer.alloc(5 * 1024 * 1024 + 1))).status, 413);
  const uploaded = await upload(png, "text/plain");
  assert.equal(uploaded.status, 200);
  const firstCover = (await uploaded.json()).cover_image_path;
  const cover = await request(`/api/covers/${firstCover}`);
  assert.equal(cover.status, 200);
  assert.equal(cover.headers.get("content-type"), "image/webp");
  const secondCover = (await (await upload(png)).json()).cover_image_path;
  assert.notEqual(firstCover, secondCover);
  assert.equal((await request(`/api/covers/${firstCover}`)).status, 404);
  assert.equal((await request(`/api/admin/media/book/${managedBook.id}/cover`, { method: "DELETE", headers: { Origin: base } })).status, 200);
  assert.equal((await request(`/api/covers/${secondCover}`)).status, 404);
  assert.equal((await adminRequest(`/api/admin/users/${admin.id}`, { role: "USER" }, "PATCH")).status, 200);
  assert.equal((await (await request("/api/auth/session")).json()).user.role, "USER");
  for (const url of writes) assert.equal((await adminRequest(url, {})).status, 403);
  for (const url of [`/api/admin/books/${managedBook.id}`, `/api/admin/cd-dvd/${disc.id}`, `/api/admin/exemplars/${copy.id}`, `/api/admin/users/${managedUser.id}`]) {
    assert.equal((await adminRequest(url, {}, "PATCH")).status, 403);
  }
  assert.equal((await request("/api/admin/users")).status, 403);
  for (const url of [`/api/admin/books/${managedBook.id}`, `/api/admin/cd-dvd/${disc.id}`, `/api/admin/exemplars?book_id=${managedBook.id}`]) {
    assert.equal((await request(url)).status, 403);
  }
  assert.equal((await upload(png)).status, 403);
  assert.equal((await request(`/api/admin/media/book/${managedBook.id}/cover`, { method: "DELETE", headers: { Origin: base } })).status, 403);

  const csrf = await (await request("/api/auth/csrf")).json();
  await request("/api/auth/signout", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ csrfToken: csrf.csrfToken, json: "true" }),
  });
  assert.equal(cookies.has("next-auth.session-token"), false);
  assert.deepEqual(await (await request("/api/auth/session")).json(), {});
  cookies.set("next-auth.session-token", "invalid-session");
  assert.deepEqual(await (await request("/api/auth/session")).json(), {});
  cookies.set("next-auth.session-token", await encode({ token: { sub: admin.id }, secret, maxAge: -60 }));
  assert.deepEqual(await (await request("/api/auth/session")).json(), {});
  assert.equal((await request("/api/loans")).status, 401);

  const list = await request("/api/catalog?type=book&q=Testautor&pageSize=1");
  assert.equal(list.status, 200);
  const catalog = await list.json();
  assert.equal(catalog.total, 1);
  assert.equal(catalog.items[0].available_copies, 1);
  const detail = await request(`/api/catalog/book/${book.rows[0].id}`);
  assert.equal(detail.status, 200);
  const medium = await detail.json();
  assert.equal(medium.exemplars[0].available, true);
  assert.equal(JSON.stringify(medium).includes("http@example.test"), false);
  for (const url of ["/api/catalog?pageSize=101", "/api/catalog?type=invalid", "/api/catalog/book/abc", "/api/catalog?isbn=9780306406158"]) {
    const response = await request(url);
    assert.equal(response.status, 400);
    assert.equal(typeof (await response.json()).error, "string");
  }
  assert.equal((await request("/api/catalog/book/999999")).status, 404);
  assert.equal((await request("/api/catalog", { method: "POST" })).status, 405);
  assert.equal((await (await request("/api/catalog?q=--")).json()).total, 0);
  const deletedUser = await db.query("INSERT INTO users (name, email, password_hash, role) SELECT 'Sessionfixture', 'deleted@example.test', password_hash, 'USER' FROM users WHERE id = $1 RETURNING id", [managedUser.id]);
  assert.equal((await login("deleted@example.test", "Neues sicheres Passwort!")).status, 200);
  await db.query("DELETE FROM users WHERE id = $1", [deletedUser.rows[0].id]);
  assert.equal((await (await request("/api/auth/session")).json()).user, null);
  assert.equal((await request("/api/loans")).status, 401);
});
