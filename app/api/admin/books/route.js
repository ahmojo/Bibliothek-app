import { pool } from "@/lib/db";
import { requireAdminRequest } from "@/lib/auth";
import { errorResponse, readJson } from "@/lib/http.mjs";
import { createBook } from "@/lib/media.mjs";

export async function POST(request) {
  try {
    await requireAdminRequest(request);
    const data = await readJson(request);
    const result = await createBook(pool, data);
    return Response.json(result, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
