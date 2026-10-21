# Technische Architektur

[Zur Projektübersicht](../README.md)

Next.js 16.4.2 verwendet den App Router mit React 19.3.0 und JavaScript/JSX. Seiten und serverseitige Zugriffsprüfungen liegen in app/, interaktive Client-Komponenten in components/. Route Handler unter app/api/ übersetzen HTTP-Anfragen in Service-Aufrufe.

`lib/db.js` stellt den gemeinsamen, durch `server-only` geschützten Pool bereit.
Services erhalten `db` als Parameter und bleiben so ohne Next.js-Kontext testbar.
Route Handler prüfen HTTP-Eingaben und Berechtigungen; `transaction()` in
`lib/postgres.mjs` hält zusammengehörige Änderungen auf demselben Client.
BIGINT-IDs bleiben Strings, DATE-Werte `YYYY-MM-DD`. Die zentrale Validierung
und Parser-Konfiguration verhindern Genauigkeitsverluste und Datumsverschiebungen.

| Ordner | Verantwortung |
| --- | --- |
| app/ | Seiten, Layout, CSS und API-Route-Handler |
| components/ | Interaktive React-Oberfläche und gemeinsame UI |
| lib/ | Services, Authentifizierung, Validierung, Pool und HTTP-Fehler |
| migrations/ | Nummerierte SQL-Dateien |
| scripts/ | Migrationen und erstes ADMIN-Konto |
| tests/ | Node-Tests und isolierte Testdatenbanken |
| storage/covers/ | Laufzeitdateien, nicht versioniert |

SQL-Werte werden parametrisiert. lib/http.mjs vereinheitlicht erwartete HTTP- und PostgreSQL-Fehler; unerwartete Fehler werden ohne interne Details beantwortet. server-only verhindert versehentliche Client-Imports. NextAuth übernimmt Sitzungen, argon2 Passwort-Hashing, sharp die sichere Bildkonvertierung und @next/env das Laden lokaler Konfiguration für Skripte. ESLint prüft den Code. Details und Begründungen: [Entscheidungen](decisions.md).
