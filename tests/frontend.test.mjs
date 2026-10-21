import assert from "node:assert/strict";
import test from "node:test";
import { catalogReturnPath, loginDestination } from "../lib/navigation.mjs";
import { findLoan, formatDate, loanStatus, requestApi } from "../lib/frontend.mjs";

test("Statusprüfung findet eine Ausleihe auch auf späteren Ergebnisseiten", async (t) => {
  const urls = [];
  t.mock.method(globalThis, "fetch", async (url) => {
    urls.push(url);
    const page = Number(new URL(url, "http://localhost").searchParams.get("page"));
    return Response.json({ items: [{ id: String(page) }], total: 2, page, pageSize: 1 });
  });
  assert.deepEqual(await findLoan("history", "2"), { id: "2" });
  assert.equal(urls.length, 2);
  assert.equal(await findLoan("active", "3"), null);
});

test("Kalendertage bleiben unverändert und Fristen unterscheiden heute von überfällig", () => {
  assert.equal(formatDate("2026-10-21"), "21.10.2026");
  assert.equal(formatDate(null), "–");
  assert.equal(loanStatus({ due_date: "2026-10-20", overdue: true }, "2026-10-21"), "Überfällig");
  assert.equal(loanStatus({ due_date: "2026-10-21" }, "2026-10-21"), "Heute fällig");
  assert.equal(loanStatus({ due_date: "2026-10-22" }, "2026-10-21"), "Ausgeliehen");
  assert.equal(loanStatus({ return_date: "2026-10-21" }, "2026-10-21"), "Zurückgegeben");
});

test("API-Schreibanfragen unterscheiden Konflikt, abgelaufene Sitzung und unklares Ergebnis", async (t) => {
  t.mock.method(globalThis, "fetch", async () => Response.json({ error: "Schon ausgeliehen." }, { status: 409 }));
  await assert.rejects(requestApi("/api/loans", { method: "POST" }), { status: 409, message: "Schon ausgeliehen.", uncertain: false });
  globalThis.fetch.mock.mockImplementation(async () => Response.json({}, { status: 401 }));
  await assert.rejects(requestApi("/api/loans"), { status: 401, message: "Bitte melde dich erneut an." });
  globalThis.fetch.mock.mockImplementation(async () => { throw new TypeError("fetch failed"); });
  await assert.rejects(requestApi("/api/loans", { method: "POST" }), { uncertain: true });
});

test("Login-Rückkehr erlaubt ausschliesslich interne Katalogpfade", () => {
  assert.equal(catalogReturnPath("/?type=book&medium=book%3A1"), "/?type=book&medium=book%3A1");
  for (const value of ["https://fremd.example", "//fremd.example", "/\\fremd.example", "/%5cfremd.example", "/%2ffremd.example", "/admin", "/api/auth/signout", "/\n/fremd.example", null]) {
    assert.equal(catalogReturnPath(value), null);
  }
});

test("Login verwendet rollenabhängige Ziele oder die geprüfte Katalog-Rückkehr", () => {
  assert.equal(loginDestination("USER"), "/meine-ausleihen");
  assert.equal(loginDestination("ADMIN"), "/admin");
  assert.equal(loginDestination("USER", "//fremd.example"), "/meine-ausleihen");
  assert.equal(loginDestination("ADMIN", "/?medium=dvd%3A2"), "/?medium=dvd%3A2");
});
