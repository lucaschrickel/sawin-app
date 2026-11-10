import { redirect } from "next/navigation";

// „Einstellungen“ öffnet den ersten Reiter (Firma)
export default function EinstellungenPage() {
  redirect("/einstellungen/firma");
}
