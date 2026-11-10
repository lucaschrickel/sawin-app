import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { sicheresZiel } from "@/lib/auth/konstanten";
import { anmeldeStand } from "@/lib/auth/sitzung";
import { CodeFormular, Kopf } from "../../formulare";
import Laden from "../../loading";

export const metadata: Metadata = { title: "Bestätigungscode" };

/** Sitzung (Cookies) hinter Suspense, damit die Seite nicht blockiert (Cache Components). */
export default function CodePage({ searchParams }: PageProps<"/anmelden/code">) {
  return (
    <Suspense fallback={<Laden />}>
      <Code searchParams={searchParams} />
    </Suspense>
  );
}

async function Code({ searchParams }: Pick<PageProps<"/anmelden/code">, "searchParams">) {
  const { weiter } = await searchParams;
  const ziel = sicheresZiel(weiter);
  const stand = await anmeldeStand();
  if (!stand.angemeldet) redirect("/anmelden");
  if (stand.aal === "aal2") redirect(ziel);
  if (!stand.faktor) redirect("/anmelden/einrichten");
  return (
    <>
      <Kopf titel="Bestätigungscode" text={<>Angemeldet als <b className="text-ink">{stand.email}</b>. Gib den aktuellen Code aus deiner Authenticator-App ein.</>} />
      <CodeFormular weiter={ziel} />
    </>
  );
}
