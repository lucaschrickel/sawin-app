import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { anmeldeStand } from "@/lib/auth/sitzung";
import { Kopf, PasswortFormular } from "../formulare";

export const metadata: Metadata = { title: "Passwort setzen" };

export default async function PasswortSetzenPage() {
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
