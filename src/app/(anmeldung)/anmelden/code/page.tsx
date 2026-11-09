import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { sicheresZiel } from "@/lib/auth/konstanten";
import { anmeldeStand } from "@/lib/auth/sitzung";
import { CodeFormular, Kopf } from "../../formulare";

export const metadata: Metadata = { title: "Bestätigungscode" };

export default async function CodePage({ searchParams }: PageProps<"/anmelden/code">) {
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
