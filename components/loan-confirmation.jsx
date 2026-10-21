"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { formatDate, requestApi } from "@/lib/frontend.mjs";
import Dialog from "./dialog";
import { Button, InlineAlert } from "./ui";

export default function LoanConfirmation({ medium, exemplar, onClose, onChanged }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [uncertain, setUncertain] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [loan, setLoan] = useState(null);
  const sending = useRef(false);

  async function confirm() {
    if (sending.current || uncertain || unavailable || loan) return;
    sending.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await requestApi("/api/loans", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ exemplar_id: exemplar.id }),
      });
      setLoan(result);
      onChanged();
    } catch (failure) {
      setUncertain(Boolean(failure.uncertain));
      setUnavailable([401, 403, 404, 409].includes(failure.status));
      setError(failure.status === 409 ? "Dieses Exemplar wurde gerade ausgeliehen. Bitte wähle ein anderes." : failure.message);
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
      // Nach einem Verbindungsabbruch niemals blind dieselbe Ausleihe senden.
      let page = 1;
      let result;
      do {
        result = await requestApi(`/api/loans?status=active&page=${page}&pageSize=100`);
        const ownLoan = result.items.find((item) => item.exemplar_id === exemplar.id);
        if (ownLoan) {
          setLoan(ownLoan);
          setError("");
          setUncertain(false);
          onChanged();
          return;
        }
        page++;
      } while ((page - 1) * result.pageSize < result.total && page <= 10000);
      const current = await requestApi(`/api/catalog/${medium.type}/${medium.id}`);
      // Auch bei paginierten Exemplaren ist kein erneuter POST nötig: neu auswählen.
      setUnavailable(true);
      setUncertain(false);
      setError(current.available_copies ? "Bitte schliesse die Bestätigung und wähle ein verfügbares Exemplar erneut aus." : "Aktuell ist kein Exemplar mehr verfügbar.");
      onChanged();
    } catch (failure) {
      setError(failure.message);
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }

  return <Dialog title={loan ? "Ausleihe erfasst" : "Ausleihe bestätigen"} onClose={onClose} busy={busy} dismissible={!uncertain}>
    <p><strong>{medium.title}</strong></p>
    <p>Exemplar {exemplar.inventory_number} · {exemplar.location}</p>
    {loan ? <p className="success-message" role="status">Ausleihe bestätigt. Rückgabe bis {formatDate(loan.due_date)}.</p>
      : <p className="section-note">Die reguläre Ausleihdauer beträgt 30 Tage. Die verbindliche Rückgabefrist bestätigt der Server nach der Ausleihe.</p>}
    {error && <InlineAlert>{error}</InlineAlert>}
    <div className="dialog-footer">
      {loan ? <Link className="button button--primary" href="/meine-ausleihen">Meine Ausleihen</Link>
        : uncertain ? <Button disabled={busy} onClick={checkStatus}>{busy ? "Status wird geprüft …" : "Ausleihstatus prüfen"}</Button>
          : !unavailable && <Button variant="accent" disabled={busy} onClick={confirm}>{busy ? "Ausleihe wird erfasst …" : "Ausleihe bestätigen"}</Button>}
      <Button variant="secondary" disabled={busy || uncertain} onClick={onClose}>{loan || unavailable ? "Zurück zu den Exemplaren" : "Abbrechen"}</Button>
      {uncertain && <Link className="back-link" href="/meine-ausleihen">Eigene Ausleihen ansehen</Link>}
    </div>
  </Dialog>;
}
