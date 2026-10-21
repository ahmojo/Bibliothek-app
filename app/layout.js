import localFont from "next/font/local";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import AppHeader from "@/components/app-header";
import AuthProvider from "@/components/session-provider";
import "./globals.css";

const sourceSans = localFont({ src: "./fonts/SourceSans3VF-Upright.woff2", variable: "--font-source-sans", weight: "200 900", display: "swap" });

export const metadata = {
  title: { default: "Medienkatalog · Bibliotheksapp", template: "%s · Bibliotheksapp" },
  description: "Bücher, CDs und DVDs finden und ihre Verfügbarkeit prüfen.",
};

export default async function RootLayout({ children }) {
  const session = await getServerSession(authOptions);
  return (
    <html lang="de-CH" className={sourceSans.variable}>
      <body>
        <a className="skip-link" href="#inhalt">Zum Inhalt</a>
        <AuthProvider session={session}>
          <AppHeader />
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
