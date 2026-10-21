import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";

export const metadata = { title: "Meine Ausleihen" };

export default async function MyLoansPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return <main className="page-container page-content" id="inhalt"><h1>Meine Ausleihen</h1><Link className="back-link" href="/">Zum Katalog</Link></main>;
}
