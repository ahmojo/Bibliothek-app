"use client";

import Link from "next/link";
import { signIn, getSession } from "next-auth/react";
import { useState } from "react";
import { loginDestination } from "@/lib/navigation.mjs";
import { Button, FormField, InlineAlert } from "./ui";

export default function LoginForm({ next }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [fields, setFields] = useState({});

  async function submit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const email = form.elements.email.value.trim();
    const password = form.elements.password.value;
    const errors = {};
    if (!email || !form.elements.email.validity.valid) errors.email = "Bitte gib eine gültige E-Mail-Adresse ein.";
    if (!password) errors.password = "Bitte gib dein Passwort ein.";
    setFields(errors);
    setError("");
    if (Object.keys(errors).length) {
      form.elements[Object.keys(errors)[0]].focus();
      return;
    }
    setPending(true);
    try {
      const result = await signIn("credentials", { email, password, redirect: false, callbackUrl: "/" });
      if (!result?.ok || result.error) {
        setError("E-Mail-Adresse oder Passwort ist nicht korrekt.");
        setPending(false);
        return;
      }
      const session = await getSession();
      if (!session?.user) throw new Error("Keine Sitzung");
      window.location.assign(loginDestination(session.user.role, next));
    } catch {
      setError("Die Anmeldung ist gerade nicht möglich. Bitte versuche es erneut.");
      setPending(false);
    }
  }

  return (
    <form className="login-form" onSubmit={submit} noValidate aria-busy={pending}>
      <FormField id="email" name="email" label="E-Mail-Adresse" type="email" autoComplete="username" required error={fields.email} disabled={pending} />
      <FormField id="password" name="password" label="Passwort" type="password" autoComplete="current-password" required error={fields.password} disabled={pending} />
      {error && <InlineAlert>{error}</InlineAlert>}
      <Button type="submit" disabled={pending}>{pending ? "Anmeldung läuft …" : "Anmelden"}</Button>
      <Link className="back-link" href="/">Zurück zum Katalog</Link>
    </form>
  );
}
