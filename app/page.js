
import { getSetupMessage } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function Home() {
  const message = await getSetupMessage();

  return (
    <main>
      <h1>Bibliotheksapp</h1>
      <p>{message}</p>
    </main>
  );
}
