import { pool } from "@/lib/db";
import { requireAdminRequest } from "@/lib/auth";
import { errorResponse, readJson } from "@/lib/http.mjs";
import { createUser, listUsers } from "@/lib/users.mjs";
import { pagination } from "@/lib/validation.mjs";

export async function GET(request) {
  try {
    await requireAdminRequest(request);
    const paging = pagination(new URL(request.url).searchParams);
    return Response.json(await listUsers(pool, paging), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request) {
  try {
    await requireAdminRequest(request);
    return Response.json(await createUser(pool, await readJson(request)), { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
