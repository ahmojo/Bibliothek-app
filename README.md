# Bibliotheksapp

Die Bibliotheksapp entsteht mit Next.js, React und JavaScript.
PostgreSQL 18 läuft lokal in Docker, die SQL-Abfragen laufen über `pg`.

## Voraussetzungen

Node.js mit npm, Docker Desktop und Git.

## Installation und Start

1. Klone das Repository: `git clone https://github.com/ahmojo/Bibliothek-app.git`
2. Wechsle in den Projektordner und installiere die Pakete mit `npm ci`.
3. Kopiere `.env.example` nach `.env` und `.env.local.example` nach `.env.local`.
   Trage in beiden Dateien dasselbe Datenbankpasswort ein. Über `DATABASE_URL`
   verbindet sich die App mit der Datenbank.
4. Starte PostgreSQL: `docker compose up -d`.
5. Richte die Tabellen mit `npm run db:migrate` ein.
6. Starte Next.js: `npm run dev`.

Danach kannst du die App unter http://localhost:3000 öffnen.

## Datenbank einrichten

Die Startseite zeigt eine Nachricht aus `setup_check` als Verbindungsprüfung.
Die Daten im Docker-Volume `postgres_data` bleiben nach `docker compose down` erhalten.

`lib/db.js` stellt den gemeinsamen, durch `server-only` geschützten Pool bereit.
Services erhalten `db` als Parameter und bleiben so ohne Next.js-Kontext testbar.
Route Handler prüfen HTTP-Eingaben und Berechtigungen; `transaction()` in
`lib/postgres.mjs` hält zusammengehörige Änderungen auf demselben Client.
BIGINT-IDs bleiben Strings, DATE-Werte `YYYY-MM-DD`. Die zentrale Validierung
und Parser-Konfiguration verhindern Genauigkeitsverluste und Datumsverschiebungen.

### Medien und Exemplare

- `books` speichert Titel, Autor und eindeutige ISBN. Verlag, Erscheinungsjahr,
  Kategorie und Beschreibung sind optional.
- `cd_dvd` speichert Titel und Medientyp. Erlaubt sind nur `CD` und `DVD`.
- `exemplar` speichert die eindeutige Inventarnummer, den Standort und die
  Zuordnung zu genau einem Buch oder einer CD/DVD. Ein Medium kann mehrere
  Exemplare haben.

PostgreSQL erzwingt nicht leere Pflichttexte, Eindeutigkeit und Fremdschlüssel.
ISBN-10/13 werden auf ihre Prüfziffer geprüft und über die API ohne Bindestriche
oder Leerzeichen gespeichert. Erscheinungsjahre liegen zwischen 1 und dem nächsten
Kalenderjahr. Exemplare mit Ausleihhistorie dürfen keinem anderen Medium zugeordnet werden.

Cover liegen unter `storage/covers/` und sind von Git ausgeschlossen. Optional legt
`COVER_UPLOAD_DIR` in `.env.local` ein anderes dauerhaftes Verzeichnis fest.
Die Datenbank speichert nur `cover_image_path`; sichere Dateien und Datenbank gemeinsam.
`sharp` 0.35.5 prüft den Bildinhalt: JPG, PNG oder WebP, maximal 5 MiB und 20 Megapixel,
keine Animationen. Gespeichert wird WebP ohne Metadaten mit zufälligem Dateinamen.
Fehlerhafte DB-Änderungen entfernen die neue Datei; alte Cover werden erst nach
Erfolg gelöscht. Bei Abstürzen oder Löschfehlern können verwaiste Dateien bleiben.

### Benutzer und Ausleihen

`users` speichert Name, E-Mail, Passwort-Hash und die Rolle `USER` oder `ADMIN`.
E-Mails sind über `LOWER(email)` eindeutig; API-Antworten enthalten keine Hashes.

`ausleihe` verbindet Benutzer und Exemplar. Der Server verwendet die Session-ID
und das aktuelle Datum in `Europe/Zurich`; die Frist beträgt 30 Kalendertage.
Eine Ausleihe ist aktiv, solange `return_date IS NULL`, und ab dem Tag nach der
Fälligkeit überfällig. Fälligkeit und Rückgabe dürfen nicht vor der Ausleihe liegen.

Ausleihen sperren das Exemplar in einer Transaktion. Der partielle UNIQUE-Index
verhindert zusätzlich zwei aktive Ausleihen; Konflikte ergeben 409. Nur ADMIN darf
zurückgeben: Ein bedingtes UPDATE setzt das Rückgabedatum genau einmal.
Die Historie bleibt in derselben Tabelle, Verfügbarkeit wird aus aktiven Ausleihen
berechnet. Zusätzliche Historientabellen oder Statusspalten sind deshalb unnötig.

### Anmeldung und ADMIN-Setup

**NextAuth 4.24.15** verwendet den Credentials Provider mit der vorhandenen
`users`-Tabelle. E-Mails werden getrimmt und kleingeschrieben. **Argon2id**
(`argon2` 0.45.1, 64 MiB, drei Durchläufe) erschwert das Knacken gestohlener Hashes.

Ergänze in der nicht versionierten `.env.local`:

- `NEXTAUTH_URL`: lokal `http://localhost:3000`, auf dem Server die öffentliche HTTPS-URL.
- `NEXTAUTH_SECRET`: zufälliges Geheimnis, beispielsweise erzeugt mit
  `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"`.

Mit `npm run admin:create` legst du nach den Migrationen das erste ADMIN-Konto an.
Das Skript fragt Name, E-Mail und das verdeckte Passwort ab (12–50 Zeichen).
Bestehende Konten bleiben unverändert; sobald ein ADMIN existiert, stoppt das Skript.

NextAuth stellt `/api/auth/csrf`, `/api/auth/callback/credentials`,
`/api/auth/session` und `/api/auth/signout` bereit. Login und Logout erfolgen per
POST mit CSRF-Token. Eine eigene Login-Seite gibt es noch nicht.

Verschlüsselte JWT-Sessions gelten acht Stunden und brauchen keine zusätzlichen
Tabellen. Cookies sind `HttpOnly`, `SameSite=Lax` und unter HTTPS `Secure`.
Die Prüfungen in `lib/auth.js` laden Benutzer und Rolle frisch aus PostgreSQL,
damit Rollenänderungen sofort wirken. Fehlende Anmeldung ergibt 401, fehlende
ADMIN-Berechtigung 403.

### Öffentlicher Katalog

| Endpunkt | Antwort |
| --- | --- |
| `GET /api/catalog` | Alle Medien mit Anzahl gesamter und verfügbarer Exemplare |
| `GET /api/catalog/{type}/{id}` | Ein Medium mit paginierter Exemplarliste |

Filter: `type=all|book|cd|dvd`, `q` für Titel, Autor oder ISBN (maximal 200 Zeichen)
und `isbn` für eine vollständige gültige ISBN.
Beispiel: `/api/catalog?type=book&q=roman&page=1&pageSize=20`.

Alle Listen liefern `{ items, total, page, pageSize }`. `page` beginnt bei 1
(maximal 10000), `pageSize` ist standardmässig 20 (maximal 100).
Medien enthalten `total_copies` und `available_copies`; öffentliche Antworten
enthalten keine Ausleiherdaten. Validierungsfehler ergeben 400, unbekannte
Datensätze 404, interne Fehler eine allgemeine JSON-Antwort mit 500.

### Ausleih-API

| Endpunkt | Zweck |
| --- | --- |
| `POST /api/loans` | Angemeldet ein Exemplar ausleihen; JSON: `{ "exemplar_id": "1" }` |
| `GET /api/loans` | Ausschliesslich eigene Ausleihen |
| `GET /api/admin/loans` | Ausleihen aller Benutzer, nur ADMIN |
| `POST /api/admin/loans/{id}/return` | Rückgabe erfassen, nur ADMIN; kein Anfrageinhalt nötig |

Filter: `status=active|history|overdue`, Standard `active`. Aktive Listen sind nach
Fälligkeit sortiert, zurückgegebene Ausleihen nach Rückgabedatum absteigend.
Die Admin-Liste ergänzt Benutzername und E-Mail. Fremde Benutzer-IDs werden
abgelehnt. Ausleihe ergibt 201, Rückgabe 200, nicht verfügbare Exemplare und
wiederholte Rückgaben 409. Schreibanfragen brauchen den unten beschriebenen `Origin`.

### Verwaltungs-API

Alle folgenden Endpunkte verlangen eine aktuelle ADMIN-Session. Schreibende
Anfragen benötigen den Header `Origin` passend zu `NEXTAUTH_URL` (Schutz vor
fremden Webseiten). JSON-Anfragen verwenden `Content-Type: application/json`.
`PATCH` ändert nur übergebene Felder; unbekannte oder leere Änderungsobjekte ergeben 400.

| Endpunkt | Methode und Zweck |
| --- | --- |
| `/api/admin/books` | POST: Buch erstellen |
| `/api/admin/books/{id}` | GET: abrufen, PATCH: bearbeiten |
| `/api/admin/cd-dvd` | POST: CD/DVD erstellen |
| `/api/admin/cd-dvd/{id}` | GET: abrufen, PATCH: bearbeiten |
| `/api/admin/exemplars` | POST: anlegen; GET mit `book_id` oder `cd_dvd_id`: Exemplare samt Verfügbarkeit |
| `/api/admin/exemplars/{id}` | PATCH: bearbeiten; beim Medienwechsel die bisherige Zuordnung explizit auf `null` setzen |
| `/api/admin/users` | POST: Benutzer mit `name`, `email`, `password`, `role` erstellen; GET: auflisten |
| `/api/admin/users/{id}` | PATCH: Name, E-Mail, Passwort oder Rolle ändern |
| `/api/admin/media/{type}/{id}/cover` | PUT: Cover hochladen/ersetzen, DELETE: entfernen; `type=book\|cd\|dvd` |

Listen verwenden `page` und `pageSize` wie der Katalog. Cover-Uploads verwenden
`multipart/form-data` mit genau einer Datei im Feld `file`. Fehlende Anmeldung
ergibt 401, fehlende Berechtigung 403, Duplikate oder ungültige Referenzen 409,
zu grosse Dateien 413 und nicht lesbare beziehungsweise unerlaubte Formate 415.

### Migrationen

`npm run db:migrate` lädt `.env.local` über `@next/env` und führt Dateien aus
`migrations/` aufsteigend aus. `schema_migrations` verhindert Wiederholungen,
eine Sperre parallele Läufe. Jede Datei samt Historieneintrag läuft in einer
Transaktion; Fehler rollen sie zurück und stoppen den Lauf. Neue Änderungen
erhalten neue Nummern. Ausgeführte Dateien bleiben unverändert; eigene
Transaktionsbefehle gehören nicht in die SQL-Dateien.

| Migration | Zweck |
| --- | --- |
| `001_create_books.sql` | Bücher |
| `002_create_cd_dvd.sql` | CDs/DVDs |
| `003_create_exemplar.sql` | Exemplare mit Medienzuordnung |
| `004_create_users.sql` | Benutzer, Rollen und E-Mail-Eindeutigkeit |
| `005_create_ausleihe.sql` | Ausleihen, Datumsregeln und höchstens eine aktive Ausleihe |
| `006_create_setup_check.sql` | Verbindungsprüfung; Testnachricht nur bei leerer Tabelle |
| `007_validate_media_and_users.sql` | Pflichttexte, ISBN-Prüfung, Erscheinungsjahre und Fremdschlüsselindizes |
| `008_align_isbn_whitespace.sql` | Unicode-Leerzeichen wie in JavaScript behandeln und ISBN-Index erneuern |
| `009_add_cover_image_paths.sql` | Optionale Cover-Kennung für Bücher und CDs/DVDs |

Die Validierungsmigrationen melden Datenkonflikte mit Datensatz-IDs und brechen
ab. Bestandsdaten werden weder automatisch korrigiert noch gelöscht.

## Prüfen und Stoppen

- `npm run lint` prüft den Code mit ESLint.
- `npm run build` erstellt den Produktionsbuild; `npm run start` startet ihn.
- `npm run test:backend` prüft Services, Datentypen, Cover und parallele Ausleihabläufe.
- `npm run test:http` prüft nach dem Build die APIs inklusive Anmeldung und Berechtigungen.
- `npm run test:db` prüft Migrationen, Constraints, Datenpersistenz und Cleanup.
- Next.js stoppen: `Ctrl+C`. Datenbank stoppen: `docker compose down`.

Die Tests verwenden isolierte Schemas und räumen auch nach Fehlern auf.

## Entwicklungsstand

Das Backend umfasst Anmeldung, Katalog, Verwaltung, Cover sowie Ausleihe und Rückgabe.
Login-, Katalog- und Admin-Oberflächen fehlen noch.
