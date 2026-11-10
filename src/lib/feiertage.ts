/**
 * Gesetzliche Feiertage je Bundesland (wie in der Demo). Ergebnis: Datum „YYYY-MM-DD“ → Name. Server und Browser.
 * Bundesland aus einstellung.bundesland (Standard NI).
 */

function ostersonntag(y: number) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const monat = Math.floor((h + l - 7 * m + 114) / 31), tag = ((h + l - 7 * m + 114) % 31) + 1;
  return Date.UTC(y, monat - 1, tag);
}

const text = (t: number) => new Date(t).toISOString().slice(0, 10);
const TAG = 864e5;
const cache = new Map<string, Map<string, string>>();

export function feiertage(jahr: number, land: string): Map<string, string> {
  const schluessel = `${jahr}-${land}`;
  const vorhanden = cache.get(schluessel);
  if (vorhanden) return vorhanden;
  const o = ostersonntag(jahr);
  const f = new Map<string, string>();
  const fest = (m: number, d: number) => Date.UTC(jahr, m - 1, d);
  const setze = (t: number, name: string) => f.set(text(t), name);
  const in_ = (laender: string[]) => laender.includes(land);

  setze(fest(1, 1), "Neujahr");
  setze(o - 2 * TAG, "Karfreitag");
  setze(o + TAG, "Ostermontag");
  setze(fest(5, 1), "Tag der Arbeit");
  setze(o + 39 * TAG, "Christi Himmelfahrt");
  setze(o + 50 * TAG, "Pfingstmontag");
  setze(fest(10, 3), "Tag der Deutschen Einheit");
  setze(fest(12, 25), "1. Weihnachtstag");
  setze(fest(12, 26), "2. Weihnachtstag");
  if (in_(["BW", "BY", "ST"])) setze(fest(1, 6), "Heilige Drei Könige");
  if (in_(["BE", "MV"])) setze(fest(3, 8), "Internationaler Frauentag");
  if (in_(["BW", "BY", "HE", "NW", "RP", "SL"])) setze(o + 60 * TAG, "Fronleichnam");
  if (in_(["SL"])) setze(fest(8, 15), "Mariä Himmelfahrt");
  if (in_(["TH"])) setze(fest(9, 20), "Weltkindertag");
  if (in_(["BB", "HB", "HH", "MV", "NI", "SN", "ST", "SH", "TH"])) setze(fest(10, 31), "Reformationstag");
  if (in_(["BW", "BY", "NW", "RP", "SL"])) setze(fest(11, 1), "Allerheiligen");
  if (in_(["SN"])) {
    let t = fest(11, 22);
    while (new Date(t).getUTCDay() !== 3) t -= TAG;
    setze(t, "Buß- und Bettag");
  }
  cache.set(schluessel, f);
  return f;
}

/** Feiertage zwischen zwei Daten (einschließlich) als Liste */
export function feiertageImZeitraum(von: string, bis: string, land: string) {
  const out: { datum: string; name: string }[] = [];
  for (let j = Number(von.slice(0, 4)); j <= Number(bis.slice(0, 4)); j++) {
    for (const [datum, name] of feiertage(j, land)) if (datum >= von && datum <= bis) out.push({ datum, name });
  }
  return out.sort((a, b) => a.datum.localeCompare(b.datum));
}
