import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import net from "node:net";
import path from "node:path";
import test from "node:test";
import { createInitialAdmin } from "../lib/users.mjs";
import { testDatabase } from "./helpers/database.mjs";

test("Produktionsserver: NextAuth-Login, Session, Logout und öffentliche Katalog-API", { timeout: 60000 }, async (t) => {
  let server;
  t.after(async () => {
    if (server && server.exitCode === null) {
      const exited = once(server, "exit");
      server.kill();
      await exited;
    }
  });
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
  server = spawn(process.execPath, [path.join(root, "node_modules/next/dist/bin/next"), "start", "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: root,
    windowsHide: true,
    env: {
      ...process.env, NODE_ENV: "production", NEXTAUTH_URL: base,
      NEXTAUTH_SECRET: randomBytes(32).toString("base64"),
      PGOPTIONS: `-c search_path=${schema}`,
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
  assert.match(await home.text(), /Datenbankverbindung erfolgreich/);

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
  await db.query("UPDATE users SET role = 'USER' WHERE id = $1", [admin.id]);
  assert.equal((await (await request("/api/auth/session")).json()).user.role, "USER");

  const csrf = await (await request("/api/auth/csrf")).json();
  await request("/api/auth/signout", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ csrfToken: csrf.csrfToken, json: "true" }),
  });
  assert.equal(cookies.has("next-auth.session-token"), false);
  assert.deepEqual(await (await request("/api/auth/session")).json(), {});
  cookies.set("next-auth.session-token", "invalid-session");
  assert.deepEqual(await (await request("/api/auth/session")).json(), {});

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
});
