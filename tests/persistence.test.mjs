import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import pg from "pg";
import sharp from "sharp";
import { runMigrations } from "../scripts/migrations.mjs";
import { createBook, createDisc } from "../lib/media.mjs";
import { createExemplar } from "../lib/exemplars.mjs";
import { createUser, authenticateUser } from "../lib/users.mjs";
import { createLoan, returnLoan } from "../lib/loans.mjs";
import { setCover, readCover } from "../lib/covers.mjs";

const execute = promisify(execFile);
const docker = (...args) => execute("docker", args, { windowsHide: true, timeout: 60000 });

// Eigener Container UND eigenes Volume; DATABASE_URL und Entwicklungscontainer werden nie verwendet.
test("Alle fünf Tabellen und Migrationen überstehen einen normalen PostgreSQL-Neustart", { timeout: 120000 }, async (t) => {
  const name = `bibliothek-persistence-${randomUUID()}`;
  const volume = `${name}-data`;
  const password = randomBytes(24).toString("hex");
  let client;
  let volumeCreated = false;
  let containerCreated = false;
  let coversDirectory;
  const previousCoverDirectory = process.env.COVER_UPLOAD_DIR;
  t.after(async () => {
    if (previousCoverDirectory === undefined) delete process.env.COVER_UPLOAD_DIR;
    else process.env.COVER_UPLOAD_DIR = previousCoverDirectory;
    if (coversDirectory) {
      assert.ok(coversDirectory.startsWith(path.resolve(os.tmpdir()) + path.sep));
      await rm(coversDirectory, { recursive: true, force: true });
    }
  });
  t.after(async () => {
    try {
      if (client) await client.end();
    } finally {
      try {
        if (containerCreated) await docker("rm", "--force", name);
      } finally {
        if (volumeCreated) await docker("volume", "rm", volume);
      }
    }
  });
  await docker("volume", "create", volume);
  volumeCreated = true;
  await docker("run", "--detach", "--name", name, "--label", "codex.test=library-persistence",
    "--env", "POSTGRES_DB=acceptance", "--env", "POSTGRES_USER=acceptance", "--env", `POSTGRES_PASSWORD=${password}`,
    "--publish", "127.0.0.1::5432", "--mount", `type=volume,source=${volume},target=/var/lib/postgresql`, "postgres:18");
  containerCreated = true;
  async function mappedPort() {
    const { stdout } = await docker("port", name, "5432/tcp");
    const port = Number(/^127\.0\.0\.1:(\d+)\s*$/.exec(stdout)?.[1]);
    assert.ok(port > 0, "Testport muss ausschliesslich an Loopback gebunden sein");
    return port;
  }
  const config = { host: "127.0.0.1", port: await mappedPort(), user: "acceptance", database: "acceptance", password, connectionTimeoutMillis: 1000 };
  async function connect() {
    for (let attempt = 0; attempt < 80; attempt++) {
      const candidate = new pg.Client(config);
      try {
        await candidate.connect();
        return candidate;
      } catch (error) {
        await candidate.end();
        if (attempt === 79) throw error;
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
    }
  }
  client = await connect();
  const directory = path.resolve(import.meta.dirname, "../migrations");
  const applied = await runMigrations(client, directory);
  assert.equal(applied.length, 9);
  coversDirectory = await mkdtemp(path.join(os.tmpdir(), "bibliothek-persistence-covers-"));
  process.env.COVER_UPLOAD_DIR = coversDirectory;
  const book = await createBook(client, { title: "Persistenzbuch", author: "Test", isbn: "9780306406157" });
  const png = await sharp({ create: { width: 2, height: 2, channels: 3, background: "blue" } }).png().toBuffer();
  const coveredBook = await setCover(client, "book", book.id, png);
  const coverBefore = await readCover(coveredBook.cover_image_path);
  const copy = await createExemplar(client, { inventory_number: "P-BOOK", location: "Test", book_id: book.id });
  for (const media_type of ["CD", "DVD"]) {
    const disc = await createDisc(client, { title: `Persistenz ${media_type}`, media_type });
    await createExemplar(client, { inventory_number: `P-${media_type}`, location: "Test", cd_dvd_id: disc.id });
  }
  const user = await createUser(client, { name: "Persistenz", email: "persistence@example.test", password, role: "USER" });
  const loan = await createLoan(client, user.id, copy.id);
  await returnLoan(client, loan.id);
  await createLoan(client, user.id, copy.id);
  const tables = ["books", "cd_dvd", "exemplar", "users", "ausleihe", "schema_migrations", "setup_check"];
  async function snapshot() {
    const data = {};
    for (const table of tables) {
      const order = table === "schema_migrations" ? "filename" : "id";
      data[table] = (await client.query(`SELECT * FROM ${table} ORDER BY ${order}`)).rows;
    }
    return data;
  }
  const before = await snapshot();
  await client.end();
  client = null;
  const previousLogs = await docker("logs", name);
  await docker("restart", "--timeout", "30", name);
  // Docker Desktop kann einen zufälligen Host-Port beim Neustart neu vergeben.
  config.port = await mappedPort();
  client = await connect();
  const restartLogs = (await docker("logs", name)).stderr.slice(previousLogs.stderr.length);
  assert.match(restartLogs, /database system is shut down/);
  assert.doesNotMatch(restartLogs, /not properly shut down/);
  assert.deepEqual(await snapshot(), before);
  assert.deepEqual(await readCover(coveredBook.cover_image_path), coverBefore);
  assert.deepEqual(await runMigrations(client, directory), []);
  assert.deepEqual(await snapshot(), before);
  assert.equal((await authenticateUser(client, { email: user.email, password })).id, user.id);
  const volumeMount = JSON.parse((await docker("inspect", "--format", "{{json .Mounts}}", name)).stdout);
  assert.ok(volumeMount.some((mount) => mount.Name === volume && mount.Destination === "/var/lib/postgresql"));
});
