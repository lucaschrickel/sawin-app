/**
 * Zeitpunkte immer in deutscher Ortszeit (Europe/Berlin), unabhängig von der Zeitzone des Servers (Vercel: UTC).
 * Eingabefelder „datetime-local“ liefern Ortszeit ohne Zone; gespeichert wird UTC (timestamptz).
 */
const ZONE = "Europe/Berlin";

const teile = new Intl.DateTimeFormat("en-US", {
  timeZone: ZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

/** Ortszeit in Berlin zu einem UTC-Zeitpunkt als {jahr, monat, tag, stunde, minute} */
function berlin(ts: number) {
  const p = Object.fromEntries(teile.formatToParts(ts).map((x) => [x.type, x.value]));
  return { jahr: +p.year, monat: +p.month, tag: +p.day, stunde: +p.hour, minute: +p.minute };
}
const abweichung = (ts: number) => {
  const b = berlin(ts);
  return Date.UTC(b.jahr, b.monat - 1, b.tag, b.stunde, b.minute) - Math.floor(ts / 60000) * 60000;
};

/** "2026-11-12T09:00" (Ortszeit Berlin) → ISO in UTC. Leere oder ungültige Eingabe → null. */
export function berlinNachUtc(lokal: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(lokal.trim());
  if (!m) return null;
  const wunsch = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  let ts = wunsch - abweichung(wunsch);
  ts = wunsch - abweichung(ts); // zweiter Schritt für die Tage der Zeitumstellung
  return new Date(ts).toISOString();
}

/** ISO (UTC) → "2026-11-12T09:00" für ein datetime-local-Feld */
export function utcNachBerlinLokal(iso: string | null | undefined): string {
  if (!iso) return "";
  const b = berlin(new Date(iso).getTime());
  const z = (n: number) => String(n).padStart(2, "0");
  return `${b.jahr}-${z(b.monat)}-${z(b.tag)}T${z(b.stunde)}:${z(b.minute)}`;
}

const zeitFmt = new Intl.DateTimeFormat("de-DE", { timeZone: ZONE, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
const datumFmt = new Intl.DateTimeFormat("de-DE", { timeZone: ZONE, day: "2-digit", month: "2-digit", year: "numeric" });

/** "12.11.2026, 09:00" */
export const zeitpunkt = (iso: string) => zeitFmt.format(new Date(iso));
/** "12.11.2026" für ein Datum (YYYY-MM-DD) oder einen Zeitpunkt */
export const tag = (wert: string) => datumFmt.format(new Date(/^\d{4}-\d{2}-\d{2}$/.test(wert) ? `${wert}T12:00:00Z` : wert));
/** Heutiges Datum in Berlin als YYYY-MM-DD */
export function heuteBerlin(): string {
  const b = berlin(Date.now());
  return `${b.jahr}-${String(b.monat).padStart(2, "0")}-${String(b.tag).padStart(2, "0")}`;
}
