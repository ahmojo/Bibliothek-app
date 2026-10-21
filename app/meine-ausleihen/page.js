import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import MyLoans from "@/components/my-loans";
import { LIBRARY_TIME_ZONE } from "@/lib/postgres.mjs";

export const metadata = { title: "Meine Ausleihen" };

export default async function MyLoansPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: LIBRARY_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  return <main className="page-container page-content" id="inhalt"><h1>Meine Ausleihen</h1><MyLoans today={today} /><Link className="back-link" href="/">Zum Katalog</Link></main>;
}
