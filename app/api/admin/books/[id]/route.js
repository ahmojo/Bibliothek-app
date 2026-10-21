import { pool } from "@/lib/db";
import { requireAdminRequest } from "@/lib/auth";
import { errorResponse, readJson } from "@/lib/http.mjs";
import { updateBook, getMedia } from "@/lib/media.mjs";

export async function GET(request, context) {
  try {
    await requireAdminRequest(request);
    const { id } = await context.params;
    const result = await getMedia(pool, "book", id);
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request, context) {
  try {
    await requireAdminRequest(request);
    const { id } = await context.params;
    const data = await readJson(request);
    return Response.json(await updateBook(pool, id, data));
  } catch (error) {
    return errorResponse(error);
  }
}
