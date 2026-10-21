"use client";

import { Button, InlineAlert } from "@/components/ui";

export default function ErrorPage({ reset }) {
  return <main className="page-container page-content" id="inhalt"><h1>Seite nicht verfügbar</h1><InlineAlert>Die Seite konnte nicht geladen werden. Bitte versuche es erneut.</InlineAlert><Button onClick={reset}>Erneut versuchen</Button></main>;
}
