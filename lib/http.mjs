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
  console.error("Backend-Anfrage fehlgeschlagen:", error.code || error.name);
  return Response.json({ error: "Die Anfrage konnte nicht verarbeitet werden." }, { status: 500 });
}
