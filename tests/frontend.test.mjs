import assert from "node:assert/strict";
import test from "node:test";
import { catalogReturnPath, loginDestination } from "../lib/navigation.mjs";

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
