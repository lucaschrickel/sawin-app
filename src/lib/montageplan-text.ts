/** Texte der Plantafel, im Server und im Browser nutzbar */
export type Konflikt = { einsatz_id: string; mitarbeiter_id: string; art: "ueberschneidung" | "abwesend"; detail: string };

export const ABWESENHEIT_TEXT: Record<string, string> = {
  urlaub: "Urlaub",
  krank: "Krank",
  schulung: "Schulung",
  ueberstundenabbau: "Überstundenabbau",
  sonstiges: "Abwesend",
};

/** Lesbarer Konflikt, z. B. „Gleichzeitig in AB2260012“ oder „Urlaub (beantragt)“ */
export function konfliktText(k: Pick<Konflikt, "art" | "detail">) {
  if (k.art === "ueberschneidung") return `gleichzeitig in ${k.detail}`;
  const [art, status] = k.detail.split(":");
  return `${ABWESENHEIT_TEXT[art] ?? art}${status === "beantragt" ? " (beantragt)" : ""}`;
}
