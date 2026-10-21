import { pool } from "@/lib/db";
import { parseCatalogQuery, getMedium } from "@/lib/catalog.mjs";
import { errorResponse } from "@/lib/http.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request, { params }) {
  try {
    const { type, id } = await params;
    const options = parseCatalogQuery(new URL(request.url).searchParams, true);
    const result = await getMedium(pool, type, id, options);
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
