import "server-only";
import { Pool } from "pg";

if (!process.env.DATABASE_URL?.trim()) {
  throw new Error("DATABASE_URL fehlt. Bitte die Datenbankverbindung in .env.local konfigurieren.");
}

let pool = globalThis.bibliothekPool;

if (!pool) {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  pool.on("error", (error) => {
    console.error("Fehler einer inaktiven PostgreSQL-Verbindung:", error.code);
  });

  // Bei Modul-Neuladungen im Entwicklungsmodus denselben Pool verwenden.
  if (process.env.NODE_ENV !== "production") {
    globalThis.bibliothekPool = pool;
  }
}

export { pool };

export async function getSetupMessage() {
  const result = await pool.query("SELECT message FROM setup_check LIMIT 1");

  if (result.rows.length === 0) {
    return "Keine Daten gefunden";
  }

  return result.rows[0].message;
}
