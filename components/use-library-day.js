"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function useLibraryDay(today) {
  const router = useRouter();
  useEffect(() => {
    const formatter = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Zurich", year: "numeric", month: "2-digit", day: "2-digit" });
    // Die Browseruhr löst nur das Neuladen aus; der Vergleichstag bleibt serverseitig.
    const checkDay = () => { if (formatter.format(new Date()) !== today) router.refresh(); };
    const timer = setInterval(checkDay, 60000);
    window.addEventListener("focus", checkDay);
    return () => { clearInterval(timer); window.removeEventListener("focus", checkDay); };
  }, [router, today]);
}
