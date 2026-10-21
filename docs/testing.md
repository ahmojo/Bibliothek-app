# Tests und Abnahme

[Zur Projektübersicht](../README.md)

## Prüfen und Stoppen

- `npm run lint` prüft den Code mit ESLint.
- `npm run build` erstellt den Produktionsbuild; `npm run start` startet ihn.
- `npm run test:backend` prüft Services, Datentypen, Cover und parallele Ausleihabläufe.
- `npm run test:http` prüft nach dem Build die APIs inklusive Anmeldung und Berechtigungen.
- `npm run test:frontend` prüft Rückkehrpfade, Login-Ziele, Datumsanzeigen und Statusprüfungen.
- `npm run test:db` prüft Migrationen, Constraints, Datenpersistenz und Cleanup.
- `npm run test:persistence` erstellt einen eigenen PostgreSQL-18-Container mit
  eigenem Volume und zufälligem lokalen Port, migriert eine frische Datenbank,
  vergleicht alle fünf Tabellen nach einem echten normalen Datenbankneustart und
  entfernt ausschliesslich diese Testressourcen. Docker-Zugriff ist erforderlich.
- Next.js stoppen: `Ctrl+C`. Datenbank stoppen: `docker compose down`.

`test:backend`, `test:db` und `test:http` verwenden UUID-basierte isolierte Schemas
in der Datenbank aus `DATABASE_URL`. Der DB-Benutzer braucht dafür `CREATE SCHEMA`.
Bestehende Entwicklungstabellen werden nicht geändert. Covertests nutzen eigene
temporäre Verzeichnisse. Cleanup ist auch für Testfehler registriert; ein harter
Prozessabbruch kann dennoch Testressourcen zurücklassen.

Für die Abnahme eine eigene PostgreSQL-18-Testinstanz verwenden und deren URL
explizit als Prozessvariable setzen, bevor diese Befehle ausgeführt werden:

```text
npm run lint
npm run test:backend
npm run test:db
npm run build
npm run test:http
npm run test:persistence
```

`test:http` startet den gebauten Produktionsserver selbst auf einem freien
Loopback-Port mit eigener NextAuth-Konfiguration. Ein laufender Entwicklungsserver
wird dafür nicht benötigt. Der Persistenztest verwendet keine `DATABASE_URL`.
Eine separate reine Unit-Test-Suite gibt es nicht; die Backend-Suite enthält
sowohl isolierte Validierungs-/Hashingtests als auch Service-Integrationstests.
Die bisherige Prüfung über eine neue DB-Verbindung ersetzt keinen Neustarttest.

## Frontend und manuelle Abnahme

Zusätzlich `npm run test:frontend` ausführen. Diese Node-Test-Suite prüft Hilfsfunktionen; sie ersetzt keine Browser- oder Screenreader-Abnahme. Die Tests verwenden `node:test` und Assertions aus Node.js. DB- und API-Tests prüfen unter anderem Berechtigungen, Validierung, Migrationen, Ausleihe/Rückgabe und konkurrierende Zugriffe.

Noch manuell zu prüfen: Katalogsuche, Login/Logout, Ausleihe, Rückgabe und Historie; Tastaturfokus, langsames Netz, Leerzustände und Fehler bei 390, 768, 1024 und 1440 Pixeln. Diese Checkliste beschreibt keine bereits bestandene Abnahme. Es werden keine pauschalen Test-Erfolgsaussagen aus früheren Läufen übernommen.
