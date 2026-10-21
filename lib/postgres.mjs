import pg from "pg";

// DATE ist ein Kalendertag, kein Zeitpunkt. BIGINT bleibt verlustfrei als String.
pg.types.setTypeParser(1082, (value) => value);
pg.types.setTypeParser(20, (value) => value);

export const LIBRARY_TIME_ZONE = "Europe/Zurich";

export async function transaction(db, work) {
  const client = db instanceof pg.Pool ? await db.connect() : db;
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    if (client !== db) client.release();
  }
}
