/** Texte der Plantafel, im Server und im Browser nutzbar */
import { ABWESENHEIT_TEXT } from "@/lib/team";

export { ABWESENHEIT_TEXT };
/** mitarbeiter_id leer bei Konflikten des ganzen Einsatzes (Werkstatt, Feiertag) */
export type Konflikt = { einsatz_id: string; mitarbeiter_id: string | null; art: "ueberschneidung" | "abwesend" | "werkstatt" | "feiertag"; detail: string };


/** Seite zum Bezug eines Einsatzes (Auftrag oder Service-Ticket) */
export const bezugHref = (b: { art: "auftrag" | "ticket"; id: string }) => (b.art === "auftrag" ? "/auftraege/" + b.id : "/service/" + b.id);

/** Lesbarer Konflikt, z. B. „Gleichzeitig in AB2260012“ oder „Urlaub (beantragt)“ */
export function konfliktText(k: Pick<Konflikt, "art" | "detail">) {
  if (k.art === "ueberschneidung") return `gleichzeitig in ${k.detail}`;
  if (k.art === "werkstatt") {
    const [kennzeichen, ...notiz] = k.detail.split(":");
    return `Fahrzeug ${kennzeichen} in der Werkstatt (${notiz.join(":")})`;
  }
  if (k.art === "feiertag") return `Feiertag: ${k.detail}`;
  const [art, status] = k.detail.split(":");
  return `${ABWESENHEIT_TEXT[art] ?? art}${status === "beantragt" ? " (beantragt)" : ""}`;
}
