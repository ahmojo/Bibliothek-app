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

Für spätere Schemaänderungen sind nummerierte SQL-Dateien in `migrations/` geplant.
`schema_migrations` soll festhalten, welche davon bereits ausgeführt wurden.
Diese Dateien bleiben danach unverändert. Eingerichtet ist das noch nicht.

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
- Datenbankprüfung: Startseite aufrufen und den angezeigten Text mit dem Eintrag
  in `setup_check` vergleichen.
- Next.js stoppen: `Ctrl+C`. Datenbank stoppen: `docker compose down`.

