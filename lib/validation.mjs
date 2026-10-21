import { HttpError } from "./http.mjs";

export function isId(value) {
  return typeof value === "string" && /^[1-9]\d{0,18}$/.test(value) && BigInt(value) <= 9223372036854775807n;
}

export function validateId(value) {
  if (!isId(value)) throw new HttpError(400, "Bitte eine gültige ID als String angeben.");
  return value;
}

export function validateFields(data, allowed) {
  if (!data || typeof data !== "object" || Array.isArray(data) || !Object.keys(data).length) {
    throw new HttpError(400, "Bitte ein nicht leeres JSON-Objekt angeben.");
  }
  for (const field of Object.keys(data)) {
    if (!allowed.includes(field)) throw new HttpError(400, `Unbekanntes Feld: ${field}`);
  }
}

export function text(value, field, max = 500, optional = false) {
  if (optional && (value === null || value === undefined || value === "")) return null;
  if (typeof value !== "string" || !value.trim() || value.includes("\0") || value.length > max) {
    throw new HttpError(400, `${field} muss ausgefüllt sein und darf höchstens ${max} Zeichen enthalten.`);
  }
  return value.trim();
}

export function pagination(params, extra = []) {
  for (const key of params.keys()) {
    if (!["page", "pageSize", ...extra].includes(key) || params.getAll(key).length !== 1) {
      throw new HttpError(400, `Unbekannter oder mehrfacher Parameter: ${key}`);
    }
  }
  const page = params.get("page") ?? "1";
  const pageSize = params.get("pageSize") ?? "20";
  if (!/^[1-9]\d*$/.test(page) || Number(page) > 10000 || !/^[1-9]\d*$/.test(pageSize) || Number(pageSize) > 100) {
    throw new HttpError(400, "page muss zwischen 1 und 10000, pageSize zwischen 1 und 100 liegen.");
  }
  return { page: Number(page), pageSize: Number(pageSize) };
}
