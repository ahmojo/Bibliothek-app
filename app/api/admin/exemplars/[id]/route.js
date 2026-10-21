import { pool } from "@/lib/db";
import { requireAdminRequest } from "@/lib/auth";
import { errorResponse, readJson } from "@/lib/http.mjs";
import { updateExemplar } from "@/lib/exemplars.mjs";

export async function PATCH(request, context) {
  try {
    await requireAdminRequest(request);
    const { id } = await context.params;
    return Response.json(await updateExemplar(pool, id, await readJson(request)));
  } catch (error) {
    return errorResponse(error);
  }
}
