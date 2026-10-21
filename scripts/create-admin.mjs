import { Writable } from "node:stream";
import { createInterface } from "node:readline/promises";
import path from "node:path";
import nextEnv from "@next/env";
import pg from "pg";
import { createInitialAdmin } from "../lib/users.mjs";
import { HttpError } from "../lib/http.mjs";

nextEnv.loadEnvConfig(path.resolve(import.meta.dirname, ".."));

async function main() {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new HttpError(400, "Bitte in einem interaktiven Terminal ausführen. Passwörter nicht als Argument übergeben.");
  }
  if (!process.env.DATABASE_URL) throw new HttpError(400, "DATABASE_URL fehlt in .env.local.");
  let hidden = false;
  const output = new Writable({
    write(chunk, encoding, callback) {
      if (!hidden) process.stdout.write(chunk, encoding);
      callback();
    },
  });
  const prompt = createInterface({ input: process.stdin, output, terminal: true });
  let name, email, password, confirmation;
  try {
    name = await prompt.question("Name: ");
    email = await prompt.question("E-Mail: ");
    hidden = true;
    process.stdout.write("Passwort (12–50 Zeichen): ");
    password = await prompt.question("");
    process.stdout.write("\nPasswort wiederholen: ");
    confirmation = await prompt.question("");
    process.stdout.write("\n");
  } finally {
    prompt.close();
  }
  if (password !== confirmation) throw new HttpError(400, "Die Passwörter stimmen nicht überein.");
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  try {
    await client.connect();
    await createInitialAdmin(client, { name, email, password });
    console.log("Das erste ADMIN-Konto wurde erstellt.");
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error.status ? error.message : "ADMIN-Setup fehlgeschlagen. Prüfe Eingaben und Datenbankkonfiguration.");
  process.exitCode = 1;
});
