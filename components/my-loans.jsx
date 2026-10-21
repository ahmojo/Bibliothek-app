"use client";

import Link from "next/link";
import { useState } from "react";
import { formatDate, loanStatus } from "@/lib/frontend.mjs";
import { mediaLabels } from "./media";
import useApi from "./use-api";
import useLibraryDay from "./use-library-day";
import DataTable from "./data-table";
import { ActivityLine, Button, InlineAlert, Pagination } from "./ui";

function LoanList({ history = false, today }) {
  const [page, setPage] = useState(1);
  const status = history ? "history" : "active";
  const { data, error, loading, reload } = useApi(`/api/loans?status=${status}&page=${page}&pageSize=20`);
  const columns = [
    { key: "medium", label: "Medium", render: (loan) => <><Link href={`/?medium=${loan.media_type}:${loan.media_id}`}>{loan.title}</Link><span className="metadata">{mediaLabels[loan.media_type]}</span></> },
    { key: "inventory", label: "Inventarnummer", render: (loan) => loan.inventory_number },
    { key: "loan", label: "Ausgeliehen am", render: (loan) => formatDate(loan.loan_date) },
    { key: "due", label: "Rückgabe bis", render: (loan) => formatDate(loan.due_date) },
    ...(history ? [{ key: "return", label: "Zurückgegeben am", render: (loan) => formatDate(loan.return_date) }] : []),
    { key: "status", label: "Status", render: (loan) => <span className={loan.overdue ? "status-overdue" : loan.due_date === today && !history ? "status-due" : "metadata"}>{loanStatus(loan, today)}</span> },
  ];
  return <section className="loan-section" aria-busy={loading}>
    <h2>{history ? "Ausleihhistorie" : "Aktive Ausleihen"}</h2>
    {loading && <ActivityLine>Ausleihen werden geladen …</ActivityLine>}
    {error && <><InlineAlert>{error}</InlineAlert><Button variant="secondary" onClick={reload}>Erneut versuchen</Button></>}
    {data && !error && <>
      {data.items.length ? <DataTable label={history ? "Ausleihhistorie" : "Aktive Ausleihen"} columns={columns} items={data.items} />
        : <p className="section-note">{history ? "Noch keine abgeschlossenen Ausleihen." : "Du hast derzeit keine aktiven Ausleihen."}</p>}
      <Pagination label={history ? "Historienseiten" : "Aktive Ausleihseiten"} page={page} pageSize={20} total={data.total} disabled={loading} onChange={setPage} />
    </>}
  </section>;
}

export default function MyLoans({ today }) {
  useLibraryDay(today);
  return <><LoanList key={`active:${today}`} today={today} /><LoanList key={`history:${today}`} history today={today} /></>;
}
