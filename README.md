# Bibliotheksapp

Webapp für Bücher, CDs/DVDs und ihre Exemplare: öffentlicher Katalog mit Suche, Anmeldung, eigene Ausleihen und Historie sowie Administration von Medien, Benutzern, Coverbildern und Rückgaben.

Technologien: Next.js 16.4.2 (App Router), React 19.3.0, JavaScript/JSX, PostgreSQL 18, pg, NextAuth 4, Argon2id und sharp.

## Voraussetzungen und Schnellstart

Node.js 24.11.1, npm 11.6.2 und laufendes Docker Desktop mit Linux-Containern (bisher geprüfte Docker Engine: 29.9.1); Git zum Klonen.

1. Repository klonen: git clone https://github.com/ahmojo/Bibliothek-app.git
2. In den geklonten Ordner wechseln und npm ci ausführen.
3. .env.example nach .env und .env.local.example nach .env.local kopieren. Dasselbe eigene Datenbankpasswort in POSTGRES_PASSWORD und DATABASE_URL einsetzen; Sonderzeichen im URL-Passwort URL-kodieren.
4. NEXTAUTH_SECRET in .env.local setzen, erzeugt mit:

   ```sh
   node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
   ```

5. docker compose up -d ausführen.
6. npm run db:migrate ausführen.
7. Mit npm run admin:create das erste Administratorkonto interaktiv anlegen.
8. npm run dev starten und http://localhost:3000 öffnen.

## Entwicklungsbefehle

| Befehl | Zweck |
| --- | --- |
| npm run dev | Entwicklungsserver |
| npm run build / npm run start | Produktionsbuild / Produktionsserver |
| npm run lint | ESLint |
| npm run db:migrate | Ausstehende Migrationen |
| npm run test:frontend | Frontend-Hilfsfunktionen |
| npm run test:backend / npm run test:db | Service- und Datenbankprüfungen |
| npm run test:http | API-Abnahme nach Build |
| npm run test:persistence | Eigener Docker-Neustarttest |
| docker compose down | Datenbank stoppen, Daten behalten |

Next.js mit Ctrl+C stoppen. Voraussetzungen der Tests und Grenzen stehen in der Fachdokumentation.

## Dokumentation

- [Installation und Konfiguration](docs/setup.md)
- [Architektur](docs/architecture.md)
- [Datenmodell und Migrationen](docs/database.md)
- [Authentifizierung](docs/authentication.md)
- [API-Referenz](docs/api.md)
- [Frontend und Design](docs/frontend.md)
- [Tests und Abnahme](docs/testing.md)
- [Technische Entscheidungen](docs/decisions.md)
- [Fehlerbehebung und Grenzen](docs/troubleshooting.md)
