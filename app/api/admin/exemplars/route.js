import { pool } from "@/lib/db";
import { requireAdminRequest } from "@/lib/auth";
import { errorResponse, readJson } from "@/lib/http.mjs";
import { createExemplar, listExemplars } from "@/lib/exemplars.mjs";
import { pagination } from "@/lib/validation.mjs";

export async function GET(request) {
  try {
    await requireAdminRequest(request);
    const params = new URL(request.url).searchParams;
    const paging = pagination(params, ["book_id", "cd_dvd_id"]);
    const medium = { book_id: params.get("book_id"), cd_dvd_id: params.get("cd_dvd_id") };
    return Response.json(await listExemplars(pool, medium, paging), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request) {
  try {
    await requireAdminRequest(request);
    return Response.json(await createExemplar(pool, await readJson(request)), { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
