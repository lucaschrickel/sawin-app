import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { anmeldeStand } from "@/lib/auth/sitzung";
import { Kopf, PasswortFormular } from "../formulare";
import Laden from "../loading";

export const metadata: Metadata = { title: "Passwort setzen" };

/** Sitzung (Cookies) hinter Suspense, damit die Seite nicht blockiert (Cache Components). */
export default function PasswortSetzenPage() {
  return (
    <Suspense fallback={<Laden />}>
      <PasswortSetzen />
    </Suspense>
  );
}

async function PasswortSetzen() {
  const stand = await anmeldeStand();
  if (!stand.angemeldet) redirect("/anmelden?grund=link");
  // Wer schon einen zweiten Faktor hat, bestätigt ihn vor dem Passwortwechsel
  if (stand.faktor && stand.aal !== "aal2") redirect("/anmelden/code?weiter=/passwort-setzen");
  return (
    <>
      <Kopf titel="Passwort setzen" text={<>Für <b className="text-ink">{stand.email}</b>.</>} />
      <PasswortFormular />
    </>
  );
}
