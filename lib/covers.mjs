import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { HttpError } from "./http.mjs";
import { validateId } from "./validation.mjs";
import { mediaTable } from "./media.mjs";
import { transaction } from "./postgres.mjs";

export const MAX_COVER_BYTES = 5 * 1024 * 1024;

function coverPath(filename) {
  if (typeof filename !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$/.test(filename)) {
    throw new HttpError(400, "Ungültige Cover-Kennung.");
  }
  // Uploads entstehen zur Laufzeit und gehören nicht in das Next.js-Buildpaket.
  const directory = path.resolve(/* turbopackIgnore: true */ process.env.COVER_UPLOAD_DIR || "storage/covers");
  return path.join(/* turbopackIgnore: true */ directory, filename);
}

async function encodeCover(buffer) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) throw new HttpError(415, "Bitte ein JPG-, PNG- oder WebP-Bild hochladen.");
  if (buffer.length > MAX_COVER_BYTES) throw new HttpError(413, "Das Cover darf höchstens 5 MB gross sein.");
  let encoded;
  try {
    const image = sharp(buffer, { limitInputPixels: 20000000, failOn: "warning" });
    const metadata = await image.metadata();
    if (!["jpeg", "png", "webp"].includes(metadata.format) || (metadata.pages || 1) > 1) throw new Error("Ungültiges Bildformat");
    encoded = await image.rotate().webp().toBuffer();
  } catch {
    throw new HttpError(415, "Bitte ein lesbares, nicht animiertes JPG-, PNG- oder WebP-Bild hochladen.");
  }
  if (encoded.length > MAX_COVER_BYTES) throw new HttpError(413, "Das gespeicherte Cover darf höchstens 5 MB gross sein.");
  return encoded;
}

async function deleteOldCover(filename) {
  if (!filename) return;
  try {
    await unlink(coverPath(filename));
  } catch (error) {
    // Nach erfolgreicher DB-Änderung lieber eine verwaiste Datei als einen kaputten Verweis behalten.
    if (error.code !== "ENOENT") console.error("Altes Cover konnte nicht entfernt werden:", error.code || error.name);
  }
}

async function changeCover(db, type, id, filename) {
  validateId(id);
  const table = mediaTable(type);
  return transaction(db, async (client) => {
    const result = await client.query(`SELECT * FROM ${table} WHERE id = $1 FOR UPDATE`, [id]);
    const medium = result.rows[0];
    if (!medium || (table === "cd_dvd" && medium.media_type.toLowerCase() !== type)) throw new HttpError(404, "Medium nicht gefunden.");
    const changed = await client.query(`UPDATE ${table} SET cover_image_path = $2 WHERE id = $1 RETURNING *`, [id, filename]);
    return { medium: changed.rows[0], previous: medium.cover_image_path };
  });
}

export async function setCover(db, type, id, buffer) {
  validateId(id);
  mediaTable(type);
  const encoded = await encodeCover(buffer);
  const filename = `${randomUUID()}.webp`;
  const target = coverPath(filename);
  let changed;
  try {
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, encoded, { flag: "wx" });
    changed = await changeCover(db, type, id, filename);
  } catch (error) {
    if (error.code !== "EEXIST") await deleteOldCover(filename);
    throw error;
  }
  await deleteOldCover(changed.previous);
  return changed.medium;
}

export async function removeCover(db, type, id) {
  const changed = await changeCover(db, type, id, null);
  await deleteOldCover(changed.previous);
  return changed.medium;
}

export async function readCover(filename) {
  const target = coverPath(filename);
  try {
    return await readFile(/* turbopackIgnore: true */ target);
  } catch (error) {
    if (error.code === "ENOENT") throw new HttpError(404, "Cover nicht gefunden.");
    throw error;
  }
}
