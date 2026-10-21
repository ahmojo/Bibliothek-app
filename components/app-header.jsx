"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { useState } from "react";
import { Button, InlineAlert } from "./ui";

export default function AppHeader() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const user = session?.user;
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  const accountLink = user?.role === "ADMIN"
    ? { href: "/admin", label: "Administration" }
    : { href: "/meine-ausleihen", label: "Meine Ausleihen" };

  async function logout() {
    setPending(true);
    setError(false);
    try {
      await signOut({ callbackUrl: "/" });
    } catch {
      setError(true);
      setPending(false);
    }
  }

  return (
    <header className="app-header">
      <div className="page-container header-inner">
        <Link className="wordmark" href="/" aria-label="Bibliotheksapp – zum Katalog">bibliotheksapp</Link>
        <nav className="main-nav" aria-label="Hauptnavigation">
          <Link href="/" aria-current={pathname === "/" ? "page" : undefined}>Katalog</Link>
          {user ? <>
            <Link href={accountLink.href} aria-current={pathname === accountLink.href ? "page" : undefined}>{accountLink.label}</Link>
            <Button variant="text" onClick={logout} disabled={pending}>{pending ? "Abmeldung läuft …" : "Abmelden"}</Button>
          </> : <Link href="/login" aria-current={pathname === "/login" ? "page" : undefined}>Anmelden</Link>}
        </nav>
      </div>
      {error && <div className="page-container"><InlineAlert>Abmelden ist gerade nicht möglich. Bitte versuche es erneut.</InlineAlert></div>}
    </header>
  );
}
