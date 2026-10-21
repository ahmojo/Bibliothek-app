
import { Client } from "pg";

export const dynamic = "force-dynamic";

export default async function Home() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });

  await client.connect();

  let message = "Keine Daten gefunden";

  try {
    const result = await client.query(
      "SELECT message FROM setup_check LIMIT 1"
    );

    if (result.rows.length > 0) {
      message = result.rows[0].message;
    }
  } finally {
    await client.end();
  }

  return (
    <main>
      <h1>Bibliotheksapp</h1>
      <p>{message}</p>
    </main>
  );
}
