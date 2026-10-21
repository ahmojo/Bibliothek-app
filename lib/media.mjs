import "server-only";
import { HttpError } from "./http.mjs";
import { normalizeIsbn, isValidIsbn } from "./isbn.mjs";
import { validateId, validateFields, text } from "./validation.mjs";
import { LIBRARY_TIME_ZONE } from "./postgres.mjs";

function bookValues(data, partial = false) {
  validateFields(data, ["title", "author", "isbn", "publisher", "publication_year", "category", "description"]);
  const values = {};
  for (const field of ["title", "author", "publisher", "category", "description"]) {
    if (partial && !(field in data)) continue;
    const optional = !["title", "author"].includes(field);
    values[field] = text(data[field], field, field === "description" ? 10000 : 500, optional);
  }
  if (!partial || "isbn" in data) {
    if (!isValidIsbn(data.isbn)) throw new HttpError(400, "Bitte eine gültige ISBN-10 oder ISBN-13 angeben.");
    values.isbn = normalizeIsbn(data.isbn);
  }
  if (!partial || "publication_year" in data) {
    const year = data.publication_year ?? null;
    const currentYear = Number(new Intl.DateTimeFormat("en", { timeZone: LIBRARY_TIME_ZONE, year: "numeric" }).format(new Date()));
    if (year !== null && (!Number.isInteger(year) || year < 1 || year > currentYear + 1)) {
      throw new HttpError(400, `publication_year muss zwischen 1 und ${currentYear + 1} liegen.`);
    }
    values.publication_year = year;
  }
  return values;
}

function discValues(data, partial = false) {
  validateFields(data, ["title", "media_type"]);
  const values = {};
  if (!partial || "title" in data) values.title = text(data.title, "title");
  if (!partial || "media_type" in data) {
    if (!["CD", "DVD"].includes(data.media_type)) throw new HttpError(400, "media_type muss CD oder DVD sein.");
    values.media_type = data.media_type;
  }
  return values;
}

export async function createBook(db, data) {
  const values = bookValues(data);
  const result = await db.query(
    `INSERT INTO books (title, author, isbn, publisher, publication_year, category, description)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [values.title, values.author, values.isbn, values.publisher, values.publication_year, values.category, values.description],
  );
  return result.rows[0];
}

export async function updateBook(db, id, data) {
  validateId(id);
  const values = bookValues(data, true);
  const fields = Object.keys(values);
  const assignments = fields.map((field, index) => `${field} = $${index + 2}`);
  const result = await db.query(`UPDATE books SET ${assignments.join(", ")} WHERE id = $1 RETURNING *`, [id, ...Object.values(values)]);
  if (!result.rowCount) throw new HttpError(404, "Buch nicht gefunden.");
  return result.rows[0];
}

export async function createDisc(db, data) {
  const values = discValues(data);
  const result = await db.query("INSERT INTO cd_dvd (title, media_type) VALUES ($1, $2) RETURNING *", [values.title, values.media_type]);
  return result.rows[0];
}

export async function updateDisc(db, id, data) {
  validateId(id);
  const values = discValues(data, true);
  const assignments = Object.keys(values).map((field, index) => `${field} = $${index + 2}`);
  const result = await db.query(`UPDATE cd_dvd SET ${assignments.join(", ")} WHERE id = $1 RETURNING *`, [id, ...Object.values(values)]);
  if (!result.rowCount) throw new HttpError(404, "CD/DVD nicht gefunden.");
  return result.rows[0];
}

export function mediaTable(type) {
  if (type === "book") return "books";
  if (type === "cd" || type === "dvd") return "cd_dvd";
  throw new HttpError(400, "Medientyp muss book, cd oder dvd sein.");
}

export async function getDisc(db, id) {
  validateId(id);
  const result = await db.query("SELECT * FROM cd_dvd WHERE id = $1", [id]);
  if (!result.rowCount) throw new HttpError(404, "CD/DVD nicht gefunden.");
  return result.rows[0];
}

export async function getMedia(db, type, id) {
  validateId(id);
  const table = mediaTable(type);
  const result = await db.query(`SELECT * FROM ${table} WHERE id = $1`, [id]);
  const medium = result.rows[0];
  if (!medium || (table === "cd_dvd" && medium.media_type.toLowerCase() !== type)) {
    throw new HttpError(404, "Medium nicht gefunden.");
  }
  return medium;
}
