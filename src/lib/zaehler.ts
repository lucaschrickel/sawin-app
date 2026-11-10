import "server-only";
import type { Zaehler } from "@/components/app/navigation";
import { pruefeSitzung } from "@/lib/auth/sitzung";
import { plusTage } from "@/lib/woche";
import { heuteBerlin } from "@/lib/zeit";

/**
 * Zähler an den Menüpunkten wie in der Demo: offene Aufgaben, Anfragen, Aufträge und Service-Tickets, fällige
 * Prüftermine der Fahrzeuge (≤ 30 Tage), Abwesenheiten zur Genehmigung, offene Bestellungen, Beleg-Entwürfe und offene Angebote. Nur Zahlen, keine Kennzahlen-Kacheln.
 */
export async function ladeZaehler(): Promise<Zaehler> {
  const { supabase } = await pruefeSitzung();
  const grenze = plusTage(heuteBerlin(), 30);
  const anzahl = (r: { count: number | null }) => r.count ?? 0;
  const [aufgaben, anfragen, auftraege, service, serviceNeu, fahrzeuge, abwesenheiten, bestellungen, entwuerfe, angebote] = await Promise.all([
    supabase.from("aufgabe").select("id", { count: "exact", head: true }).neq("status", "erledigt"),
    supabase.from("anfrage").select("id", { count: "exact", head: true }).is("archiv", null),
    supabase.from("auftrag").select("id", { count: "exact", head: true }).neq("phase", "abgeschlossen"),
    supabase.from("service_ticket").select("id", { count: "exact", head: true }).in("status", ["neu", "eingeplant", "in_arbeit"]),
    supabase.from("service_ticket").select("id", { count: "exact", head: true }).eq("status", "neu"),
    supabase.from("fahrzeug").select("id", { count: "exact", head: true }).or(`tuev_am.lte.${grenze},service_am.lte.${grenze},uvv_am.lte.${grenze}`),
    supabase.from("abwesenheit").select("id", { count: "exact", head: true }).eq("status", "beantragt"),
    // Offen = mindestens eine Zeile nicht geliefert
    supabase.from("bestellzeile").select("bestellung_id").eq("geliefert", false).limit(5000),
    // Belege: Entwürfe (Alle Belege) und offene Angebote
    supabase.from("beleg").select("id", { count: "exact", head: true }).eq("status", "entwurf"),
    supabase.from("beleg").select("id", { count: "exact", head: true }).eq("art", "angebot").eq("status", "offen"),
  ]);
  return {
    aufgaben: { n: anzahl(aufgaben) },
    anfragen: { n: anzahl(anfragen) },
    auftraege: { n: anzahl(auftraege) },
    service: { n: anzahl(service), dringend: anzahl(serviceNeu) > 0 },
    fahrzeuge: { n: anzahl(fahrzeuge), dringend: anzahl(fahrzeuge) > 0 },
    abwesenheiten: { n: anzahl(abwesenheiten), dringend: anzahl(abwesenheiten) > 0 },
    bestellungen: { n: new Set((bestellungen.data ?? []).map((z) => z.bestellung_id)).size },
    belege: { n: anzahl(entwuerfe) },
    angebote: { n: anzahl(angebote) },
  };
}
