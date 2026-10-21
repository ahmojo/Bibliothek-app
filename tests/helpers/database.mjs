import { randomUUID } from "node:crypto";
import path from "node:path";
import nextEnv from "@next/env";
import pg from "pg";
import { LIBRARY_TIME_ZONE } from "../../lib/postgres.mjs";
import { runMigrations } from "../../scripts/migrations.mjs";

nextEnv.loadEnvConfig(path.resolve(import.meta.dirname, "../.."));
export const migrationsDirectory = path.resolve(import.meta.dirname, "../../migrations");

export async function testDatabase(t, options = {}) {
  const schema = `backend_test_${randomUUID().replaceAll("-", "")}`;
  const connectionString = options.connectionString || process.env.DATABASE_URL;
  const client = new pg.Client({ connectionString, options: `-c timezone=${LIBRARY_TIME_ZONE}`, connectionTimeoutMillis: 5000, application_name: schema });
  const db = new pg.Pool({
    connectionString,
    options: `-c search_path=${schema} -c timezone=${LIBRARY_TIME_ZONE}`,
    application_name: schema,
    connectionTimeoutMillis: 5000,
    max: 4,
  });
  let created = false;
  let connected = false;
  let cleaned = false;
  async function cleanup() {
    if (cleaned) return;
    cleaned = true;
    try {
      await db.end();
    } finally {
      try {
        if (connected && created) {
          await client.query("ROLLBACK");
          await client.query("SET search_path TO public");
          await client.query(`DROP SCHEMA "${schema}" CASCADE`);
        }
      } finally {
        await client.end();
      }
    }
  }
  // Vor connect(), Schemaaufbau und Migrationen registrieren.
  t.after(cleanup);
  try {
    await client.connect();
    connected = true;
    await client.query(`CREATE SCHEMA "${schema}"`);
    created = true;
    await client.query(`SET search_path TO "${schema}"`);
    const applied = options.migrate === false ? [] : await runMigrations(client, options.migrationsDirectory || migrationsDirectory);
    return { db, client, schema, applied };
  } catch (error) {
    await cleanup();
    throw error;
  }
}
