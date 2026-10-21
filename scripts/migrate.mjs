import path from "node:path";
import nextEnv from "@next/env";
import pg from "pg";
import { runMigrations } from "./migrations.mjs";

const projectDir = path.resolve(import.meta.dirname, "..");
nextEnv.loadEnvConfig(projectDir);

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL fehlt. Prüfe die .env.local im Projektordner.");
  }

  // Ein eigener Client hält alle Transaktionen auf derselben Verbindung.
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  try {
    await client.connect();
    const applied = await runMigrations(client, path.join(projectDir, "migrations"));
    if (applied.length === 0) {
      console.log("Keine neuen Migrationen vorhanden.");
    }
    for (const filename of applied) {
      console.log(`Ausgeführt: ${filename}`);
    }
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(`Migrationen fehlgeschlagen: ${error.message}`);
  process.exitCode = 1;
});
