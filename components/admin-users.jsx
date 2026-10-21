"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import DataTable from "./data-table";
import UserForm from "./user-form";
import useApi from "./use-api";
import { ActivityLine, Button, InlineAlert, Pagination } from "./ui";

export default function AdminUsers() {
  const [page, setPage] = useState(1);
  const [editor, setEditor] = useState(null);
  const [notice, setNotice] = useState("");
  const [sessionError, setSessionError] = useState("");
  const { data: session, update } = useSession();
  const router = useRouter();
  const { data, error, loading, reload } = useApi(`/api/admin/users?page=${page}&pageSize=20`);

  function openEditor(user) {
    setNotice("");
    setSessionError("");
    setEditor(user);
  }

  async function saved(confirmed = true) {
    reload();
    setNotice(confirmed ? "Benutzer gespeichert." : "");
    if (!editor?.id || String(editor.id) !== String(session?.user?.id)) return;
    try {
      await update();
    } catch {
      setSessionError("Die Sitzung konnte nicht aktualisiert werden. Bitte lade die Seite neu.");
    } finally {
      router.refresh();
    }
  }

  const columns = [
    { key: "name", label: "Name", render: (user) => user.name },
    { key: "email", label: "E-Mail-Adresse", render: (user) => user.email },
    { key: "role", label: "Rolle", render: (user) => user.role === "ADMIN" ? "Administrator" : "Benutzer" },
    { key: "actions", label: "Aktion", render: (user) => <Button variant="text" aria-label={`${user.name} bearbeiten`} onClick={() => openEditor(user)}>Bearbeiten</Button> },
  ];

  return <section aria-busy={loading}>
    <div className="section-heading"><h2>Benutzer</h2><Button onClick={() => openEditor({})}>Benutzer hinzufügen</Button></div>
    {notice && <p className="success-message" role="status">{notice}</p>}
    {sessionError && <InlineAlert>{sessionError}</InlineAlert>}
    {loading && <ActivityLine>Benutzer werden geladen …</ActivityLine>}
    {error && <><InlineAlert>{error}</InlineAlert><Button variant="secondary" onClick={reload}>Erneut versuchen</Button></>}
    {data && !error && <>
      {data.items.length ? <DataTable label="Benutzerverwaltung" columns={columns} items={data.items} /> : <p className="section-note">Keine Benutzer gefunden.</p>}
      <Pagination page={page} pageSize={20} total={data.total} disabled={loading} onChange={setPage} />
    </>}
    {editor && <UserForm user={editor} onClose={() => setEditor(null)} onSaved={saved} />}
  </section>;
}
