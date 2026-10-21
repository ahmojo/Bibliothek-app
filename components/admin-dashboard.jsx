"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import AdminMedia from "./admin-media";
import AdminExemplars from "./admin-exemplars";
import AdminUsers from "./admin-users";
import AdminLoans from "./admin-loans";

const sections = [["medien", "Medien"], ["exemplare", "Exemplare"], ["benutzer", "Benutzer"], ["ausleihen", "Ausleihen"]];

export default function AdminDashboard({ today }) {
  const params = useSearchParams();
  const requested = params.get("bereich");
  const section = sections.some(([key]) => key === requested) ? requested : "ausleihen";
  return <div className="admin-layout">
    <nav className="admin-nav" aria-label="Verwaltungsbereiche">{sections.map(([key, label]) => <Link key={key} href={`/admin?bereich=${key}`} scroll={false} aria-current={key === section ? "page" : undefined}>{label}</Link>)}</nav>
    <div className="admin-content">
      {section === "medien" && <AdminMedia />}
      {section === "exemplare" && <AdminExemplars />}
      {section === "benutzer" && <AdminUsers />}
      {section === "ausleihen" && <AdminLoans key={today} today={today} />}
    </div>
  </div>;
}
