import { pool } from "@/lib/db";
import { requireAdminRequest } from "@/lib/auth";
import { errorResponse } from "@/lib/http.mjs";
import { returnLoan } from "@/lib/loans.mjs";

export async function POST(request, { params }) {
  try {
    await requireAdminRequest(request);
    const { id } = await params;
    const loan = await returnLoan(pool, id);
    return Response.json(loan);
  } catch (error) {
    return errorResponse(error);
  }
}
