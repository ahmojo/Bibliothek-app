"use client";

import { useRef, useState } from "react";
import { isValidIsbn } from "@/lib/isbn.mjs";
import { requestApi } from "@/lib/frontend.mjs";
import Dialog from "./dialog";
import { MediaCover } from "./media";
import { Button, FormField, InlineAlert } from "./ui";

export default function MediaForm({ medium, onClose, onSaved }) {
  const [type, setType] = useState(medium.type || "book");
  const [saved, setSaved] = useState(medium.id ? medium : null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [errors, setErrors] = useState({});
  const [file, setFile] = useState(null);
  const [uncertain, setUncertain] = useState(false);
  const [notice, setNotice] = useState("");
  const sending = useRef(false);
  const fileInput = useRef(null);
  const isBook = type === "book";

  function chooseFile(event) {
    const chosen = event.target.files[0];
    setFile(null);
    if (chosen && chosen.size > 5 * 1024 * 1024) {
      setErrors((previous) => ({ ...previous, cover: "Das Cover darf höchstens 5 MB gross sein." }));
      event.target.value = "";
      return;
    }
    setErrors((previous) => ({ ...previous, cover: "" }));
    setFile(chosen || null);
  }

  async function save(event) {
    event.preventDefault();
    if (sending.current || uncertain) return;
    const form = new FormData(event.currentTarget);
    const values = { title: form.get("title").trim() };
    const invalid = {};
    if (!values.title) invalid.title = "Bitte gib einen Titel ein.";
    if (isBook) {
      values.author = form.get("author").trim();
      values.isbn = form.get("isbn");
      if (!values.author) invalid.author = "Bitte gib einen Autor ein.";
      if (!isValidIsbn(values.isbn)) invalid.isbn = "Bitte gib eine gültige ISBN-10 oder ISBN-13 ein.";
      for (const key of ["publisher", "category", "description"]) values[key] = form.get(key).trim() || null;
      const year = form.get("publication_year");
      values.publication_year = year ? Number(year) : null;
      if (year && (!/^\d+$/.test(year) || values.publication_year < 1)) invalid.publication_year = "Bitte gib eine gültige ganze Jahreszahl ein.";
    } else values.media_type = type === "cd" ? "CD" : "DVD";
    setErrors(invalid);
    if (Object.keys(invalid).length) return;
    sending.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    let record;
    try {
      const endpoint = isBook ? "/api/admin/books" : "/api/admin/cd-dvd";
      record = await requestApi(saved ? `${endpoint}/${saved.id}` : endpoint, {
        method: saved ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values),
      });
      setSaved({ ...record, type });
      onSaved();
      if (file) {
        const upload = new FormData();
        upload.set("file", file);
        record = await requestApi(`/api/admin/media/${type}/${record.id}/cover`, { method: "PUT", body: upload });
        setSaved({ ...record, type });
        setFile(null);
        fileInput.current.value = "";
        onSaved();
      }
      onClose();
    } catch (failure) {
      if (record) {
        setNotice("Die Mediendaten sind gespeichert. Das Cover konnte nicht bestätigt werden und kann erneut hochgeladen werden.");
        setErrors({ cover: failure.message });
      } else {
        setError(failure.message);
        if (failure.status === 409 && isBook) setErrors({ isbn: "Diese ISBN ist bereits erfasst." });
        if (failure.status === 400 && failure.message.includes("publication_year")) {
          setError("Bitte prüfe das Erscheinungsjahr.");
          setErrors({ publication_year: "Bitte gib ein gültiges Erscheinungsjahr bis höchstens nächstes Jahr ein." });
        }
        if (failure.uncertain && !saved) {
          setUncertain(true);
          setError("Das Speichern konnte nicht bestätigt werden. Schliesse den Dialog und prüfe die Medienliste, bevor du einen neuen Eintrag anlegst.");
          onSaved(false);
        }
      }
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }

  async function removeCover() {
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await requestApi(`/api/admin/media/${saved.type}/${saved.id}/cover`, { method: "DELETE" });
      setSaved({ ...result, type: saved.type });
      setFile(null);
      fileInput.current.value = "";
      setNotice("Cover entfernt.");
      onSaved();
    } catch (failure) {
      setError(failure.message);
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }

  return <Dialog title={saved ? "Medium bearbeiten" : "Medium hinzufügen"} onClose={onClose} busy={busy}>
    <form className="media-form" onSubmit={save} noValidate>
      {error && <InlineAlert>{error}</InlineAlert>}
      {notice && <p className="section-note" role="status">{notice}</p>}
      <fieldset disabled={busy} className="form-fields">
        <div className="form-field"><label htmlFor="media-form-type">Medientyp *</label><select id="media-form-type" value={type} disabled={Boolean(saved?.type === "book")} onChange={(event) => setType(event.target.value)}>
          {(!saved || saved.type === "book") && <option value="book">Buch</option>}
          {saved?.type !== "book" && <><option value="cd">CD</option><option value="dvd">DVD</option></>}
        </select></div>
        <FormField id="media-title" label="Titel" name="title" required defaultValue={medium.title || ""} maxLength={500} error={errors.title} />
        {isBook && <>
          <FormField id="media-author" label="Autor" name="author" required defaultValue={medium.author || ""} maxLength={500} error={errors.author} />
          <FormField id="media-isbn" label="ISBN" name="isbn" required defaultValue={medium.isbn || ""} error={errors.isbn} />
          <FormField id="media-publisher" label="Verlag" name="publisher" defaultValue={medium.publisher || ""} maxLength={500} />
          <FormField id="media-year" label="Erscheinungsjahr" name="publication_year" inputMode="numeric" defaultValue={medium.publication_year || ""} error={errors.publication_year} />
          <FormField id="media-category" label="Kategorie" name="category" defaultValue={medium.category || ""} maxLength={500} />
          <div className="form-field"><label htmlFor="media-description">Beschreibung</label><textarea id="media-description" name="description" rows={4} maxLength={10000} defaultValue={medium.description || ""} /></div>
        </>}
        <div className="form-field">
          <label htmlFor="media-cover">Coverbild (JPG, PNG oder WebP, höchstens 5 MB)</label>
          {saved?.cover_image_path && <div className="cover-editor"><MediaCover key={saved.cover_image_path} medium={saved} /><Button variant="secondary" onClick={removeCover}>Cover entfernen</Button></div>}
          <input ref={fileInput} id="media-cover" type="file" accept="image/jpeg,image/png,image/webp" onChange={chooseFile} aria-invalid={Boolean(errors.cover)} aria-describedby={errors.cover ? "cover-error" : undefined} />
          {errors.cover && <p className="field-error" id="cover-error">{errors.cover}</p>}
          {file && <p className="metadata">{file.name} wird beim Speichern {saved?.cover_image_path ? "als Ersatz hochgeladen" : "hochgeladen"}.</p>}
        </div>
      </fieldset>
      <div className="dialog-footer"><Button type="submit" disabled={busy || uncertain}>{busy ? "Wird gespeichert …" : saved ? "Änderungen speichern" : "Medium hinzufügen"}</Button><Button variant="secondary" disabled={busy} onClick={onClose}>Abbrechen</Button></div>
    </form>
  </Dialog>;
}
