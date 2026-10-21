import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import nextEnv from "@next/env";
import pg from "pg";
import { runMigrations } from "../scripts/migrations.mjs";

const projectDir = path.resolve(import.meta.dirname, "..");
nextEnv.loadEnvConfig(projectDir);

async function prepareTest(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "bibliothek-migrations-"));
  const schema = `migration_test_${randomUUID().replaceAll("-", "")}`;
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const before = await client.query("SELECT * FROM public.setup_check ORDER BY id");

  t.after(async () => {
    try {
      await client.query("ROLLBACK");
      await client.query("SET search_path TO public");
      await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      const after = await client.query("SELECT * FROM public.setup_check ORDER BY id");
      assert.deepEqual(after.rows, before.rows, "setup_check muss unverändert bleiben");
    } finally {
      await client.end();
      const tempRoot = path.resolve(os.tmpdir()) + path.sep;
      assert.ok(path.resolve(directory).startsWith(tempRoot));
      await rm(directory, { recursive: true, force: true });
    }
  });

  await client.query(`CREATE SCHEMA "${schema}"`);
  await client.query(`SET search_path TO "${schema}"`);
  return { client, directory };
}

test("Ein leerer Ordner richtet nur die Migrationstabelle ein", async (t) => {
  const { client, directory } = await prepareTest(t);
  assert.deepEqual(await runMigrations(client, directory), []);
  assert.deepEqual(await runMigrations(client, directory), []);
  const result = await client.query("SELECT * FROM schema_migrations");
  assert.deepEqual(result.rows, []);
});

test("Migrationen laufen nummeriert und werden beim zweiten Lauf übersprungen", async (t) => {
  const { client, directory } = await prepareTest(t);
  await writeFile(path.join(directory, "010_second_row.sql"),
    "INSERT INTO migration_probe VALUES (2);");
  await writeFile(path.join(directory, "002_first_row.sql"),
    "INSERT INTO migration_probe VALUES (1);");
  await writeFile(path.join(directory, "001_create_probe.sql"),
    "CREATE TABLE migration_probe (id integer PRIMARY KEY);");

  assert.deepEqual(await runMigrations(client, directory), [
    "001_create_probe.sql", "002_first_row.sql", "010_second_row.sql",
  ]);
  assert.deepEqual(await runMigrations(client, directory), []);
  const result = await client.query("SELECT id FROM migration_probe ORDER BY id");
  assert.deepEqual(result.rows, [{ id: 1 }, { id: 2 }]);
  const history = await client.query("SELECT filename FROM schema_migrations ORDER BY filename");
  assert.equal(history.rowCount, 3);
});

test("Fehler rollen SQL und Historieneintrag zurück; spätere Dateien warten", async (t) => {
  const { client, directory } = await prepareTest(t);
  await writeFile(path.join(directory, "001_create_probe.sql"),
    "CREATE TABLE migration_probe (id integer PRIMARY KEY);");
  const brokenFile = path.join(directory, "002_insert_row.sql");
  await writeFile(brokenFile, `
    INSERT INTO migration_probe VALUES (1);
    ALTER TABLE migration_probe ADD COLUMN should_rollback text;
    SELECT * FROM missing_migration_table;
  `);
  await writeFile(path.join(directory, "003_later_row.sql"),
    "INSERT INTO migration_probe VALUES (2);");

  await assert.rejects(runMigrations(client, directory), /002_insert_row.sql/);
  const rows = await client.query("SELECT * FROM migration_probe");
  assert.deepEqual(rows.fields.map((field) => field.name), ["id"]);
  assert.deepEqual(rows.rows, []);
  const history = await client.query("SELECT filename FROM schema_migrations");
  assert.deepEqual(history.rows, [{ filename: "001_create_probe.sql" }]);

  // Nur die fehlgeschlagene, noch nicht angewendete Datei wird korrigiert.
  await writeFile(brokenFile, "INSERT INTO migration_probe VALUES (1);");
  assert.deepEqual(await runMigrations(client, directory), [
    "002_insert_row.sql", "003_later_row.sql",
  ]);
  assert.deepEqual(await runMigrations(client, directory), []);
});

test("Doppelte Nummern werden vor der Ausführung abgelehnt", async (t) => {
  const { client, directory } = await prepareTest(t);
  await writeFile(path.join(directory, "001_first.sql"), "SELECT 1;");
  await writeFile(path.join(directory, "001_second.sql"), "SELECT 2;");
  await assert.rejects(runMigrations(client, directory), /Doppelte Migrationsnummer/);
});

test("Parallele Läufe wenden dieselbe Migration nur einmal an", async (t) => {
  const { client, directory } = await prepareTest(t);
  const schemaResult = await client.query("SELECT current_schema() AS name");
  const schema = schemaResult.rows[0].name;
  const secondClient = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await secondClient.connect();
  t.after(() => secondClient.end());
  await secondClient.query(`SET search_path TO "${schema}"`);
  await writeFile(path.join(directory, "001_create_probe.sql"), `
    SELECT pg_sleep(0.1);
    CREATE TABLE migration_probe (id integer PRIMARY KEY);
    INSERT INTO migration_probe VALUES (1);
  `);

  const results = await Promise.all([
    runMigrations(client, directory),
    runMigrations(secondClient, directory),
  ]);
  assert.deepEqual(results.flat(), ["001_create_probe.sql"]);
  const result = await client.query("SELECT id FROM migration_probe");
  assert.deepEqual(result.rows, [{ id: 1 }]);
});
