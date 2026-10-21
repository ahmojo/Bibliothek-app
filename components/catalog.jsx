"use client";

import { useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import useApi from "./use-api";
import { MediaCard } from "./media";
import MediaDetails from "./media-details";
import { ActivityLine, Button, InlineAlert, Pagination } from "./ui";

const filters = [["all", "Alle"], ["book", "Bücher"], ["cd", "CDs"], ["dvd", "DVDs"]];

export default function Catalog() {
  const { data: session } = useSession();
  const user = session?.user;
  const params = useSearchParams();
  const router = useRouter();
  const search = useRef(null);
  const searchTimer = useRef(null);
  const q = params.get("q") || "";
  const type = params.get("type") || "all";
  const page = params.get("page") || "1";
  const query = new URLSearchParams({ q, type, page, pageSize: "12" }).toString();
  const { data, error, loading, reload } = useApi(`/api/catalog?${query}`);
  const medium = params.get("medium");
  const [detailType, detailId] = medium?.split(":") || [];
  const validDetail = ["book", "cd", "dvd"].includes(detailType) && /^[1-9]\d{0,18}$/.test(detailId || "");
  const returnPath = `/?${params.toString()}`;

  useEffect(() => {
    if (document.activeElement !== search.current) search.current.value = q;
  }, [q]);
  useEffect(() => {
    const restore = () => {
      clearTimeout(searchTimer.current);
      search.current.value = new URL(window.location.href).searchParams.get("q") || "";
    };
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, []);
  useEffect(() => () => clearTimeout(searchTimer.current), []);

  function update(values, replace = false) {
    clearTimeout(searchTimer.current);
    const next = new URLSearchParams(window.location.search);
    for (const [key, value] of Object.entries(values)) {
      if (value === null || value === "" || (key === "type" && value === "all") || (key === "page" && String(value) === "1")) next.delete(key);
      else next.set(key, String(value));
    }
    const suffix = next.toString();
    const target = suffix ? `/?${suffix}` : "/";
    if (replace) router.replace(target, { scroll: false });
    else router.push(target, { scroll: false });
  }

  function scheduleSearch() {
    clearTimeout(searchTimer.current);
    const value = search.current.value.trim();
    searchTimer.current = setTimeout(() => update({ q: value, page: "1" }, true), 300);
  }

  function mediumLink(item) {
    const next = new URLSearchParams(params.toString());
    next.set("medium", `${item.type}:${item.id}`);
    return `/?${next.toString()}`;
  }

  return (
    <>
      <div className="catalog-controls">
        <form className="search-form" role="search" onSubmit={(event) => { event.preventDefault(); update({ q: search.current.value.trim(), page: "1" }); }}>
          <label htmlFor="catalog-search">Titel, Autor oder ISBN suchen</label>
          <div className="search-input-row">
            <input ref={search} id="catalog-search" name="q" type="search" defaultValue={q} maxLength={200} onChange={scheduleSearch} />
            <Button type="submit">Suchen</Button>
          </div>
        </form>
        <div className="type-filter" role="group" aria-label="Medientyp">
          {filters.map(([value, label]) => <Button key={value} variant="filter" aria-pressed={type === value} onClick={() => update({ type: value, q: search.current.value.trim(), page: "1" })}>{label}</Button>)}
        </div>
      </div>
      <section aria-label="Medien" aria-busy={loading}>
        <div className="catalog-status" aria-live="polite">
          {loading ? <ActivityLine>Medien werden geladen …</ActivityLine> : data && <p className="metadata">{data.total} {data.total === 1 ? "Medium" : "Medien"} gefunden</p>}
        </div>
        {error && <><InlineAlert>{error}</InlineAlert><Button variant="secondary" onClick={reload}>Erneut versuchen</Button></>}
        {data && !error && <>
          {data.items.length ? <div className="media-grid">{data.items.map((item) => <MediaCard key={`${item.type}:${item.id}`} medium={item} href={mediumLink(item)} />)}</div> : <div className="empty-state">
            <h2>{q || type !== "all" ? "Keine Medien gefunden." : "Noch keine Medien erfasst."}</h2>
            {(q || type !== "all") && <><p>Prüfe den Suchbegriff oder Filter.</p><Button variant="secondary" onClick={() => update({ q: "", type: "all", page: "1" })}>Filter zurücksetzen</Button></>}
          </div>}
          <Pagination page={data.page} pageSize={data.pageSize} total={data.total} disabled={loading} onChange={(next) => update({ page: next })} />
        </>}
      </section>
      {medium && (validDetail ? <MediaDetails key={medium} type={detailType} id={detailId} user={user} returnPath={returnPath} onClose={() => update({ medium: null })} /> : <div className="invalid-detail"><InlineAlert>Medium nicht gefunden.</InlineAlert><Button variant="secondary" onClick={() => update({ medium: null })}>Zurück zum Katalog</Button></div>)}
    </>
  );
}
