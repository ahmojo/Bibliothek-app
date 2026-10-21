import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

export async function runMigrations(client, directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const filenames = [];
  const numbers = new Set();

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".sql")) {
      continue;
    }

    const match = /^(\d{3})_[a-z0-9_]+\.sql$/.exec(entry.name);
    if (!match) {
      throw new Error(`Ungültiger Migrationsname: ${entry.name}. Erwartet: 001_beschreibung.sql`);
    }
    if (numbers.has(match[1])) {
      throw new Error(`Doppelte Migrationsnummer: ${match[1]}`);
    }

    numbers.add(match[1]);
    filenames.push(entry.name);
  }

  filenames.sort();
  const applied = [];

  // Die Sitzungssperre verhindert zwei gleichzeitige Migrationsläufe.
  await client.query("SELECT pg_advisory_lock(164218, 1)");
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    const result = await client.query("SELECT filename FROM schema_migrations");
    const executed = new Set(result.rows.map((row) => row.filename));

    for (const filename of filenames) {
      if (executed.has(filename)) {
        continue;
      }

      const sql = await readFile(path.join(directory, filename), "utf8");
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query(
          "INSERT INTO schema_migrations (filename) VALUES ($1)",
          [filename],
        );
        await client.query("COMMIT");
        applied.push(filename);
      } catch (error) {
        await client.query("ROLLBACK");
        const detail = error.code === "P0001" ? ` ${error.message}\n${error.detail || ""}` : "";
        throw new Error(`Migration ${filename} fehlgeschlagen (${error.code || "SQL-Fehler"}).${detail}`, {
          cause: error,
        });
      }
    }
  } finally {
    await client.query("SELECT pg_advisory_unlock(164218, 1)");
  }

  return applied;
}
