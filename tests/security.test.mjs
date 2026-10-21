import assert from "node:assert/strict";
import test from "node:test";
import { hashPassword, verifyPassword } from "../lib/passwords.mjs";
import { authenticateUser, getSessionUser, assertUser, createInitialAdmin } from "../lib/users.mjs";
import { testDatabase } from "./helpers/database.mjs";
import { spawnSync } from "node:child_process";

test("Passwort-Hashes sind gesalzen und prüfen nur das richtige Passwort", async () => {
  const password = "Ein langes Testpasswort 123!";
  const hash = await hashPassword(password);
  assert.match(hash, /^\$argon2id\$/);
  assert.notEqual(hash, await hashPassword(password));
  assert.equal(await verifyPassword(password, hash), true);
  assert.equal(await verifyPassword("Falsches Passwort", hash), false);
  assert.equal(await verifyPassword(password, "kein-hash"), false);
  await assert.rejects(hashPassword("kurz"));
  await assert.rejects(hashPassword("x".repeat(51)), /50 Zeichen/);
  assert.equal(await verifyPassword("x".repeat(51), hash), false);
  assert.equal(await verifyPassword("x".repeat(50), await hashPassword("x".repeat(50))), true);
  assert.equal(await verifyPassword("😀".repeat(50), await hashPassword("😀".repeat(50))), true);
});

test("Datenbankmodul erklärt eine fehlende DATABASE_URL", () => {
  const result = spawnSync(process.execPath, ["--conditions=react-server", "--input-type=module", "-e", "import './lib/db.js'"], {
    cwd: new URL("..", import.meta.url), env: { ...process.env, DATABASE_URL: "" }, encoding: "utf8", windowsHide: true,
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /DATABASE_URL fehlt/);
});

test("Anmeldung, aktueller Benutzer und Berechtigungen", async (t) => {
  const { db } = await testDatabase(t);
  const password = "Ein weiteres Testpasswort 123!";
  const client = await db.connect();
  let admin;
  try {
    admin = await createInitialAdmin(client, { name: "Admin", email: " ADMIN@example.test ", password });
    assert.equal(admin.email, "admin@example.test");
    await assert.rejects(createInitialAdmin(client, { name: "Zweiter", email: "other@example.test", password }), { status: 409 });
  } finally {
    client.release();
  }
  const user = await authenticateUser(db, { email: " Admin@EXAMPLE.test ", password });
  assert.equal(user.id, admin.id);
  assert.equal("password_hash" in user, false);
  assert.equal(await authenticateUser(db, { email: user.email, password: "falsch" }), null);
  assert.equal(await authenticateUser(db, { email: "unknown@example.test", password }), null);
  assert.equal(await authenticateUser(db, { email: [], password }), null);
  assert.equal(await getSessionUser(db, null), null);
  assert.equal(await getSessionUser(db, { user: { id: "ungueltig" } }), null);
  assert.throws(() => assertUser(null), { status: 401 });
  const session = { user: { id: admin.id, role: "ADMIN" } };
  assert.equal(assertUser(await getSessionUser(db, session), "ADMIN").role, "ADMIN");
  await db.query("UPDATE users SET role = 'USER' WHERE id = $1", [admin.id]);
  const current = await getSessionUser(db, session);
  assert.equal(current.role, "USER");
  assert.throws(() => assertUser(current, "ADMIN"), { status: 403 });
  assert.equal(assertUser(current).id, admin.id);
});
