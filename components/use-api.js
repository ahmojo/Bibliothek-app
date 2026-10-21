"use client";

import { useEffect, useState } from "react";

export default function useApi(url) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState({ key: null, data: null, error: null });
  const key = `${url}:${attempt}`;
  useEffect(() => {
    const controller = new AbortController();
    fetch(url, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error(response.status === 404 ? "Medium nicht gefunden." : "Die Daten konnten nicht geladen werden. Bitte versuche es erneut.");
        return response.json();
      })
      .then((data) => setResult({ key, data, error: null }))
      .catch((error) => {
        if (controller.signal.aborted) return;
        const message = error.message === "Medium nicht gefunden." ? error.message
          : error instanceof TypeError ? "Die Verbindung ist unterbrochen. Bitte versuche es erneut."
          : "Die Daten konnten nicht geladen werden. Bitte versuche es erneut.";
        setResult({ key, data: null, error: message });
      });
    return () => controller.abort();
  }, [url, key]);
  return { data: result.data, error: result.key === key ? result.error : null, loading: result.key !== key, reload: () => setAttempt((value) => value + 1) };
}
