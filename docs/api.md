# API-Referenz

[Zur Projektübersicht](../README.md)

### Öffentlicher Katalog

| Endpunkt | Antwort |
| --- | --- |
| `GET /api/catalog` | Alle Medien mit Anzahl gesamter und verfügbarer Exemplare |
| `GET /api/catalog/{type}/{id}` | Ein Medium mit paginierter Exemplarliste |

Filter: `type=all|book|cd|dvd`, `q` für Titel, Autor oder ISBN (maximal 200 Zeichen)
und `isbn` für eine vollständige gültige ISBN.
Beispiel: `/api/catalog?type=book&q=roman&page=1&pageSize=20`.

Kataloglisten liefern `{ items, total, page, pageSize }`. `page` beginnt bei 1
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

## Gemeinsamer Vertrag

BIGINT-IDs sind JSON-Strings, DATE-Werte `YYYY-MM-DD`. Fehler liefern `{ "error": "Meldung" }`: 400 ungültige Eingabe, 401 keine Anmeldung, 403 fehlende Rolle oder falscher Origin, 404 nicht gefunden, 409 Konflikt, 413 zu grosser Body, 415 falsches Format, 500 interner Fehler. JSON-Bodies sind auf 64 KiB begrenzt. Erfolgreiche GET/PATCH/PUT/DELETE liefern 200, Erstellungen 201.

## Authentifizierung

Der NextAuth-Catch-all `/api/auth/[...nextauth]` exportiert GET und POST. GET `/api/auth/providers` liefert Provider-Metadaten, GET `/api/auth/csrf` ein CSRF-Token, GET `/api/auth/session` die Sitzung. POST `/api/auth/callback/credentials` nimmt E-Mail, Passwort und CSRF-Token als Formulardaten entgegen; POST `/api/auth/signout` meldet mit CSRF-Token ab. NextAuth liefert abhängig vom Aufruf JSON oder Redirects, bei fehlgeschlagenen Credentials einen Authentifizierungsfehler. Die eingebauten Sign-in-/Sign-out-Ansichten sind zusätzlich über GET erreichbar. Siehe [Authentifizierung](authentication.md).

## Eingaben und Antworten der Verwaltung

| Ressource | Eingaben | Erfolgsantwort |
| --- | --- | --- |
| Bücher POST/PATCH | `title`, `author`, `isbn`; optional `publisher`, `publication_year`, `category`, `description` | Buchdatensatz einschliesslich ID und optionalem `cover_image_path`; GET nach ID ebenso |
| CD/DVD POST/PATCH | `title`, `media_type` (`CD` oder `DVD`) | CD/DVD-Datensatz; GET nach ID ebenso |
| Exemplare POST/PATCH | `inventory_number`, `location`, genau eine Zuordnung `book_id`/`cd_dvd_id` | Exemplardatensatz |
| Exemplare GET | Genau eines von `book_id`, `cd_dvd_id`, dazu Pagination | `{ items, total, page, pageSize }`, Exemplare mit Verfügbarkeit |
| Benutzer POST | `name`, `email`, `password`, `role` | Benutzer ohne Passwort-Hash |
| Benutzer PATCH | Teilmenge derselben Felder | Aktualisierter Benutzer ohne Hash |
| Benutzer GET | Pagination | `{ items, total, page, pageSize }`, Benutzer ohne Hash |
| Cover PUT/DELETE | Pfadparameter `type`, `id`; PUT zusätzlich Datei | Aktualisierter Medientatensatz |
| Ausleihe POST | Nur `exemplar_id`; Benutzer stammt aus Session | Ausleihdatensatz mit ID, Benutzer-/Exemplar-ID und drei Datumsfeldern |
| Ausleihen GET | Status und Pagination | Listenobjekt mit Ausleihdaten, Titel, Inventarnummer, Standort, `overdue`; ADMIN zusätzlich Name/E-Mail |
| Rückgabe POST | ID im Pfad, kein Body | Ausleihdatensatz mit gesetztem `return_date` |

Katalogdetails liefern das Medium mit `exemplars`, `page`, `pageSize`; sie sind kein Listenobjekt mit `items` und `total`. Exemplarantworten enthalten `available`. Die Detailroute akzeptiert nur Pagination, keine Katalogfilter.

## Öffentliche Coverbilder

GET `/api/covers/{filename}` benötigt keine Anmeldung und liefert WebP-Bilddaten. `filename` muss eine UUID mit `.webp` sein: 400 bei ungültiger Kennung, 404 bei fehlender Datei, 500 bei internem Fehler. Upload und Entfernen verlangen ADMIN und passenden Origin.
