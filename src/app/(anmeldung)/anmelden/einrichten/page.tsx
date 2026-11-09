import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { anmeldeStand } from "@/lib/auth/sitzung";
import { EinrichtenFormular, Kopf } from "../../formulare";

export const metadata: Metadata = { title: "Zwei-Faktor-Anmeldung einrichten" };

export default async function EinrichtenPage() {
  const stand = await anmeldeStand();
  if (!stand.angemeldet) redirect("/anmelden");
  if (stand.faktor) redirect(stand.aal === "aal2" ? "/" : "/anmelden/code");
  return (
    <>
      <Kopf
        titel="Zwei-Faktor-Anmeldung einrichten"
        text="Einmalig: Ohne zweiten Faktor gibt es keinen Zugriff auf Daten. Du brauchst eine Authenticator-App auf dem Handy."
      />
      <EinrichtenFormular />
    </>
  );
}
