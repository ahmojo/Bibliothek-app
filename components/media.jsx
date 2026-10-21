"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { StatusText } from "./ui";

export const mediaLabels = { book: "Buch", cd: "CD", dvd: "DVD" };

export function MediaCover({ medium }) {
  const [broken, setBroken] = useState(false);
  const filename = medium.cover_image_path;
  const valid = typeof filename === "string" && /^[0-9a-f-]{36}\.webp$/.test(filename);
  return valid && !broken
    ? <Image className="media-cover" src={`/api/covers/${filename}`} alt={`Cover: ${medium.title}`} width={96} height={136} unoptimized onError={() => setBroken(true)} />
    : <div className="media-cover cover-placeholder" aria-label="Kein Cover vorhanden"><span>{mediaLabels[medium.type]}</span></div>;
}

export function Availability({ medium }) {
  const { total_copies: total, available_copies: available } = medium;
  const label = total === 0 ? "Keine Exemplare erfasst" : available === 0 ? "Aktuell nicht verfügbar" : `${available} von ${total} Exemplaren verfügbar`;
  return <StatusText available={available > 0}>{label}</StatusText>;
}

export function MediaCard({ medium, href }) {
  return (
    <article className="media-card">
      <MediaCover medium={medium} />
      <div className="media-card-content">
        <p className="media-type">{mediaLabels[medium.type]}</p>
        <h2><Link href={href} scroll={false}>{medium.title}</Link></h2>
        {medium.type === "book" && <p className="metadata">{medium.author}</p>}
        <Availability medium={medium} />
      </div>
    </article>
  );
}
