import "server-only";
import { HttpError } from "./http.mjs";
import { validateId, validateFields, text } from "./validation.mjs";
import { transaction } from "./postgres.mjs";

function exemplarValues(data) {
  const bookId = data.book_id ?? null;
  const discId = data.cd_dvd_id ?? null;
  if ((bookId === null) === (discId === null)) throw new HttpError(400, "Ein Exemplar braucht genau eine Medienzuordnung.");
  if (bookId !== null) validateId(bookId);
  if (discId !== null) validateId(discId);
  return [text(data.inventory_number, "inventory_number"), text(data.location, "location"), bookId, discId];
}

export async function createExemplar(db, data) {
  validateFields(data, ["inventory_number", "location", "book_id", "cd_dvd_id"]);
  const values = exemplarValues(data);
  const result = await db.query("INSERT INTO exemplar (inventory_number, location, book_id, cd_dvd_id) VALUES ($1, $2, $3, $4) RETURNING *", values);
  return result.rows[0];
}

export async function updateExemplar(db, id, data) {
  validateId(id);
  validateFields(data, ["inventory_number", "location", "book_id", "cd_dvd_id"]);
  return transaction(db, async (client) => {
    const result = await client.query("SELECT * FROM exemplar WHERE id = $1 FOR UPDATE", [id]);
    if (!result.rowCount) throw new HttpError(404, "Exemplar nicht gefunden.");
    const current = result.rows[0];
    const values = exemplarValues({ ...current, ...data });
    if (values[2] !== current.book_id || values[3] !== current.cd_dvd_id) {
      const loans = await client.query("SELECT 1 FROM ausleihe WHERE exemplar_id = $1 LIMIT 1", [id]);
      if (loans.rowCount) throw new HttpError(409, "Exemplare mit Ausleihhistorie dürfen keinem anderen Medium zugeordnet werden.");
    }
    const changed = await client.query("UPDATE exemplar SET inventory_number = $2, location = $3, book_id = $4, cd_dvd_id = $5 WHERE id = $1 RETURNING *", [id, ...values]);
    return changed.rows[0];
  });
}

export async function listExemplars(db, medium, { page, pageSize }) {
  validateFields(medium, ["book_id", "cd_dvd_id"]);
  const bookId = medium.book_id ?? null;
  const discId = medium.cd_dvd_id ?? null;
  if ((bookId === null) === (discId === null)) throw new HttpError(400, "Bitte genau ein Medium angeben.");
  validateId(bookId ?? discId);
  const column = bookId !== null ? "book_id" : "cd_dvd_id";
  const total = await db.query(`SELECT count(*)::integer AS total FROM exemplar WHERE ${column} = $1`, [bookId ?? discId]);
  const result = await db.query(
    `SELECT e.*, NOT EXISTS (SELECT 1 FROM ausleihe a WHERE a.exemplar_id = e.id AND a.return_date IS NULL) AS available
     FROM exemplar e WHERE e.${column} = $1 ORDER BY e.id LIMIT $2 OFFSET $3`, [bookId ?? discId, pageSize, (page - 1) * pageSize],
  );
  return { items: result.rows, total: total.rows[0].total, page, pageSize };
}
