# Authentifizierung und Berechtigungen

[Zur Projektübersicht](../README.md)

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
POST mit CSRF-Token. Die Backend-Abnahme verwendet diese Endpunkte direkt.

Verschlüsselte JWT-Sessions gelten acht Stunden und brauchen keine zusätzlichen
Tabellen. Cookies sind `HttpOnly`, `SameSite=Lax` und unter HTTPS `Secure`.
Die Prüfungen in `lib/auth.js` laden Benutzer und Rolle frisch aus PostgreSQL,
damit Rollenänderungen sofort wirken. Fehlende Anmeldung ergibt 401, fehlende
ADMIN-Berechtigung 403.

## Geschützte Seiten

`/meine-ausleihen` setzt eine Anmeldung voraus; `/admin` zusätzlich die aktuelle Rolle ADMIN. `/` und `/login` sind öffentlich. Route Handler prüfen unabhängig von der Navigation die Berechtigung. Es gibt keine öffentliche Registrierung und keinen Passwort-Reset. Weitere Grenzen: [Fehlerbehebung](troubleshooting.md).
