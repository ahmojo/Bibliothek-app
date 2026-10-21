import "server-only";
import argon2 from "argon2";
import { HttpError } from "./http.mjs";

export async function hashPassword(password) {
  const length = typeof password === "string" ? [...password].length : 0;
  if (length < 12 || length > 50) {
    throw new HttpError(400, "Das Passwort muss zwischen 12 und 50 Zeichen lang sein.");
  }
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 1,
  });
}

export async function verifyPassword(password, hash) {
  if (typeof password !== "string" || [...password].length > 50 || typeof hash !== "string") {
    return false;
  }
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}
