# Bibliotheksapp

Next.js-Anwendung mit PostgreSQL als Datenbank, die lokal in Docker läuft.

## Voraussetzungen

- Node.js und npm
- Docker Desktop
- Git
- VS Code

## Installation und Start
0. git clone https://github.com/ahmojo/Bibliothek-app.git
1. Abhängigkeiten installieren: `npm ci`
2. `.env.example` nach `.env` und `.env.local.example` nach `.env.local` kopieren und dasselbe Datenbankpasswort eintragen.
3. PostgreSQL starten: `docker compose up -d`
4. Bei der ersten Einrichtung die Testtabelle erstellen (siehe unten).
5. Next.js starten: `npm run dev`

Die Anwendung ist unter http://localhost:3000 erreichbar.

## Datenbank einrichten 

## Hier noch ein seed skript schreiben | later

Datenbank öffnen:

```bash
docker compose exec db psql -U bibliothek_app -d bibliothek
```

Beim ersten Start ausführen:

```sql
CREATE TABLE setup_check (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  message text NOT NULL
);

INSERT INTO setup_check (message)
VALUES ('Datenbankverbindung erfolgreich');
```

Die Anwendung liest den gespeicherten Text serverseitig aus PostgreSQL und zeigt ihn auf der Startseite an.

## Technische Entscheidungen

- **JavaScript statt TypeScript:** Ich bin durch Python eher an dynamische Typisierung gewöhnt und arbeite lieber mit JavaScript. Für den aktuellen Projektumfang lohnt sich der zusätzliche TypeScript-Aufwand für mich nicht.
- **App Router:** Für die Seitenstruktur und serverseitige Funktionen.
- **ESLint:** Zur Überprüfung des Codes.
- **CSS:** Für das Styling reicht normales CSS.
- **npm:** Zur Verwaltung der Abhängigkeiten.
- **pg:** Für direkte SQL-Abfragen ohne zusätzliches ORM.

Dokumentation zu pg: https://node-postgres.com/

## Verwendete Versionen

- Next.js: 16.4.2
- React: 19.2.0
- React DOM: 19.2.0
- PostgreSQL: 18
- Node.js, Git und Docker: Versionen noch ergänzen

## Codeprüfung

- `npm run build` - Produktionsbuild erstellen.
- `npm run lint` - Code mit ESLint prüfen.

## Datenpersistenz

Die Datenbank verwendet das Docker-Volume `postgres_data`.

Ich habe den Container mit `docker compose down` entfernt und mit `docker compose up -d` neu gestartet. Der Testeintrag war danach weiterhin vorhanden.

Die Daten bleiben somit auch nach einem Container-Neustart erhalten.

## Projekt stoppen

- Next.js: `Ctrl+C`
- Datenbank: `docker compose down`

## Fehlerbehebung

