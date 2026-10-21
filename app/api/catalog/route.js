import { pool } from "@/lib/db";
import { parseCatalogQuery, listCatalog } from "@/lib/catalog.mjs";
import { errorResponse } from "@/lib/http.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const options = parseCatalogQuery(new URL(request.url).searchParams);
    const result = await listCatalog(pool, options);
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
