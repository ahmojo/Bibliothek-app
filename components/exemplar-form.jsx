"use client";

import { useRef, useState } from "react";
import { requestApi } from "@/lib/frontend.mjs";
import Dialog from "./dialog";
import useApi from "./use-api";
import { ActivityLine, Button, FormField, InlineAlert, Pagination } from "./ui";

function mediumLabel(medium) {
  return medium.type === "book" ? `${medium.title} · ${medium.author} · ${medium.isbn}` : medium.title;
}

export function MediumSelector({ id, medium, onChange, disabled = false, error }) {
  const [type, setType] = useState(medium?.type || "book");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const params = new URLSearchParams({ type, q: query, page: String(page), pageSize: "20" });
  const { data, error: loadError, loading, reload } = useApi(`/api/catalog?${params}`);
  const items = !loading && !loadError ? data?.items || [] : [];
  const selectedOnPage = items.some((item) => item.id === medium?.id);

  function searchMedia() {
    setQuery(search.trim());
    setPage(1);
  }

  return <div className="form-fields" aria-busy={loading}>
    <div className="form-field"><label htmlFor={`${id}-type`}>Medientyp *</label>
      <select id={`${id}-type`} value={type} disabled={disabled} onChange={(event) => {
        setType(event.target.value);
        setPage(1);
        onChange(null);
      }}><option value="book">Buch</option><option value="cd">CD</option><option value="dvd">DVD</option></select>
    </div>
    <div className="admin-filters">
      <div className="form-field"><label htmlFor={`${id}-search`}>{type === "book" ? "Titel, Autor oder ISBN suchen" : "Titel suchen"}</label>
        <input id={`${id}-search`} type="search" value={search} maxLength={200} disabled={disabled} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => {
          if (event.key === "Enter") { event.preventDefault(); searchMedia(); }
        }} />
      </div>
      <Button variant="secondary" disabled={disabled} onClick={searchMedia}>Suchen</Button>
    </div>
    {loading && <ActivityLine>Medien werden geladen …</ActivityLine>}
    {loadError && <><InlineAlert>{loadError}</InlineAlert><Button variant="secondary" disabled={disabled} onClick={reload}>Medien erneut laden</Button></>}
    <div className="form-field"><label htmlFor={`${id}-medium`}>Medium *</label>
      <select id={`${id}-medium`} value={medium?.id || ""} disabled={disabled || loading || Boolean(loadError)} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} onChange={(event) => onChange(items.find((item) => item.id === event.target.value) || null)}>
        <option value="">Medium auswählen</option>
        {medium && !selectedOnPage && <option value={medium.id}>{mediumLabel(medium)}</option>}
        {items.map((item) => <option key={item.id} value={item.id}>{mediumLabel(item)}</option>)}
      </select>
      {error && <p className="field-error" id={`${id}-error`}>{error}</p>}
    </div>
    {!loading && !loadError && data && <>
      <p className="metadata">{data.total ? `${data.total} Medien gefunden. Die Auswahl bleibt beim Blättern erhalten.` : "Keine Medien gefunden. Prüfe den Suchbegriff oder Medientyp."}</p>
      <Pagination page={page} pageSize={20} total={data.total} disabled={disabled} onChange={setPage} label="Seiten der Medienauswahl" />
    </>}
  </div>;
}

export default function ExemplarForm({ exemplar = {}, initialMedium, onClose, onSaved }) {
  const [medium, setMedium] = useState(initialMedium || null);
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState("");
  const [errors, setErrors] = useState({});
  const sending = useRef(false);

  async function save(event) {
    event.preventDefault();
    if (sending.current || uncertain) return;
    const form = new FormData(event.currentTarget);
    const inventory = form.get("inventory_number").trim();
    const location = form.get("location").trim();
    const invalid = {};
    if (!inventory || inventory.includes("\0") || inventory.length > 500) invalid.inventory = "Bitte gib eine Inventarnummer mit höchstens 500 Zeichen ein.";
    if (!location || location.includes("\0") || location.length > 500) invalid.location = "Bitte gib einen Standort mit höchstens 500 Zeichen ein.";
    if (!medium) invalid.medium = "Wähle ein Medium aus.";
    setErrors(invalid);
    if (Object.keys(invalid).length) return;
    sending.current = true;
    setBusy(true);
    setError("");
    const values = { inventory_number: inventory, location, book_id: medium.type === "book" ? medium.id : null, cd_dvd_id: medium.type === "book" ? null : medium.id };
    try {
      await requestApi(exemplar.id ? `/api/admin/exemplars/${exemplar.id}` : "/api/admin/exemplars", {
        method: exemplar.id ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values),
      });
      onSaved(true, medium);
      onClose();
    } catch (failure) {
      if (failure.uncertain && !exemplar.id) {
        setUncertain(true);
        setError("Das Speichern konnte nicht bestätigt werden. Schliesse den Dialog und prüfe die Exemplare dieses Mediums, bevor du einen neuen Eintrag anlegst.");
        onSaved(false, medium);
      } else if (failure.status === 409 && failure.message.includes("Ausleihhistorie")) {
        setError("Dieses Exemplar hat eine Ausleihhistorie und darf keinem anderen Medium zugeordnet werden. Inventarnummer und Standort können weiterhin bearbeitet werden.");
        setErrors({ medium: "Wähle die bisherige Medienzuordnung, um die übrigen Änderungen zu speichern." });
      } else if (failure.status === 409 && failure.message.includes("Inventarnummer")) {
        setErrors({ inventory: "Diese Inventarnummer ist bereits vergeben." });
        setError("Bitte prüfe die Inventarnummer.");
      } else if (failure.status === 409) {
        setError("Das gewählte Medium ist nicht mehr verfügbar. Lade die Medienauswahl erneut und prüfe die Zuordnung.");
      } else if (failure.status === 400) {
        if (failure.message.includes("inventory_number")) setErrors({ inventory: "Bitte prüfe die Inventarnummer (höchstens 500 Zeichen)." });
        else if (failure.message.includes("location")) setErrors({ location: "Bitte prüfe den Standort (höchstens 500 Zeichen)." });
        else setErrors({ medium: "Bitte wähle ein gültiges Medium aus." });
        setError("Bitte prüfe die Angaben. Deine Eingaben bleiben erhalten.");
      } else if (failure.status === 404) setError("Dieses Exemplar wurde nicht gefunden. Schliesse den Dialog und lade die Exemplarliste neu.");
      else if (failure.status === 401 || failure.status === 403) setError(failure.message);
      else setError("Das Speichern konnte nicht bestätigt werden. Bitte prüfe den aktuellen Stand in der Exemplarliste.");
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }

  return <Dialog title={exemplar.id ? "Exemplar bearbeiten" : "Exemplar hinzufügen"} onClose={onClose} busy={busy}>
    <form className="media-form" onSubmit={save} noValidate>
      {error && <InlineAlert>{error}</InlineAlert>}
      <fieldset className="form-fields" disabled={busy || uncertain}>
        <MediumSelector id="exemplar-form" medium={medium} onChange={setMedium} disabled={busy || uncertain} error={errors.medium} />
        <FormField id="exemplar-inventory" label="Inventarnummer" name="inventory_number" required defaultValue={exemplar.inventory_number || ""} maxLength={500} error={errors.inventory} />
        <FormField id="exemplar-location" label="Standort" name="location" required defaultValue={exemplar.location || ""} maxLength={500} error={errors.location} />
      </fieldset>
      <div className="dialog-footer"><Button type="submit" disabled={busy || uncertain}>{busy ? "Wird gespeichert …" : exemplar.id ? "Änderungen speichern" : "Exemplar hinzufügen"}</Button><Button variant="secondary" disabled={busy} onClick={onClose}>{uncertain ? "Schliessen und Liste prüfen" : "Abbrechen"}</Button></div>
    </form>
  </Dialog>;
}
