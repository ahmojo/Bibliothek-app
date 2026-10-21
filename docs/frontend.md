# Benutzeroberfläche und Designsystem

[Zur Projektübersicht](../README.md)

## Frontend

`app/` enthält Katalog, Login, eigene Ausleihen und die geschützte Administration.
`components/` bündelt gemeinsame Formulare, Statusanzeigen, responsive Tabellen
und Dialoge mit Tastaturfokus. Tabellen werden mobil zu beschrifteten Zeilen.

Tokens, Typografie, Responsive-Grenzen und Bewegungen stammen aus `../designV2.md`;
die Wortmarke bleibt auf Wunsch ohne Punkt. Source Sans 3 liegt samt OFL-Lizenz
lokal unter `app/fonts/`, damit der Build keinen Font-Server braucht. Abweichend
von der TypeScript-Angabe im Design bleibt das Frontend gemäss aktuellem Auftrag
in JavaScript/JSX; Rollenwerte bleiben `USER` und `ADMIN`.

Katalog und Details laden die bestehenden `/api/catalog`-Endpunkte. Suche und
Filter bleiben in der URL; echte Cover und Platzhalter werden unterstützt.
Eine Ausleihe wird nach Exemplarwahl ausdrücklich über `POST /api/loans` bestätigt.
Die Rückgabefrist kommt vom Server. Konflikte aktualisieren die Verfügbarkeit;
bei unklarem Netzwerkresultat wird vor einem erneuten Versuch der Ausleihstatus
geprüft. `/meine-ausleihen` lädt eigene aktive Ausleihen und Historie getrennt über
`GET /api/loans?status=active|history`. Datumswerte bleiben Kalendertage; der Server
liefert Überfälligkeit und den Schweizer Vergleichstag für „Heute fällig“.

Die Administration startet mit aktiven Ausleihen und bietet Medien, Exemplare,
Benutzer sowie Ausleihhistorie und überfällige Einträge. Der Medieneditor nutzt die vorhandenen
`/api/admin/books`- und `/api/admin/cd-dvd`-Routen. Cover werden separat über
`/api/admin/media/{type}/{id}/cover` hochgeladen, ersetzt oder entfernt. Scheitert
nur der Upload, bleibt der Medieneintrag gespeichert und im Editor erhalten.

Exemplare werden nach Medientyp und Medium ausgewählt. Die Medienauswahl unterstützt
Suche und Blättern; die Exemplarliste verwendet `/api/admin/exemplars` mit genau
einer Medienzuordnung. Inventarnummer und Standort sind bearbeitbar. Eine bestehende
Ausleihhistorie schützt das Backend vor einem Wechsel zu einem anderen Medium.
`/api/admin/users` verwaltet Name, E-Mail und Rolle. Ein maskiertes Passwort wird
nur bei Neuanlage eingegeben; Änderungen am eigenen Konto aktualisieren die Sitzung.

Rückgaben werden im Dialog mit Benutzer, Titel und Inventarnummer bestätigt und
über `POST /api/admin/loans/{id}/return` erfasst. Erst die Serverantwort bestätigt
den Erfolg; bei unklarem Ergebnis kann der Status geprüft werden. Listen und
Katalog laden aktuelle Verfügbarkeit ohne dauerhaften Browsercache. Gemeinsame
Tabellen, Dialoge und Formularfelder halten alle Verwaltungsbereiche einheitlich.

`/login` und Abmelden verwenden NextAuth. Ein optionales `next` akzeptiert nur
interne Katalogpfade; sonst gilt das Ziel der Rolle. Geschützte Seiten prüfen
Anmeldung und Rolle serverseitig. Frontend und Backend verwenden dieselbe
ISBN-Prüfung; weitere Geschäftsregeln bleiben im Backend.

## Gestaltung und Bedienbarkeit

`app/globals.css` definiert warme Flächen (`#FAF9F6`), Waldgrün (`#174C3A`), Terrakotta (`#D45A2A`), ein 4-Pixel-Abstandsraster und Radien von 8 bzw. 12 Pixeln. Die Schrift ist Source Sans 3. Die Navigation kennzeichnet die aktive Seite und bietet rollenabhängige Links. Fokusrahmen, Skip-Link, beschriftete Felder, Dialogfokus und reduzierte Bewegung unterstützen die Bedienbarkeit. Lade-, Fehler- und Leerzustände sowie deaktivierte Aktionen werden über gemeinsame UI-Komponenten dargestellt.

Die externe Referenz `../designV2.md` bleibt ausserhalb des Repositorys. Neben JavaScript und Rollen-Grossschreibung weicht die feste H1-Grösse von 32 px vom Desktop-Zielbereich 34–40 px ab. Eine vollständige visuelle oder Barrierefreiheitsabnahme wird damit nicht behauptet.
