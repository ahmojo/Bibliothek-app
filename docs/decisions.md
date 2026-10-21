# Technische Entscheidungen

[Zur Projektübersicht](../README.md)

Die folgende Übersicht erhält Begründungen aus der bisherigen README und kennzeichnet Projektvorgaben ohne rückwirkend erfundene Auswahlgeschichte.

| Entscheidung | Ausgangslage und Begründung | Auswirkungen |
| --- | --- | --- |
| JavaScript/JSX | Verbindliche Projektvorgabe; widerspricht der TypeScript-Angabe der externen Designreferenz. Keine weitere Auswahlbegründung dokumentiert. | Kein TypeScript-Buildschritt. |
| PostgreSQL 18 | Vorgegebene relationale Datenbank; Constraints sichern Beziehungen und Eindeutigkeit. Kein historischer Produktvergleich dokumentiert. | Lokaler Docker-Dienst und persistentes Volume. |
| pg statt ORM | Projektvorgabe mit direkten SQL-Abfragen. Kein historischer ORM-Vergleich dokumentiert. | SQL und Datentypen werden explizit behandelt. |
| Separate SQL-Migrationen | Schemaänderungen sollen reproduzierbar und nachvollziehbar sein. | Neue nummerierte Dateien; Historie und Transaktionen im Runner. |
| NextAuth Credentials | Anmeldung soll die vorhandene users-Tabelle verwenden. | Argon2id-Hashes; verschlüsselte JWT-Sessions ohne weitere Sitzungstabellen. |
| Services und Route Handler trennen | Services sollen ohne Next.js-Kontext testbar bleiben. | HTTP und Rechteprüfung an der Grenze, Geschäftslogik in lib/. |
| db-Parameter | Explizite Verbindung erlaubt Tests und zusammenhängende Transaktionen. | Services erhalten Pool oder passenden Client. |
| BIGINT als String, DATE als Kalendertag | Genauigkeitsverlust und Datumsverschiebung vermeiden. | Gemeinsame Parser und Validierung, Europe/Zurich für Geschäftstage. |
| Verfügbarkeit aus aktiven Ausleihen | Aktive Ausleihe ist durch return_date IS NULL definiert. | Keine redundante Statusspalte; Sperre und partieller UNIQUE-Index verhindern Doppelvergabe. |
| Historie in ausleihe | Rückgabedatum erhält abgeschlossene Vorgänge. | Keine separate History-Tabelle erforderlich. |
| Cover im Dateisystem | Datenbank speichert nur die Kennung. | Laufzeitverzeichnis separat sichern; WebP-Konvertierung entfernt Metadaten, verwaiste Dateien bleiben möglich. |
| Gemeinsame Design-Tokens | Externe Designreferenz und wiederverwendbare Komponenten halten die Oberfläche konsistent. | Lokale Schrift vermeidet Font-Server beim Build; dokumentierte Abweichungen im Frontend-Handbuch. |
