import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { catalogReturnPath, loginDestination } from "@/lib/navigation.mjs";
import LoginForm from "@/components/login-form";

export const metadata = { title: "Anmelden" };

export default async function LoginPage({ searchParams }) {
  const params = await searchParams;
  const next = catalogReturnPath(params.next);
  const user = await getCurrentUser();
  if (user) redirect(loginDestination(user.role, next));
  return <main className="page-container login-page" id="inhalt"><h1>Anmelden</h1><LoginForm next={next} /></main>;
}
