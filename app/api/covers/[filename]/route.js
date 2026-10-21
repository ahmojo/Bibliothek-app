import { readCover } from "@/lib/covers.mjs";
import { errorResponse } from "@/lib/http.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request, { params }) {
  try {
    const { filename } = await params;
    const image = await readCover(filename);
    return new Response(image, { headers: {
      "Content-Type": "image/webp",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-store",
    } });
  } catch (error) {
    return errorResponse(error);
  }
}
