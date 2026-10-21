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
5. Richte die Tabellen mit `npm run db:migrate` ein.
6. Starte Next.js: `npm run dev`.

Danach kannst du die App unter http://localhost:3000 öffnen.

## Datenbank einrichten

Mit diesem Befehl öffnest du die Datenbank:

```bash
docker compose exec db psql -U bibliothek_app -d bibliothek
```

Die Startseite zeigt eine Nachricht aus `setup_check` als Verbindungsprüfung.
Die Migrationen richten die Tabelle ein und erhalten vorhandene Nachrichten.

`lib/db.js` verwendet einen gemeinsamen `pg.Pool`, beim Entwickeln auch über
Modul-Neuladungen hinweg. `server-only` verhindert Client-Imports des Datenbankcodes.

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
PostgreSQL-Constraints sichern Pflichtfelder, Eindeutigkeit und Medienzuordnung.
Medien mit vorhandenen Exemplaren lassen sich nicht löschen.

Pflichttexte dürfen auch nicht leer oder nur Leerraum sein. ISBN-10 und ISBN-13
werden auf ihre Prüfziffer geprüft; Bindestriche und Leerzeichen zählen für
Suche und Eindeutigkeit nicht mit. Gespeicherte ISBNs werden dabei nicht verändert.
Erscheinungsjahre sind optional und liegen zwischen 1 und dem nächsten Kalenderjahr.
Indizes auf den Fremdschlüsseln unterstützen Zuordnungen und Referenzprüfungen.

### Benutzer und Ausleihen

`users` enthält `id`, `name`, `email`, `password_hash` und `role`. Alle Felder sind
Pflicht; ein CHECK erlaubt nur `USER` und `ADMIN`. Ein UNIQUE-Index auf
`LOWER(email)` macht E-Mails unabhängig von der Schreibweise eindeutig.

`ausleihe` verbindet jeweils einen Benutzer und ein Exemplar über Fremdschlüssel.
`loan_date` und `due_date` sind Pflichtdaten, `return_date` ist optional. Fälligkeit
und Rückgabe dürfen nicht vor der Ausleihe liegen. `ON DELETE RESTRICT` schützt
referenzierte Benutzer und Exemplare vor dem Löschen.

Bei `return_date IS NULL` ist die Ausleihe aktiv. Ein partieller UNIQUE-Index auf
`exemplar_id` erlaubt höchstens eine aktive Ausleihe pro Exemplar. Zurückgegebene
Ausleihen bleiben als Historie in derselben Tabelle. Eine Historientabelle und
eine `available`-Spalte sind unnötig: Verfügbarkeit ergibt sich aus aktiven Ausleihen.

Die reguläre Frist beträgt 30 Tage; ihre Berechnung folgt später.

### Anmeldung und ADMIN-Setup

Die Anmeldung verwendet **NextAuth 4.24.15**, den stabilen Release mit Unterstützung
für Next.js 16 und React 19. Der Credentials Provider prüft die vorhandene
`users`-Tabelle; E-Mails werden getrimmt und kleingeschrieben. Passwörter werden mit
**Argon2id** gespeichert (`argon2` 0.45.1, 64 MiB, drei Durchläufe, zufälliges Salt).
Das speicherintensive Verfahren erschwert das Durchprobieren gestohlener Hashes.
Passwörter und Hashes erscheinen weder in Sessions noch im Katalog.

Ergänze in der nicht versionierten `.env.local`:

- `NEXTAUTH_URL`: lokal `http://localhost:3000`, auf dem Server die öffentliche HTTPS-URL.
- `NEXTAUTH_SECRET`: zufälliges Geheimnis, beispielsweise erzeugt mit
  `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"`.

Mit **`npm run admin:create`** legst du nach den Migrationen das erste ADMIN-Konto
an. Das Skript fragt Name, E-Mail und zweimal das verdeckte Passwort ab
(12–50 Zeichen). Es verändert keine bestehenden Konten und verweigert die
Einrichtung, sobald ein ADMIN existiert.

NextAuth stellt `/api/auth/csrf`, `/api/auth/callback/credentials`,
`/api/auth/session` und `/api/auth/signout` bereit. Login und Logout erfolgen per
POST mit CSRF-Token. Eine eigene Login-Seite gibt es noch nicht.

Verschlüsselte JWT-Sessions laufen nach acht Stunden ab und benötigen keine neuen
Datenbanktabellen. NextAuth setzt `HttpOnly` und `SameSite=Lax`, unter HTTPS auch
`Secure`. `getCurrentUser()`, `requireUser()` und `requireAdmin()` in `lib/auth.js`
sind für serverseitige Prüfungen gedacht. Jede Session-Abfrage lädt den Benutzer
und seine Rolle frisch aus PostgreSQL; eine Herabstufung wird so bei der nächsten
geschützten Aktion berücksichtigt. Fehlende Anmeldung ergibt 401, fehlende
ADMIN-Berechtigung 403.

Dokumentation: [NextAuth/App Router](https://next-auth.js.org/configuration/nextjs),
[Credentials](https://next-auth.js.org/providers/credentials),
[Argon2](https://github.com/ranisalt/node-argon2).

### Öffentlicher Katalog

| Endpunkt | Antwort |
| --- | --- |
| `GET /api/catalog` | Alle Medien mit Anzahl gesamter und verfügbarer Exemplare |
| `GET /api/catalog/{type}/{id}` | Ein Medium mit paginierter Exemplarliste |

Die Liste akzeptiert `type=all|book|cd|dvd` und `q` für Titel sowie bei Büchern
Autor oder ISBN. Beispiel: `/api/catalog?type=book&q=roman&page=1&pageSize=20`.
Der optionale Filter `isbn` erwartet eine vollständige ISBN mit gültiger Prüfziffer,
etwa `?isbn=978-0-306-40615-7`; `q` bleibt eine freie Suche.
`page` beginnt bei 1 (höchstens 10000), `pageSize` ist standardmässig 20 und
höchstens 100. Beide Parameter gelten auch für die Exemplare der Detailabfrage.
Die Suche ist auf 200 Zeichen begrenzt. IDs bleiben als `bigint`-Werte in JSON
Strings, damit keine Genauigkeit verloren geht.

Listen liefern `{ items, total, page, pageSize }`; Medien enthalten
`total_copies` und `available_copies`. Ein Exemplar ist verfügbar, wenn keine
Ausleihe mit `return_date IS NULL` existiert. Die Antworten werden nicht gecacht
und enthalten keine Ausleiherdaten. Validierungsfehler ergeben 400, unbekannte
Medien 404, interne Fehler eine allgemeine JSON-Antwort mit 500.

### Migrationen

`npm run db:migrate` lädt `.env.local` über `@next/env` und führt SQL-Dateien aus
`migrations/` aufsteigend aus. `schema_migrations` verhindert Wiederholungen,
eine Datenbanksperre parallele Läufe. Jede Datei samt Historieneintrag läuft in
einer Transaktion; bei einem Fehler wird sie zurückgerollt und der Lauf stoppt.

Neue Änderungen bekommen eine neue Datei mit dreistelliger, eindeutiger Nummer.
Ausgeführte Dateien bleiben unverändert. SQL-Dateien dürfen keine eigenen
Transaktionsbefehle enthalten und müssen innerhalb einer Transaktion ausführbar sein.

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

Die Validierungsmigrationen melden Datenkonflikte mit Datensatz-IDs und brechen
ab. Bestandsdaten werden weder automatisch korrigiert noch gelöscht.

## Prüfen und Stoppen

- `npm run lint` prüft den Code mit ESLint.
- `npm run build` erstellt den Produktionsbuild; `npm run start` startet ihn.
- `npm run test:backend` prüft Passwörter, ADMIN-Setup, Rollen und Katalogabfragen.
- `npm run test:http` prüft nach dem Build Startseite, Login, CSRF, Sessions,
  Logout und Katalog-Endpunkte mit einem eigenen Produktionsserver.
- `npm run test:db` prüft Migrationen, Constraints, Datenpersistenz und Cleanup.
- Next.js stoppen: `Ctrl+C`. Datenbank stoppen: `docker compose down`.

Die Tests verwenden isolierte Schemas ohne vorausgesetzte Tabellen in `public`
und räumen auch nach Fehlern auf. Der HTTP-Test erzeugt ein eigenes Session-Geheimnis.

## Entwicklungsstand

Das Datenbankschema für Medien, Exemplare, Benutzer und Ausleihen ist umgesetzt.
Passwortverarbeitung, NextAuth und die lesende Katalog-API sind umgesetzt.
Login-Oberfläche, Medienverwaltung sowie Ausleih- und Rückgabelogik fehlen noch.
