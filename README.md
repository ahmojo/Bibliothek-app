# Bibliotheksapp

Die Bibliotheksapp entsteht mit Next.js, React und JavaScript.
PostgreSQL 18 läuft lokal in Docker, die SQL-Abfragen laufen über `pg`.

## Voraussetzungen

- Node.js und npm
- Docker Desktop
- Git

## Installation und Start

1. Klone das Repository: `git clone https://github.com/ahmojo/Bibliothek-app.git`
2. Wechsle in den Projektordner und installiere die Pakete mit `npm ci`.
3. Kopiere `.env.example` nach `.env` und `.env.local.example` nach `.env.local`.
   Trage in beiden Dateien dasselbe Datenbankpasswort ein. Über `DATABASE_URL`
   verbindet sich die App mit der Datenbank.
4. Starte PostgreSQL: `docker compose up -d`.
5. Erstelle beim ersten Start die Testtabelle wie unten beschrieben.
6. Starte Next.js: `npm run dev`.

Danach kannst du die App unter http://localhost:3000 öffnen.

## Datenbank einrichten

Mit diesem Befehl öffnest du die Datenbank:

```bash
docker compose exec db psql -U bibliothek_app -d bibliothek
```

Lege dort einmalig die Testtabelle mit einem Eintrag an:

```sql
CREATE TABLE setup_check (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  message text NOT NULL
);

INSERT INTO setup_check (message)
VALUES ('Datenbankverbindung erfolgreich');
```

Die Startseite zeigt den Text aus `setup_check`. So lässt sich direkt sehen,
ob die Datenbankanbindung funktioniert. Ist die Tabelle leer, erscheint
`Keine Daten gefunden`.

Der Datenbankzugriff liegt zentral in `lib/db.js`. Der `pg.Pool` verwendet
Verbindungen wieder, und `pool.query()` gibt sie nach der Abfrage automatisch
zurück. Beim Entwickeln bleibt der Pool über `globalThis` erhalten, wenn Next.js
das Modul neu lädt. So entsteht nicht bei jeder Änderung ein neuer Pool.
`server-only` sorgt dafür, dass der Datenbankcode auf dem Server bleibt.

Die Daten liegen im Docker-Volume `postgres_data` und bleiben auch nach
`docker compose down` erhalten.

### Medien und Exemplare

- `books` speichert Titel, Autor und eindeutige ISBN. Verlag, Erscheinungsjahr,
  Kategorie und Beschreibung sind optional.
- `cd_dvd` speichert Titel und Medientyp. Erlaubt sind nur `CD` und `DVD`.
- `exemplar` speichert die eindeutige Inventarnummer, den Standort und die
  Zuordnung zu genau einem Buch oder einer CD/DVD. Ein Medium kann mehrere
  Exemplare haben.

Alle Tabellen haben automatisch erzeugte `bigint`-Primärschlüssel. ISBN und
Inventarnummer sind Textfelder, damit führende Nullen erhalten bleiben.
`NOT NULL`, `UNIQUE`, Fremdschlüssel und ein `CHECK` für die eindeutige
Medienzuordnung sichern die Regeln direkt in PostgreSQL, auch bei Updates.
Medien mit vorhandenen Exemplaren lassen sich nicht löschen.

### Migrationen

Starte die Datenbank und führe `npm run db:migrate` aus. Der Runner lädt die
Verbindungsdaten aus `.env.local` mit dem Next.js-Loader `@next/env`.

Schemaänderungen kommen als SQL-Dateien nach `migrations/`, zum Beispiel
`001_create_books.sql`. Verwende dreistellige, eindeutige Nummern und beschreibende
Namen. Der Runner arbeitet sie aufsteigend ab und merkt sich ausgeführte Dateien
in `schema_migrations`. Bereits ausgeführte Dateien werden übersprungen und dürfen
nicht mehr geändert oder umbenannt werden. Änderungen bekommen eine neue Datei.

Jede Datei und ihr Historieneintrag laufen in derselben Transaktion. Bei einem
Fehler wird beides zurückgerollt und der Lauf stoppt; vorherige erfolgreiche
Migrationen bleiben erhalten. Die SQL-Dateien enthalten keine eigenen
Transaktionsbefehle und müssen innerhalb einer Transaktion ausführbar sein.
Eine Datenbanksperre verhindert parallele Läufe.

Die Reihenfolge ist:

1. `001_create_books.sql` legt die Bücher an.
2. `002_create_cd_dvd.sql` legt CDs/DVDs mit eingeschränktem Medientyp an.
3. `003_create_exemplar.sql` legt Exemplare und ihre Beziehungen an. Die beiden
   Medientabellen müssen dafür bereits existieren.

Alle drei werden mit `npm run db:migrate` ausgeführt. Bestehende Daten und
`setup_check` bleiben erhalten.

## Technische Entscheidungen

- **JavaScript und JSX:** passen zur bisherigen Erfahrung mit Python und reichen
  für den aktuellen Projektumfang aus.
- **App Router:** hält die Seiten und serverseitigen Funktionen zusammen.
- **pg:** erlaubt direkte SQL-Abfragen ohne zusätzliches ORM.
- **CSS:** normales CSS reicht für das Styling.
- **npm und ESLint:** übernehmen Paketverwaltung und Codeprüfung.

## Prüfen und Stoppen

- `npm run lint` prüft den Code mit ESLint.
- `npm run build` erstellt den Produktionsbuild; `npm run start` startet ihn.
- `npm run test:db` prüft den Migration-Runner sowie das Speichern von Medien und
  Exemplaren, Pflichtfelder, eindeutige Werte, Medientypen und Beziehungen.
  Die Tests verwenden eigene Schemas, räumen sie danach auf und prüfen, dass
  `setup_check` unverändert bleibt.
- Datenbankprüfung: Startseite aufrufen und den angezeigten Text mit dem Eintrag
  in `setup_check` vergleichen.
- Next.js stoppen: `Ctrl+C`. Datenbank stoppen: `docker compose down`.

Zuletzt geprüft: alle 15 Datenbanktests, ESLint und Produktionsbuild erfolgreich.
Der zweite Migrationslauf hat keine Dateien erneut ausgeführt.

## Entwicklungsstand

Das Datenbankschema für Bücher, CDs/DVDs und Exemplare ist umgesetzt.
Eine Verwaltung über API oder Oberfläche gibt es noch nicht.
