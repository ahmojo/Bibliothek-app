export function catalogReturnPath(value) {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || /[\\\u0000-\u0020\u007f]/.test(value)) return null;
  try {
    const decoded = decodeURIComponent(value);
    if (decoded.startsWith("//") || /[\\\u0000-\u001f\u007f]/.test(decoded)) return null;
    const url = new URL(value, "https://bibliotheksapp.invalid");
    if (url.origin !== "https://bibliotheksapp.invalid" || url.pathname !== "/") return null;
    return url.pathname + url.search;
  } catch {
    return null;
  }
}

export function loginDestination(role, next) {
  return catalogReturnPath(next) || (role === "ADMIN" ? "/admin" : "/meine-ausleihen");
}
