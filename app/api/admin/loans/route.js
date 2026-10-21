import { pool } from "@/lib/db";
import { requireAdminRequest } from "@/lib/auth";
import { errorResponse } from "@/lib/http.mjs";
import { listLoansForAdmin, parseLoanQuery } from "@/lib/loans.mjs";

export async function GET(request) {
  try {
    await requireAdminRequest(request);
    const options = parseLoanQuery(new URL(request.url).searchParams);
    const result = await listLoansForAdmin(pool, options);
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
