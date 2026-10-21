"use client";

import { useState } from "react";
import DataTable from "./data-table";
import ExemplarForm, { MediumSelector } from "./exemplar-form";
import { mediaLabels } from "./media";
import useApi from "./use-api";
import { ActivityLine, Button, InlineAlert, Pagination, StatusText } from "./ui";

function ExemplarList({ medium, onEdit }) {
  const [page, setPage] = useState(1);
  const params = new URLSearchParams({ page: String(page), pageSize: "20", [medium.type === "book" ? "book_id" : "cd_dvd_id"]: medium.id });
  const { data, error, loading, reload } = useApi(`/api/admin/exemplars?${params}`);
  const columns = [
    { key: "inventory", label: "Inventarnummer", render: (item) => item.inventory_number },
    { key: "medium", label: "Medium", render: () => medium.title },
    { key: "type", label: "Medientyp", render: () => mediaLabels[medium.type] },
    { key: "location", label: "Standort", render: (item) => item.location },
    { key: "available", label: "Verfügbarkeit", render: (item) => <StatusText available={item.available}>{item.available ? "Verfügbar" : "Ausgeliehen"}</StatusText> },
    { key: "actions", label: "Aktion", render: (item) => <Button variant="text" disabled={loading} aria-label={`Exemplar ${item.inventory_number} bearbeiten`} onClick={() => onEdit(item)}>Bearbeiten</Button> },
  ];
  return <div aria-busy={loading}>
    <div className="section-heading"><h3>Exemplare: {medium.title}</h3><Button variant="secondary" disabled={loading} onClick={reload}>Aktualisieren</Button></div>
    {loading && <ActivityLine>Exemplare werden geladen …</ActivityLine>}
    {error && <><InlineAlert>{error}</InlineAlert><Button variant="secondary" onClick={reload}>Erneut versuchen</Button></>}
    {data && !error && <>
      {data.items.length ? <DataTable label={`Exemplare von ${medium.title}`} columns={columns} items={data.items} /> : !loading && <p className="section-note">Für dieses Medium sind noch keine Exemplare erfasst.</p>}
      <Pagination page={page} pageSize={20} total={data.total} disabled={loading} onChange={setPage} label="Seiten der Exemplarliste" />
    </>}
  </div>;
}

export default function AdminExemplars() {
  const [medium, setMedium] = useState(null);
  const [editor, setEditor] = useState(null);
  const [revision, setRevision] = useState(0);
  const [notice, setNotice] = useState("");

  return <section>
    <div className="section-heading"><h2>Exemplare</h2><Button onClick={() => { setNotice(""); setEditor({}); }}>Exemplar hinzufügen</Button></div>
    <p className="section-note">Wähle zuerst den Medientyp und das Medium, dessen Exemplare du verwalten möchtest.</p>
    <MediumSelector key={revision} id="exemplar-filter" medium={medium} onChange={(selection) => { setMedium(selection); setNotice(""); }} />
    {notice && <p className="success-message" role="status">{notice}</p>}
    {medium && <ExemplarList key={`${medium.type}:${medium.id}:${revision}`} medium={medium} onEdit={(item) => { setNotice(""); setEditor(item); }} />}
    {editor && <ExemplarForm exemplar={editor} initialMedium={medium} onClose={() => setEditor(null)} onSaved={(confirmed, savedMedium) => {
      setMedium(savedMedium);
      setRevision((value) => value + 1);
      setNotice(confirmed ? "Exemplar gespeichert." : "");
    }} />}
  </section>;
}
