import { redirect } from "next/navigation";
import { pruefeSitzung } from "@/lib/auth/sitzung";

// „Einstellungen“ öffnet den ersten Reiter, den der Benutzer sehen darf
export default async function EinstellungenPage() {
  const { benutzer } = await pruefeSitzung();
  redirect(benutzer.admin ? "/einstellungen/benutzer" : "/einstellungen/montageplan");
}
