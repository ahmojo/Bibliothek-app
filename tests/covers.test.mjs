import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import sharp from "sharp";
import { testDatabase } from "./helpers/database.mjs";
import { createBook, createDisc } from "../lib/media.mjs";
import { setCover, removeCover, readCover } from "../lib/covers.mjs";

test("Cover validieren, persistent speichern, ersetzen und entfernen", async (t) => {
  let directory;
  const previous = process.env.COVER_UPLOAD_DIR;
  t.after(async () => {
    if (previous === undefined) delete process.env.COVER_UPLOAD_DIR;
    else process.env.COVER_UPLOAD_DIR = previous;
    if (directory) {
      assert.ok(directory.startsWith(path.resolve(os.tmpdir()) + path.sep));
      await rm(directory, { recursive: true, force: true });
    }
  });
  directory = await mkdtemp(path.join(os.tmpdir(), "bibliothek-covers-"));
  process.env.COVER_UPLOAD_DIR = directory;
  const { client } = await testDatabase(t);
  const book = await createBook(client, { title: "Coverbuch", author: "A", isbn: "9780306406157" });
  const disc = await createDisc(client, { title: "Musik", media_type: "CD" });
  const image = sharp({ create: { width: 8, height: 8, channels: 3, background: "red" } });
  for (const format of ["png", "jpeg", "webp"]) {
    const buffer = await image.clone().toFormat(format).toBuffer();
    const medium = await setCover(client, "book", book.id, buffer);
    assert.match(medium.cover_image_path, /^[0-9a-f-]{36}\.webp$/);
    assert.equal((await readCover(medium.cover_image_path)).length > 0, true);
    assert.deepEqual(await readdir(directory), [medium.cover_image_path]);
  }
  const stored = (await client.query("SELECT cover_image_path FROM books WHERE id = $1", [book.id])).rows[0].cover_image_path;
  const child = spawnSync(process.execPath, ["--conditions=react-server", "--input-type=module", "-e", `import { readCover } from './lib/covers.mjs'; console.log((await readCover('${stored}')).length);`], { cwd: path.resolve(import.meta.dirname, ".."), env: process.env, encoding: "utf8", windowsHide: true });
  assert.equal(child.status, 0, child.stderr);
  assert.ok(Number(child.stdout.trim()) > 0);
  for (const buffer of [Buffer.from("<svg></svg>"), await image.clone().gif().toBuffer(), Buffer.from([137, 80, 78, 71])]) {
    await assert.rejects(setCover(client, "book", book.id, buffer), { status: 415 });
  }
  await assert.rejects(setCover(client, "book", book.id, Buffer.alloc(5 * 1024 * 1024 + 1)), { status: 413 });
  await assert.rejects(readCover("../../.env.local"), { status: 400 });
  const png = await image.clone().png().toBuffer();
  await assert.rejects(setCover(client, "book", "999999", png), { status: 404 });
  const failingDb = { query: (sql, values) => {
    if (sql.startsWith("UPDATE")) throw new Error("Simulierter DB-Fehler");
    return client.query(sql, values);
  } };
  await assert.rejects(setCover(failingDb, "book", book.id, png), /Simulierter DB-Fehler/);
  assert.deepEqual(await readdir(directory), [stored]);
  assert.equal((await client.query("SELECT cover_image_path FROM books WHERE id = $1", [book.id])).rows[0].cover_image_path, stored);
  await setCover(client, "cd", disc.id, png);
  await removeCover(client, "cd", disc.id);
  assert.equal((await removeCover(client, "book", book.id)).cover_image_path, null);
  await removeCover(client, "book", book.id);
  assert.deepEqual(await readdir(directory), []);
});
