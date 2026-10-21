# Datenmodell und Migrationen

[Zur Projektübersicht](../README.md)

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
Es gibt fünf fachliche Tabellen sowie die technischen Tabellen `setup_check`
und `schema_migrations`. Das ER-Bild `../ER-diagrammV2.png` zeigt die fünf
fachlichen Tabellen, enthält aber noch keine Coverfelder. Migration 009 ergänzt
`cover_image_path` in beiden Medientabellen. Rollen werden als `USER`/`ADMIN`
gespeichert. Das Ausleihdatum setzt die API; die SQL-Spalte hat keinen Default.

## Spalten und Beziehungen

Alle fünf Fachtabellen verwenden id bigint GENERATED ALWAYS AS IDENTITY als Primärschlüssel. Ohne ausdrückliche Angabe sind Spalten NOT NULL; optionale Felder sind nullable.

| Tabelle | Weitere Spalten |
| --- | --- |
| users | name, email, password_hash, role jeweils varchar |
| books | title, author, isbn text; optional publisher text, publication_year integer, category text, description text, cover_image_path text |
| cd_dvd | title text, media_type text; optional cover_image_path text |
| exemplar | inventory_number text, location text; book_id bigint und cd_dvd_id bigint nullable, durch XOR genau eines gesetzt |
| ausleihe | user_id bigint, exemplar_id bigint, loan_date date, due_date date; return_date date nullable |

books bzw. cd_dvd stehen jeweils 1:n zu exemplar. users und exemplar stehen jeweils 1:n zu ausleihe. Die Fremdschlüssel von ausleihe verwenden ON DELETE RESTRICT; Medienreferenzen verwenden den PostgreSQL-Standard NO ACTION.

UNIQUE gilt für books.isbn, normalisierte ISBN (Ausdrucksindex), exemplar.inventory_number und LOWER(users.email). CHECK-Regeln sichern Rollen, Medientypen, Pflichttexte, E-Mail-Format, ISBN-Prüfziffer, Erscheinungsjahr, XOR-Zuordnung und Datumsreihenfolge. Die 30-Tage-Frist setzt der Service; die DB erzwingt nur due_date >= loan_date.

Zusätzliche Indizes: exemplar_book_id_idx, exemplar_cd_dvd_id_idx, ausleihe_user_id_idx, ausleihe_exemplar_id_idx sowie ausleihe_one_active_per_exemplar (UNIQUE WHERE return_date IS NULL). Primärschlüssel und UNIQUE-Constraints erzeugen weitere Indizes.

Der Runner akzeptiert dreistellige eindeutige Nummern mit Kleinbuchstaben/Unterstrichen im Namen. Bereits erfasste Dateinamen werden übersprungen; es gibt keine Prüfsummenprüfung oder automatische Down-Migration. setup_check enthält id integer und message text; schema_migrations enthält filename text PRIMARY KEY und applied_at timestamptz DEFAULT now().
