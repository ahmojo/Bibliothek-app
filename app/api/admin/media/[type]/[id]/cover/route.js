import { pool } from "@/lib/db";
import { requireAdminRequest } from "@/lib/auth";
import { errorResponse, readCoverUpload } from "@/lib/http.mjs";
import { setCover, removeCover } from "@/lib/covers.mjs";

export const runtime = "nodejs";

export async function PUT(request, context) {
  try {
    await requireAdminRequest(request);
    const { type, id } = await context.params;
    const buffer = await readCoverUpload(request);
    return Response.json(await setCover(pool, type, id, buffer));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request, context) {
  try {
    await requireAdminRequest(request);
    const { type, id } = await context.params;
    return Response.json(await removeCover(pool, type, id));
  } catch (error) {
    return errorResponse(error);
  }
}
