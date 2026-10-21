import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { Suspense } from "react";
import AdminDashboard from "@/components/admin-dashboard";
import { ActivityLine } from "@/components/ui";
import { LIBRARY_TIME_ZONE } from "@/lib/postgres.mjs";

export const metadata = { title: "Administration" };

export default async function AdminPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/");
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: LIBRARY_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  return <main className="page-container page-content admin-page" id="inhalt"><h1>Administration</h1><Suspense fallback={<ActivityLine />}><AdminDashboard today={today} /></Suspense><Link className="back-link" href="/">Zum Katalog</Link></main>;
}
