import { redirect } from "next/navigation";

// Bis weitere Reiter gebaut sind, öffnet „Einstellungen“ die Benutzerverwaltung.
export default function EinstellungenPage() {
  redirect("/einstellungen/benutzer");
}
