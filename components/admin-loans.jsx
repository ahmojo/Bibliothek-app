"use client";

import Link from "next/link";
import { useState } from "react";
import { formatDate, loanStatus } from "@/lib/frontend.mjs";
import DataTable from "./data-table";
import ReturnDialog from "./return-dialog";
import useApi from "./use-api";
import useLibraryDay from "./use-library-day";
import { mediaLabels } from "./media";
import { ActivityLine, Button, InlineAlert, Pagination } from "./ui";

const views = [["active", "Aktive Ausleihen"], ["overdue", "Überfällige Ausleihen"], ["history", "Ausleihhistorie"]];

export default function AdminLoans({ today }) {
  useLibraryDay(today);
  const [status, setStatus] = useState("active");
  const [page, setPage] = useState(1);
  const [returning, setReturning] = useState(null);
  const { data, error, loading, reload } = useApi(`/api/admin/loans?status=${status}&page=${page}&pageSize=20`);
  const columns = [
    { key: "medium", label: "Medium", render: (loan) => <><Link href={`/?medium=${loan.media_type}:${loan.media_id}`}>{loan.title}</Link><span className="metadata">{mediaLabels[loan.media_type]}</span></> },
    { key: "inventory", label: "Inventarnummer", render: (loan) => loan.inventory_number },
    { key: "user", label: "Benutzer", render: (loan) => <>{loan.user_name}<span className="metadata">{loan.user_email}</span></> },
    { key: "loan", label: "Ausgeliehen am", render: (loan) => formatDate(loan.loan_date) },
    { key: "due", label: "Rückgabe bis", render: (loan) => formatDate(loan.due_date) },
    ...(status === "history" ? [{ key: "return", label: "Zurückgegeben am", render: (loan) => formatDate(loan.return_date) }] : []),
    { key: "status", label: "Status", render: (loan) => <span className={loan.overdue ? "status-overdue" : loan.due_date === today && !loan.return_date ? "status-due" : "metadata"}>{loanStatus(loan, today)}</span> },
    ...(status !== "history" ? [{ key: "action", label: "Aktion", render: (loan) => !loan.return_date && <Button variant="text" disabled={loading} aria-label={`Rückgabe für ${loan.inventory_number} erfassen`} onClick={() => setReturning(loan)}>Rückgabe erfassen</Button> }] : []),
  ];
  const empty = status === "history" ? "Noch keine abgeschlossenen Ausleihen." : status === "overdue" ? "Keine überfälligen Ausleihen." : "Keine aktiven Ausleihen.";
  return <section aria-busy={loading}>
    <div className="section-heading"><h2>Ausleihen</h2></div>
    <div className="type-filter loan-tabs" role="group" aria-label="Ausleihansicht">{views.map(([key, label]) => <Button key={key} variant="filter" aria-pressed={key === status} onClick={() => { setStatus(key); setPage(1); }}>{label}</Button>)}</div>
    {loading && <ActivityLine>Ausleihen werden geladen …</ActivityLine>}
    {error && <><InlineAlert>{error}</InlineAlert><Button variant="secondary" onClick={reload}>Erneut versuchen</Button></>}
    {data && !error && <>
      {data.items.length ? <DataTable label={views.find(([key]) => key === status)[1]} columns={columns} items={data.items} /> : <p className="section-note">{empty}</p>}
      <Pagination page={page} pageSize={20} total={data.total} disabled={loading} onChange={setPage} />
    </>}
    {returning && <ReturnDialog loan={returning} onClose={() => setReturning(null)} onChanged={reload} />}
  </section>;
}
