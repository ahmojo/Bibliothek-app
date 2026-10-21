# Installation und Konfiguration

[Zur Projektübersicht](../README.md)

## Voraussetzungen

Geprüfte Umgebung: Node.js 24.11.1, npm 11.6.2, Docker Engine 29.9.1
(Docker Desktop mit Linux-Containern), PostgreSQL 18. Docker Desktop muss laufen.
Git wird zum Klonen benötigt. `argon2` und `sharp` enthalten native Komponenten;
die Installation muss zur verwendeten Node.js-Version und Plattform passen.

## Installation und Start

1. Klone das Repository: `git clone https://github.com/ahmojo/Bibliothek-app.git`
2. Wechsle in den Projektordner und installiere die Pakete mit `npm ci`.
3. Kopiere `.env.example` nach `.env` und `.env.local.example` nach `.env.local`.
   Trage in beiden Dateien dasselbe Datenbankpasswort ein. Über `DATABASE_URL`
   verbindet sich die App mit der Datenbank. Sonderzeichen im URL-Passwort müssen
   URL-kodiert werden. Erzeuge auch `NEXTAUTH_SECRET` wie unten beschrieben.
4. Starte PostgreSQL: `docker compose up -d`.
5. Richte die Tabellen mit `npm run db:migrate` ein.
6. Starte Next.js: `npm run dev`.

Danach kannst du die App unter http://localhost:3000 öffnen.

### Umgebungsvariablen

| Variable | Verwendung |
| --- | --- |
| `POSTGRES_DB` | Datenbankname in `.env`, von Docker Compose bei der Initialisierung verwendet |
| `POSTGRES_USER` | Initialer PostgreSQL-Benutzer in `.env` |
| `POSTGRES_PASSWORD` | Eigenes Datenbankpasswort in `.env`; Platzhalter ersetzen |
| `DATABASE_URL` | Verbindungs-URL in `.env.local`, auch für Migrationen, Admin-Setup und DB-Tests |
| `NEXTAUTH_URL` | Exakte öffentliche Herkunft der App in `.env.local`; lokal `http://localhost:3000` |
| `NEXTAUTH_SECRET` | Zufälliges dauerhaftes Session-Geheimnis in `.env.local` |
| `COVER_UPLOAD_DIR` | Optionales dauerhaftes Cover-Verzeichnis in `.env.local`; leer bedeutet `storage/covers/` |

`.env` und `.env.local` sind von Git ausgeschlossen; versioniert sind nur die
Beispieldateien mit Platzhaltern. `PGOPTIONS` kann intern für ein isoliertes
Testschema verwendet werden; die Bibliothekszeitzone setzt der App-Pool selbst.
Bereits gesetzte Prozessvariablen haben Vorrang vor den Env-Dateien.

## PostgreSQL und Persistenz

Die Startseite zeigt den öffentlichen Medienkatalog. `setup_check` bleibt als
technische Verbindungsprüfung in der Datenbank erhalten.
Die Daten im Docker-Volume `postgres_data` bleiben nach `docker compose down` erhalten.
PostgreSQL ist nur über `127.0.0.1:5432` veröffentlicht. Das Volume ist für
PostgreSQL 18 unter `/var/lib/postgresql` eingebunden. `docker compose restart db`
startet die Datenbank normal neu. `docker compose down -v` löscht das Volume und
damit die Daten; diesen Befehl nicht für normales Stoppen verwenden.
Änderungen an `POSTGRES_*` ändern keine Zugangsdaten in einem bereits initialisierten Volume.

## Erstes Administratorkonto

Mit `npm run admin:create` legst du nach den Migrationen das erste ADMIN-Konto an.
Das Skript fragt Name, E-Mail und das verdeckte Passwort ab (12–50 Zeichen).
Bestehende Konten bleiben unverändert; sobald ein ADMIN existiert, stoppt das Skript.

## Testdaten und Stoppen

Es gibt keinen Seed-Befehl. Nach dem ADMIN-Setup Medien, Exemplare und Benutzer über die Administration anlegen. Tests erzeugen eigene Daten in isolierten Schemas.

Next.js mit `Ctrl+C`, PostgreSQL mit `docker compose down` stoppen. Für den Produktionsbetrieb: `npm run build`, danach `npm run start`.

Cover-Verzeichnis und Datenbank gemeinsam sichern; Details stehen im [Datenmodell](database.md).
