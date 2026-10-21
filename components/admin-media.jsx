"use client";

import { useState } from "react";
import useApi from "./use-api";
import MediaForm from "./media-form";
import DataTable from "./data-table";
import { mediaLabels } from "./media";
import { ActivityLine, Button, InlineAlert, Pagination } from "./ui";

export default function AdminMedia() {
  const [query, setQuery] = useState("");
  const [type, setType] = useState("all");
  const [page, setPage] = useState(1);
  const [editor, setEditor] = useState(null);
  const [notice, setNotice] = useState("");
  const params = new URLSearchParams({ q: query, type, page: String(page), pageSize: "20" });
  const { data, error, loading, reload } = useApi(`/api/catalog?${params}`);
  const columns = [
    { key: "title", label: "Titel", render: (medium) => medium.title },
    { key: "type", label: "Medientyp", render: (medium) => mediaLabels[medium.type] },
    { key: "author", label: "Autor / ISBN", render: (medium) => medium.type === "book" ? <>{medium.author}<span className="metadata">{medium.isbn}</span></> : "–" },
    { key: "copies", label: "Exemplare", render: (medium) => medium.total_copies },
    { key: "actions", label: "Aktion", render: (medium) => <Button variant="text" aria-label={`${medium.title} bearbeiten`} onClick={() => { setNotice(""); setEditor(medium); }}>Bearbeiten</Button> },
  ];
  return <section aria-busy={loading}>
    <div className="section-heading"><h2>Medien</h2><Button onClick={() => { setNotice(""); setEditor({}); }}>Medium hinzufügen</Button></div>
    <form className="admin-filters" role="search" onSubmit={(event) => { event.preventDefault(); setQuery(new FormData(event.currentTarget).get("q").trim()); setPage(1); }}>
      <div className="form-field"><label htmlFor="admin-search">Titel, Autor oder ISBN suchen</label><input id="admin-search" name="q" type="search" maxLength={200} /></div>
      <div className="form-field"><label htmlFor="admin-type">Medientyp</label><select id="admin-type" value={type} onChange={(event) => { setType(event.target.value); setPage(1); }}><option value="all">Alle</option><option value="book">Bücher</option><option value="cd">CDs</option><option value="dvd">DVDs</option></select></div>
      <Button type="submit" variant="secondary">Suchen</Button>
    </form>
    {notice && <p className="success-message" role="status">{notice}</p>}
    {loading && <ActivityLine>Medien werden geladen …</ActivityLine>}
    {error && <><InlineAlert>{error}</InlineAlert><Button variant="secondary" onClick={reload}>Erneut versuchen</Button></>}
    {data && !error && <>
      {data.items.length ? <DataTable label="Medienverwaltung" columns={columns} items={data.items} rowKey={(medium) => `${medium.type}:${medium.id}`} /> : <p className="section-note">{query || type !== "all" ? "Keine Medien gefunden. Prüfe den Suchbegriff oder Filter." : "Noch keine Medien erfasst."}</p>}
      <Pagination page={page} pageSize={20} total={data.total} disabled={loading} onChange={setPage} />
    </>}
    {editor && <MediaForm medium={editor} onClose={() => setEditor(null)} onSaved={(confirmed = true) => { reload(); setNotice(confirmed ? "Medium gespeichert." : ""); }} />}
  </section>;
}
