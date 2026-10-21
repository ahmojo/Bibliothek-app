import "server-only";
import { HttpError } from "./http.mjs";
import { validateId, pagination } from "./validation.mjs";
import { transaction, LIBRARY_TIME_ZONE } from "./postgres.mjs";

export async function createLoan(db, userId, exemplarId) {
  validateId(userId);
  validateId(exemplarId);
  return transaction(db, async (client) => {
    // Dieselbe Sperre wie bei Medienwechseln schützt auch die Exemplarzuordnung.
    const exemplar = await client.query("SELECT id FROM exemplar WHERE id = $1 FOR UPDATE", [exemplarId]);
    if (!exemplar.rowCount) throw new HttpError(404, "Exemplar nicht gefunden.");
    const result = await client.query(
      `WITH dates AS (SELECT (statement_timestamp() AT TIME ZONE $3)::date AS today)
       INSERT INTO ausleihe (user_id, exemplar_id, loan_date, due_date)
       SELECT $1, $2, today, today + 30 FROM dates
       WHERE NOT EXISTS (SELECT 1 FROM ausleihe WHERE exemplar_id = $2 AND return_date IS NULL)
       ON CONFLICT (exemplar_id) WHERE return_date IS NULL DO NOTHING
       RETURNING *`, [userId, exemplarId, LIBRARY_TIME_ZONE],
    );
    if (!result.rowCount) throw new HttpError(409, "Dieses Exemplar ist bereits ausgeliehen.");
    return result.rows[0];
  });
}

export async function returnLoan(db, id) {
  validateId(id);
  return transaction(db, async (client) => {
    const result = await client.query(
      `UPDATE ausleihe SET return_date = (statement_timestamp() AT TIME ZONE $2)::date
       WHERE id = $1 AND return_date IS NULL RETURNING *`, [id, LIBRARY_TIME_ZONE],
    );
    if (result.rowCount) return result.rows[0];
    const existing = await client.query("SELECT id FROM ausleihe WHERE id = $1", [id]);
    if (!existing.rowCount) throw new HttpError(404, "Ausleihe nicht gefunden.");
    throw new HttpError(409, "Diese Ausleihe wurde bereits zurückgegeben.");
  });
}

export function parseLoanQuery(params) {
  const paging = pagination(params, ["status"]);
  const status = params.get("status") ?? "active";
  if (!["active", "history", "overdue"].includes(status)) throw new HttpError(400, "status muss active, history oder overdue sein.");
  return { ...paging, status };
}

async function listLoans(db, userId, { status, page, pageSize }) {
  if (!["active", "history", "overdue"].includes(status)) throw new HttpError(400, "Ungültiger Ausleihstatus.");
  const where = `WHERE ($1::bigint IS NULL OR a.user_id = $1)
    AND (($2 = 'active' AND a.return_date IS NULL)
      OR ($2 = 'history' AND a.return_date IS NOT NULL)
      OR ($2 = 'overdue' AND a.return_date IS NULL AND a.due_date < (statement_timestamp() AT TIME ZONE $3)::date))`;
  const values = [userId, status, LIBRARY_TIME_ZONE];
  const total = await db.query(`SELECT count(*)::integer AS total FROM ausleihe a ${where}`, values);
  const userColumns = userId === null ? ", u.name AS user_name, u.email AS user_email" : "";
  const userJoin = userId === null ? "JOIN users u ON u.id = a.user_id" : "";
  const order = status === "history" ? "a.return_date DESC, a.id DESC" : "a.due_date, a.id";
  const result = await db.query(
    `SELECT a.id, a.user_id, a.exemplar_id, a.loan_date, a.due_date, a.return_date,
       e.inventory_number, e.location, COALESCE(b.id, d.id) AS media_id,
       CASE WHEN e.book_id IS NOT NULL THEN 'book' ELSE LOWER(d.media_type) END AS media_type,
       COALESCE(b.title, d.title) AS title,
       (a.return_date IS NULL AND a.due_date < (statement_timestamp() AT TIME ZONE $3)::date) AS overdue
       ${userColumns}
     FROM ausleihe a JOIN exemplar e ON e.id = a.exemplar_id
     LEFT JOIN books b ON b.id = e.book_id LEFT JOIN cd_dvd d ON d.id = e.cd_dvd_id
     ${userJoin} ${where} ORDER BY ${order} LIMIT $4 OFFSET $5`,
    [...values, pageSize, (page - 1) * pageSize],
  );
  return { items: result.rows, total: total.rows[0].total, page, pageSize };
}

export async function listLoansForUser(db, userId, options) {
  validateId(userId);
  return listLoans(db, userId, options);
}

export async function listLoansForAdmin(db, options) {
  return listLoans(db, null, options);
}
