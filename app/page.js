
import { Suspense } from "react";
import Catalog from "@/components/catalog";
import { ActivityLine } from "@/components/ui";

export const dynamic = "force-dynamic";

export default function Home() {
  return (
    <main className="page-container page-content" id="inhalt">
      <h1>Medienkatalog</h1>
      <Suspense fallback={<ActivityLine>Medien werden geladen …</ActivityLine>}>
        <Catalog />
      </Suspense>
    </main>
  );
}
