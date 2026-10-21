import "server-only";
import { getServerSession } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { pool } from "./db.js";
import { authenticateUser, getSessionUser, assertUser } from "./users.mjs";

export const authOptions = {
  secret: process.env.NEXTAUTH_SECRET,
  session: { strategy: "jwt", maxAge: 8 * 60 * 60 },
  providers: [
    CredentialsProvider({
      name: "E-Mail und Passwort",
      credentials: {
        email: { label: "E-Mail", type: "email" },
        password: { label: "Passwort", type: "password" },
      },
      authorize: (credentials) => authenticateUser(pool, credentials),
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) return { sub: user.id };
      return token;
    },
    async session({ session, token }) {
      // Rollen stammen immer aus der Datenbank, niemals aus alten Token-Claims.
      const user = await getSessionUser(pool, { user: { id: token.sub } });
      return { expires: session.expires, user };
    },
  },
};

export async function getCurrentUser() {
  const session = await getServerSession(authOptions);
  return session?.user || null;
}

export async function requireUser() {
  return assertUser(await getCurrentUser());
}

export async function requireAdmin() {
  return assertUser(await getCurrentUser(), "ADMIN");
}
