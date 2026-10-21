"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { findLoan, formatDate, requestApi } from "@/lib/frontend.mjs";
import Dialog from "./dialog";
import { Button, InlineAlert } from "./ui";

export default function ReturnDialog({ loan, onClose, onChanged }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [uncertain, setUncertain] = useState(false);
  const [returned, setReturned] = useState(null);
  const [blocked, setBlocked] = useState(false);
  const sending = useRef(false);

  async function confirm() {
    if (sending.current || returned || uncertain || blocked) return;
    sending.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await requestApi(`/api/admin/loans/${loan.id}/return`, { method: "POST" });
      setReturned(result);
      onChanged();
    } catch (failure) {
      setUncertain(Boolean(failure.uncertain));
      setBlocked([401, 403, 404, 409].includes(failure.status));
      setError(failure.status === 409 ? "Diese Ausleihe wurde bereits zurückgegeben. Die Liste wurde aktualisiert." : failure.message);
      onChanged();
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }

  async function checkStatus() {
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    try {
      const history = await findLoan("history", loan.id);
      if (history) {
        setReturned(history);
        setError("");
      } else {
        const active = await findLoan("active", loan.id);
        setBlocked(!active);
        setError(active ? "Die Ausleihe ist noch aktiv. Du kannst die Rückgabe erneut bestätigen." : "Die Ausleihe wurde nicht gefunden. Bitte lade die Liste neu.");
      }
      setUncertain(false);
      onChanged();
    } catch (failure) {
      setError(failure.message);
      if ([401, 403, 404].includes(failure.status)) {
        setUncertain(false);
        setBlocked(true);
      }
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }

  return <Dialog title={returned ? "Rückgabe erfasst" : "Rückgabe bestätigen"} busy={busy} dismissible={!uncertain} onClose={onClose}>
    <p><strong>{loan.title}</strong></p>
    <p>Inventarnummer: {loan.inventory_number}</p>
    <p>Benutzer: {loan.user_name} · {loan.user_email}</p>
    <p className="section-note">Rückgabe bis {formatDate(loan.due_date)}. Die Rückgabe wird mit dem aktuellen Bibliothekstag erfasst.</p>
    {returned && <p className="success-message" role="status">Zurückgegeben am {formatDate(returned.return_date)}. Das Exemplar ist wieder verfügbar.</p>}
    {error && <InlineAlert>{error}</InlineAlert>}
    <div className="dialog-footer">
      {!returned && !blocked && !uncertain && <Button disabled={busy} onClick={confirm}>{busy ? "Rückgabe wird erfasst …" : "Rückgabe bestätigen"}</Button>}
      {uncertain && <Button disabled={busy} onClick={checkStatus}>{busy ? "Status wird geprüft …" : "Ausleihstatus prüfen"}</Button>}
      <Button variant="secondary" disabled={busy || uncertain} onClick={onClose}>{returned || blocked ? "Zurück zur Liste" : "Abbrechen"}</Button>
      {uncertain && <Link className="back-link" href="/login" prefetch={false}>Anmeldung prüfen</Link>}
    </div>
  </Dialog>;
}
