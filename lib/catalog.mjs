import "server-only";
import { HttpError } from "./http.mjs";
import { normalizeIsbn, isValidIsbn } from "./isbn.mjs";
import { validateId } from "./validation.mjs";

const types = ["book", "cd", "dvd"];
const mediaSql = `WITH media AS (
  SELECT id, 'book'::text AS type, title, author, isbn, publisher,
    publication_year, category, description, cover_image_path FROM books
  UNION ALL
  SELECT id, LOWER(media_type), title, NULL, NULL, NULL, NULL, NULL, NULL, cover_image_path FROM cd_dvd
)`;
const filterSql = `WHERE ($1 = 'all' OR m.type = $1)
  AND ($2 = '' OR m.title ILIKE $2 OR m.author ILIKE $2 OR normalize_isbn(m.isbn) ILIKE $4)
  AND ($3 = '' OR normalize_isbn(m.isbn) = $3)`;
const countsSql = `LEFT JOIN LATERAL (
  SELECT COUNT(*)::integer AS total_copies,
    COUNT(*) FILTER (WHERE NOT EXISTS (
      SELECT 1 FROM ausleihe a WHERE a.exemplar_id = e.id AND a.return_date IS NULL
    ))::integer AS available_copies
  FROM exemplar e
  WHERE (m.type = 'book' AND e.book_id = m.id)
     OR (m.type IN ('cd', 'dvd') AND e.cd_dvd_id = m.id)
) counts ON true`;

export function parseCatalogQuery(params, detail = false) {
  const allowed = detail ? ["page", "pageSize"] : ["type", "q", "isbn", "page", "pageSize"];
  for (const key of params.keys()) {
    if (!allowed.includes(key) || params.getAll(key).length !== 1) {
      throw new HttpError(400, `Unbekannter oder mehrfacher Parameter: ${key}`);
    }
  }
  const type = params.get("type") || "all";
  const q = (params.get("q") || "").trim();
  const rawIsbn = params.get("isbn");
  if (rawIsbn !== null && !isValidIsbn(rawIsbn)) throw new HttpError(400, "Bitte eine gültige ISBN-10 oder ISBN-13 mit korrekter Prüfziffer angeben.");
  const isbn = rawIsbn === null ? "" : normalizeIsbn(rawIsbn);
  const pageText = params.get("page") ?? "1";
  const sizeText = params.get("pageSize") ?? "20";
  if (!types.includes(type) && type !== "all") throw new HttpError(400, "type muss book, cd, dvd oder all sein.");
  if (q.length > 200 || q.includes("\0")) throw new HttpError(400, "Die Suche darf höchstens 200 Zeichen enthalten.");
  if (!/^[1-9]\d*$/.test(pageText) || Number(pageText) > 10000) throw new HttpError(400, "page muss zwischen 1 und 10000 liegen.");
  if (!/^[1-9]\d*$/.test(sizeText) || Number(sizeText) > 100) throw new HttpError(400, "pageSize muss zwischen 1 und 100 liegen.");
  return { type, q, isbn, page: Number(pageText), pageSize: Number(sizeText) };
}

export async function listCatalog(db, { type, q, isbn, page, pageSize }) {
  // Suchzeichen werden als Text behandelt, nicht als LIKE-Platzhalter.
  const pattern = q ? `%${q.replace(/[\\%_]/g, "\\$&")}%` : "";
  const isbnPattern = q ? `%${normalizeIsbn(q).replace(/[\\%_]/g, "\\$&")}%` : "";
  const values = [type, pattern, isbn, isbnPattern];
  const total = await db.query(`${mediaSql} SELECT COUNT(*)::integer AS total FROM media m ${filterSql}`, values);
  const result = await db.query(
    `${mediaSql} SELECT m.*, counts.total_copies, counts.available_copies
     FROM media m ${countsSql} ${filterSql}
     ORDER BY LOWER(m.title), m.type, m.id LIMIT $5 OFFSET $6`,
    [...values, pageSize, (page - 1) * pageSize],
  );
  return { items: result.rows, total: total.rows[0].total, page, pageSize };
}

export async function getMedium(db, type, id, { page, pageSize }) {
  validateId(id);
  if (!types.includes(type)) {
    throw new HttpError(400, "Bitte einen gültigen Medientyp und eine gültige ID angeben.");
  }
  const result = await db.query(
    `${mediaSql} SELECT m.*, counts.total_copies, counts.available_copies
     FROM media m ${countsSql} WHERE m.type = $1 AND m.id = $2`, [type, id],
  );
  if (!result.rowCount) throw new HttpError(404, "Medium nicht gefunden.");
  const exemplars = await db.query(
    `SELECT e.id, e.inventory_number, e.location, NOT EXISTS (
       SELECT 1 FROM ausleihe a WHERE a.exemplar_id = e.id AND a.return_date IS NULL
     ) AS available FROM exemplar e
     WHERE ($1 = 'book' AND e.book_id = $2) OR ($1 IN ('cd', 'dvd') AND e.cd_dvd_id = $2)
     ORDER BY e.id LIMIT $3 OFFSET $4`, [type, id, pageSize, (page - 1) * pageSize],
  );
  return { ...result.rows[0], exemplars: exemplars.rows, page, pageSize };
}
