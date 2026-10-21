import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";

export const metadata = { title: "Administration" };

export default async function AdminPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/");
  return <main className="page-container page-content" id="inhalt"><h1>Administration</h1><Link className="back-link" href="/">Zum Katalog</Link></main>;
}
