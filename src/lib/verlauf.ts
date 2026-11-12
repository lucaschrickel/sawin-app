/*
  Zurück-Verlauf je Browser-Tab (CLAUDE.md „Zurück oben links“): oben links steht „← <vorherige Maske>“, nicht die
  fachliche Elternseite. Wechsel innerhalb derselben Maske (Reiter, Filter, Entwurf → gespeicherter Beleg, Bearbeiten →
  Ansicht) ersetzen den letzten Eintrag; kehrt man zu einer früheren Maske zurück (auch mit dem Browser-Zurück), endet
  der Verlauf dort. Ein Klick in die Seitenleiste beginnt ihn neu. Ohne Abhängigkeiten, im Browser und in den
  Unit-Tests (tests/unit/verlauf.test.ts) nutzbar; gespeichert wird im sessionStorage des Tabs.
*/

export type VerlaufEintrag = {
  /** Pfad mit Filtern (pathname + search) */
  pfad: string;
  maske: string;
  titel: string;
  /** history.length beim Betreten (für die Entscheidung history.back() oder neu navigieren) */
  laenge: number;
  quelle: "direkt" | "seitenleiste" | "navigation";
};

export const VERLAUF_MAX = 30;

/** Maske einer Adresse: der Pfad; Beleg-Entwurf, Beleg und „Bearbeiten“ desselben Belegs sind eine Maske */
export function maskeVon(pathname: string): string {
  const p = pathname.replace(/\/+$/, "") || "/";
  const beleg = /^\/beleg\/([^/]+)(?:\/bearbeiten)?$/.exec(p);
  if (beleg) return `beleg:${beleg[1]}`;
  return p;
}

/** Gleiche Maske; der neue Entwurf wird beim ersten Speichern zum Beleg (/beleg/neu → /beleg/<id>) */
const gleich = (alt: string, neu: string) => alt === neu || (alt === "beleg:neu" && neu.startsWith("beleg:"));

/** Verlauf nach einer Navigation fortschreiben */
export function verlaufWeiter(
  verlauf: VerlaufEintrag[],
  ziel: { pfad: string; pathname: string; titel: string; laenge: number },
  seitenleiste: boolean,
): VerlaufEintrag[] {
  const maske = maskeVon(ziel.pathname);
  const eintrag = (quelle: VerlaufEintrag["quelle"]): VerlaufEintrag => ({ pfad: ziel.pfad, maske, titel: ziel.titel, laenge: ziel.laenge, quelle });
  if (seitenleiste) return [eintrag("seitenleiste")];
  if (!verlauf.length) return [eintrag("direkt")];
  const letzte = verlauf[verlauf.length - 1];
  if (gleich(letzte.maske, maske)) return [...verlauf.slice(0, -1), { ...letzte, pfad: ziel.pfad, maske, titel: ziel.titel }];
  // zurück zu einer früheren Maske (Zurück-Knopf, Browser-Zurück oder erneut geöffnet): Verlauf endet dort
  for (let i = verlauf.length - 2; i >= 0; i--) {
    if (verlauf[i].maske === maske) return [...verlauf.slice(0, i), { ...verlauf[i], pfad: ziel.pfad, titel: ziel.titel }];
  }
  return [...verlauf, eintrag("navigation")].slice(-VERLAUF_MAX);
}

/** Einträge einer Maske entfernen (gelöschter Vorgang); aufeinanderfolgende gleiche Masken werden zusammengelegt */
export function ohneMaske(verlauf: VerlaufEintrag[], pathname: string): VerlaufEintrag[] {
  const maske = maskeVon(pathname);
  const rest = verlauf.filter((e) => e.maske !== maske);
  return rest.filter((e, i) => i === rest.length - 1 || e.maske !== rest[i + 1].maske);
}

/**
 * Zurück per history.back(), wenn der Browser-Verlauf genau zur vorherigen Maske führt (die aktuelle Maske wurde mit
 * einem Schritt betreten und seitdem nur ersetzt); sonst wird die vorherige Adresse neu geöffnet.
 */
export function zurueckPerHistorie(verlauf: VerlaufEintrag[], historyLaenge: number): boolean {
  if (verlauf.length < 2) return false;
  const akt = verlauf[verlauf.length - 1];
  const vor = verlauf[verlauf.length - 2];
  return akt.quelle === "navigation" && akt.laenge === vor.laenge + 1 && historyLaenge === akt.laenge;
}

/** Was oben links steht: Zurück-Knopf, nur der Name der Maske (nach der Seitenleiste) oder der fachliche Pfad */
export function anzeige(verlauf: VerlaufEintrag[]): { art: "zurueck"; titel: string; pfad: string } | { art: "name" } | { art: "pfad" } {
  if (verlauf.length >= 2) {
    const vor = verlauf[verlauf.length - 2];
    return { art: "zurueck", titel: vor.titel, pfad: vor.pfad };
  }
  return verlauf[0]?.quelle === "seitenleiste" ? { art: "name" } : { art: "pfad" };
}
