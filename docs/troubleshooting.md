# Fehlerbehebung und bekannte Grenzen

[Zur Projektübersicht](../README.md)

| Problem | Prüfung und Lösung |
| --- | --- |
| Native Module installieren nicht | Node-/Plattformkompatibilität von argon2 und sharp prüfen; mit der in setup.md genannten Umgebung und npm ci installieren. |
| Docker oder PostgreSQL nicht erreichbar | Docker Desktop mit Linux-Containern starten; docker compose ps und docker compose logs db prüfen; lokalen Port 5432 kontrollieren. |
| Datenbankanmeldung scheitert | DATABASE_URL und POSTGRES_PASSWORD abgleichen, Sonderzeichen URL-kodieren. Ein bestehendes Volume übernimmt geänderte POSTGRES-Variablen nicht. |
| Migration bricht ab | Gemeldete Konflikt-IDs fachlich prüfen. Bereits ausgeführte Dateien nicht ändern; neue nummerierte Migration verwenden. |
| DATABASE_URL fehlt | .env.local aus Vorlage anlegen; gesetzte Prozessvariablen auf unbeabsichtigte Overrides prüfen. |
| Anmeldung oder Schreibzugriff scheitert | NEXTAUTH_SECRET setzen, NEXTAUTH_URL und Origin auf dieselbe Herkunft abstimmen; aktuellen ADMIN-Status prüfen. |
| Cover-Upload scheitert | Genau eine Datei im Feld file; JPG/PNG/WebP ohne Animation, höchstens 5 MiB und 20 Megapixel; Verzeichnis muss beschreibbar sein. Ein bereits gespeichertes Medium bleibt erhalten. |
| HTTP-Test startet nicht | Zuerst npm run build ausführen; Datenbankzugriff und CREATE-SCHEMA-Recht prüfen. |

## Bekannte Grenzen

Lösch-APIs für Medien, Exemplare und Benutzer sowie Passwortzurücksetzen sind
nicht implementiert.

Anmeldeversuche haben derzeit keine anwendungseigene Ratenbegrenzung. Änderungen
von Passwörtern widerrufen bestehende JWTs nicht automatisch; Sessions gelten bis
zum Ablauf oder Abmelden, die aktuelle Rolle wird weiterhin aus der DB gelesen.
Die lokale Abnahme prüft HTTP; HTTPS, `Secure`-Cookies und Proxy-Konfiguration
müssen in der Zielumgebung geprüft werden. Ein wiederhergestelltes Backup von
Datenbank und Cover-Verzeichnis wurde hier nicht getestet.

`npm audit` meldete am 21.10.2026 fünf als `high` eingestufte betroffene Pakete
in der Entwicklungsabhängigkeitskette `eslint-config-next` →
`@next/eslint-plugin-next` → `fast-glob` → `micromatch` → `braces`.
Dies ist eine gemeinsame Schwachstellenkette (GHSA-vfj7-8cjw-p6xm), nicht fünf
unabhängige Lücken. `npm audit --omit=dev` meldete null bekannte Befunde.
Es wurde kein inkompatibler Downgrade der Next.js-Werkzeuge durchgeführt.
