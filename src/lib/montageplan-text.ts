/** Texte der Plantafel, im Server und im Browser nutzbar */
import { ABWESENHEIT_TEXT } from "@/lib/team";

export { ABWESENHEIT_TEXT };
export type Konflikt = { einsatz_id: string; mitarbeiter_id: string; art: "ueberschneidung" | "abwesend"; detail: string };


/** Lesbarer Konflikt, z. B. „Gleichzeitig in AB2260012“ oder „Urlaub (beantragt)“ */
export function konfliktText(k: Pick<Konflikt, "art" | "detail">) {
  if (k.art === "ueberschneidung") return `gleichzeitig in ${k.detail}`;
  const [art, status] = k.detail.split(":");
  return `${ABWESENHEIT_TEXT[art] ?? art}${status === "beantragt" ? " (beantragt)" : ""}`;
}
