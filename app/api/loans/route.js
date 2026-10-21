import { pool } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { errorResponse, readJson, requireSameOrigin } from "@/lib/http.mjs";
import { validateFields } from "@/lib/validation.mjs";
import { createLoan, listLoansForUser, parseLoanQuery } from "@/lib/loans.mjs";

export async function GET(request) {
  try {
    const user = await requireUser();
    const options = parseLoanQuery(new URL(request.url).searchParams);
    const result = await listLoansForUser(pool, user.id, options);
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request) {
  try {
    const user = await requireUser();
    requireSameOrigin(request);
    const data = await readJson(request);
    validateFields(data, ["exemplar_id"]);
    const loan = await createLoan(pool, user.id, data.exemplar_id);
    return Response.json(loan, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
