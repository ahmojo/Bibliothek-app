"use client";

import Link from "next/link";
import { useState } from "react";
import Dialog from "./dialog";
import LoanConfirmation from "./loan-confirmation";
import useApi from "./use-api";
import { MediaCover, Availability, mediaLabels } from "./media";
import { ActivityLine, Button, InlineAlert, Pagination, StatusText } from "./ui";

export default function MediaDetails({ type, id, onClose, user, returnPath, onChanged }) {
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState("");
  const [confirmation, setConfirmation] = useState(null);
  const { data, error, loading, reload } = useApi(`/api/catalog/${encodeURIComponent(type)}/${encodeURIComponent(id)}?page=${page}&pageSize=20`);
  const selected = data?.exemplars.find((copy) => copy.id === selectedId && copy.available);
  const fields = data?.type === "book" ? [
    ["Autor", data.author], ["ISBN", data.isbn], ["Verlag", data.publisher],
    ["Erscheinungsjahr", data.publication_year], ["Kategorie", data.category],
  ] : [];

  return (
    <Dialog title={data?.title || "Mediendetails"} onClose={onClose}>
      {loading && <ActivityLine>Mediendetails werden geladen …</ActivityLine>}
      {error && <><InlineAlert>{error}</InlineAlert><Button variant="secondary" onClick={reload}>Erneut versuchen</Button></>}
      {data && !error && <div aria-busy={loading}>
        <div className="media-summary">
          <MediaCover medium={data} />
          <div>
            <p className="media-type">{mediaLabels[data.type]}</p>
            <Availability medium={data} />
            {fields.length > 0 && <dl className="media-fields">{fields.filter(([, value]) => value !== null && value !== "").map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>}
          </div>
        </div>
        {data.description && <section className="description"><h3>Beschreibung</h3><p>{data.description}</p></section>}
        {data.total_copies > 0 && <fieldset className="exemplar-selector" disabled={loading}>
          <legend>Exemplar auswählen</legend>
          {data.exemplars.map((copy) => <label className="exemplar-option" key={copy.id}>
            <input type="radio" name="exemplar" value={copy.id} checked={copy.available && selectedId === copy.id} disabled={!copy.available} onChange={() => setSelectedId(copy.id)} />
            <span><strong>{copy.inventory_number}</strong><span className="metadata">Standort: {copy.location}</span></span>
            <StatusText available={copy.available}>{copy.available ? "Verfügbar" : "Ausgeliehen"}</StatusText>
          </label>)}
        </fieldset>}
        <Pagination label="Exemplarseiten" page={page} pageSize={20} total={data.total_copies} disabled={loading} onChange={(next) => { setPage(next); setSelectedId(""); }} />
        <div className="dialog-footer">
          {selected && <p className="metadata" role="status">Ausgewählt: {selected.inventory_number} · {selected.location}</p>}
          {user && data.available_copies > 0 && <Button disabled={!selected || loading} onClick={() => setConfirmation({ medium: data, exemplar: selected })}>Exemplar ausleihen</Button>}
          {!user && data.available_copies > 0 && <Link className="button button--primary" href={`/login?next=${encodeURIComponent(returnPath)}`}>Anmelden, um auszuleihen</Link>}
        </div>
      </div>}
      {confirmation && <LoanConfirmation medium={confirmation.medium} exemplar={confirmation.exemplar} onClose={() => { setConfirmation(null); setSelectedId(""); }} onChanged={() => { reload(); onChanged(); }} />}
    </Dialog>
  );
}
