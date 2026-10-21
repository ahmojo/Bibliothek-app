import "server-only";
import { randomBytes } from "node:crypto";
import { hashPassword, verifyPassword } from "./passwords.mjs";
import { HttpError } from "./http.mjs";
import { isId, validateId, validateFields, text } from "./validation.mjs";

let dummyHash;

export function normalizeEmail(value) {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  if (email.length > 254 || email.includes("\0") || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

export async function authenticateUser(db, credentials) {
  const email = normalizeEmail(credentials?.email);
  const password = credentials?.password;
  if (!email || typeof password !== "string" || [...password].length > 50) return null;
  const result = await db.query(
    "SELECT id, name, email, role, password_hash FROM users WHERE LOWER(email) = $1", [email],
  );
  const user = result.rows[0];
  // Auch unbekannte E-Mails durchlaufen eine echte Passwortprüfung.
  if (!user && !dummyHash) dummyHash = hashPassword(randomBytes(24).toString("hex"));
  const hash = user ? user.password_hash : await dummyHash;
  const valid = await verifyPassword(password, hash);
  if (!user || !valid) return null;
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}

export async function getSessionUser(db, session) {
  const id = session?.user?.id;
  if (!isId(id)) return null;
  const result = await db.query("SELECT id, name, email, role FROM users WHERE id = $1", [id]);
  return result.rows[0] || null;
}

async function userValues(data, partial = false) {
  validateFields(data, ["name", "email", "password", "role"]);
  const values = {};
  if (!partial || "name" in data) values.name = text(data.name, "name", 200);
  if (!partial || "email" in data) {
    values.email = normalizeEmail(data.email);
    if (!values.email) throw new HttpError(400, "Bitte eine gültige E-Mail-Adresse angeben.");
  }
  if (!partial || "role" in data) {
    if (!["USER", "ADMIN"].includes(data.role)) throw new HttpError(400, "role muss USER oder ADMIN sein.");
    values.role = data.role;
  }
  if (!partial || "password" in data) values.password_hash = await hashPassword(data.password);
  return values;
}

export async function createUser(db, data) {
  const values = await userValues(data);
  const result = await db.query(
    "INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id, name, email, role",
    [values.name, values.email, values.password_hash, values.role],
  );
  return result.rows[0];
}

export async function updateUser(db, id, data) {
  validateId(id);
  const values = await userValues(data, true);
  const assignments = Object.keys(values).map((field, index) => `${field} = $${index + 2}`);
  const result = await db.query(`UPDATE users SET ${assignments.join(", ")} WHERE id = $1 RETURNING id, name, email, role`, [id, ...Object.values(values)]);
  if (!result.rowCount) throw new HttpError(404, "Benutzer nicht gefunden.");
  return result.rows[0];
}

export async function listUsers(db, { page, pageSize }) {
  const total = await db.query("SELECT count(*)::integer AS total FROM users");
  const result = await db.query("SELECT id, name, email, role FROM users ORDER BY id LIMIT $1 OFFSET $2", [pageSize, (page - 1) * pageSize]);
  return { items: result.rows, total: total.rows[0].total, page, pageSize };
}

export function assertUser(user, role) {
  if (!user) throw new HttpError(401, "Bitte zuerst anmelden.");
  if (role && user.role !== role) throw new HttpError(403, "Dafür fehlt die Berechtigung.");
  return user;
}

export async function createInitialAdmin(client, { name, email, password }) {
  const normalizedEmail = normalizeEmail(email);
  if (typeof name !== "string" || !name.trim() || name.length > 200 || !normalizedEmail) {
    throw new HttpError(400, "Bitte einen Namen und eine gültige E-Mail-Adresse angeben.");
  }
  const hash = await hashPassword(password);
  await client.query("BEGIN");
  try {
    await client.query("LOCK TABLE users IN EXCLUSIVE MODE");
    const existing = await client.query("SELECT id FROM users WHERE role = 'ADMIN' LIMIT 1");
    if (existing.rowCount > 0) throw new HttpError(409, "Es existiert bereits ein ADMIN-Konto.");
    const result = await client.query(
      "INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, 'ADMIN') RETURNING id, name, email, role",
      [name.trim(), normalizedEmail, hash],
    );
    await client.query("COMMIT");
    return result.rows[0];
  } catch (error) {
    await client.query("ROLLBACK");
    if (error.code === "23505") throw new HttpError(409, "Die E-Mail-Adresse ist bereits vergeben.");
    throw error;
  }
}
