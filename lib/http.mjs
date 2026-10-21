import "server-only";

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function errorResponse(error) {
  if (error instanceof HttpError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  if (error.code === "23505") return Response.json({ error: "ISBN, Inventarnummer oder E-Mail ist bereits vergeben." }, { status: 409 });
  if (error.code === "23503") return Response.json({ error: "Der referenzierte Datensatz existiert nicht." }, { status: 409 });
  if (["23502", "23514", "22003", "22021"].includes(error.code)) return Response.json({ error: "Die Angaben verletzen eine Datenbankregel." }, { status: 400 });
  console.error("Backend-Anfrage fehlgeschlagen:", error.code || error.name);
  return Response.json({ error: "Die Anfrage konnte nicht verarbeitet werden." }, { status: 500 });
}

export function requireSameOrigin(request) {
  const expected = new URL(process.env.NEXTAUTH_URL || request.url).origin;
  if (request.headers.get("origin") !== expected) throw new HttpError(403, "Die Anfrage muss vom Ursprung der Anwendung stammen.");
}

async function readBody(request, limit) {
  const contentLength = request.headers.get("content-length");
  if (contentLength && Number(contentLength) > limit) throw new HttpError(413, "Die Anfrage ist zu gross.");
  if (!request.body) throw new HttpError(400, "Der Anfrageinhalt fehlt.");
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new HttpError(413, "Die Anfrage ist zu gross.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, size);
}

export async function readJson(request) {
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") throw new HttpError(415, "Bitte application/json verwenden.");
  const body = await readBody(request, 64 * 1024);
  try {
    return JSON.parse(body.toString("utf8"));
  } catch {
    throw new HttpError(400, "Der Anfrageinhalt ist kein gültiges JSON.");
  }
}

export async function readCoverUpload(request) {
  if (!request.headers.get("content-type")?.startsWith("multipart/form-data;")) throw new HttpError(415, "Bitte multipart/form-data mit dem Feld file verwenden.");
  const body = await readBody(request, 5 * 1024 * 1024 + 64 * 1024);
  let form;
  try {
    form = await new Response(body, { headers: { "Content-Type": request.headers.get("content-type") } }).formData();
  } catch {
    throw new HttpError(400, "Ungültige Upload-Anfrage.");
  }
  const entries = [...form.entries()];
  const file = form.get("file");
  if (entries.length !== 1 || !(file instanceof File)) throw new HttpError(400, "Bitte genau eine Datei im Feld file angeben.");
  return Buffer.from(await file.arrayBuffer());
}
