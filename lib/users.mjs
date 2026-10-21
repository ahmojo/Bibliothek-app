import "server-only";
import { randomBytes } from "node:crypto";
import { hashPassword, verifyPassword } from "./passwords.mjs";
import { HttpError } from "./http.mjs";

let dummyHash;

export function normalizeEmail(value) {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
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
  if (typeof id !== "string" || !/^[1-9]\d{0,18}$/.test(id) || BigInt(id) > 9223372036854775807n) return null;
  const result = await db.query("SELECT id, name, email, role FROM users WHERE id = $1", [id]);
  return result.rows[0] || null;
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
