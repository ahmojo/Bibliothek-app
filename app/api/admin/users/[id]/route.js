import { pool } from "@/lib/db";
import { requireAdminRequest } from "@/lib/auth";
import { errorResponse, readJson } from "@/lib/http.mjs";
import { updateUser } from "@/lib/users.mjs";

export async function PATCH(request, context) {
  try {
    await requireAdminRequest(request);
    const { id } = await context.params;
    return Response.json(await updateUser(pool, id, await readJson(request)));
  } catch (error) {
    return errorResponse(error);
  }
}
