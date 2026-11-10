import "server-only";

/*
  Zentraler Zugang zur Lexware-API (https://api.lexware.io). Alle Aufrufe laufen hierüber:
    * Drosselung: höchstens 2 Anfragen pro Sekunde (Abstand 520 ms je Server-Instanz)
    * HTTP 429: Wiederholung mit exponentiellem Backoff (Retry-After wird beachtet)
    * Lesende Aufrufe (GET) werden bei Netzfehlern und 5xx wiederholt; anlegende (POST) nicht blind – dort prüft die
      Übertragung vorher, ob der Beleg schon angelegt wurde (siehe uebertragung.ts)
  Der Schlüssel (LEXWARE_API_KEY) bleibt auf dem Server und erscheint nie in Logs oder Meldungen.
*/

const BASIS = "https://api.lexware.io";
const ABSTAND_MS = 520;
const VERSUCHE_429 = 6;

let naechsterSlot = 0;

/** Wartet auf den nächsten freien Slot (2 Anfragen pro Sekunde) */
async function drosseln() {
  const jetzt = Date.now();
  const slot = Math.max(jetzt, naechsterSlot);
  naechsterSlot = slot + ABSTAND_MS;
  if (slot > jetzt) await new Promise((r) => setTimeout(r, slot - jetzt));
}

const warte = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function lexwareEingerichtet(): boolean {
  return !!process.env.LEXWARE_API_KEY?.trim();
}

export class LexwareFehler extends Error {
  /** HTTP-Status (0 = keine Antwort) */
  status: number;
  /** Anlegen ist evtl. trotzdem bei Lexware angekommen (Netzfehler oder 5xx bei POST) */
  vielleichtAngelegt: boolean;
  constructor(meldung: string, status: number, vielleichtAngelegt = false) {
    super(meldung);
    this.name = "LexwareFehler";
    this.status = status;
    this.vielleichtAngelegt = vielleichtAngelegt;
  }
}

const FELDER: Record<string, string> = {
  title: "Belegtitel",
  introduction: "Einleitung (mit Bauvorhaben und Objekt)",
  remark: "Nachbemerkung",
  name: "Positionstitel",
  description: "Positionsbeschreibung",
  unitName: "Einheit",
  "paymentConditions.paymentTermLabel": "Text der Zahlungsbedingung",
  totalGrossAmount: "Gesamtbetrag",
};

/** Verständliche Meldung aus der Fehlerantwort von Lexware (Details, IssueList oder message) */
function meldungAus(status: number, daten: unknown): string {
  const d = (daten ?? {}) as { message?: string; details?: { field?: string; message?: string }[]; IssueList?: { source?: string; i18nKey?: string }[] };
  const feld = (f = "") => {
    const ohneIndex = f.replace(/\[\d+\]/g, "");
    const pos = f.match(/lineItems\[(\d+)\]/);
    const name = FELDER[ohneIndex] ?? FELDER[ohneIndex.split(".").pop() ?? ""] ?? ohneIndex;
    return pos ? `Position ${Number(pos[1]) + 1}: ${name}` : name;
  };
  if (d.details?.length) return d.details.map((x) => `${feld(x.field)} – ${x.message}`).join("; ");
  if (d.IssueList?.length) return d.IssueList.map((x) => `${feld(x.source)} – ${x.i18nKey === "invalid_value" ? "ungültiger Wert" : (x.i18nKey ?? "ungültig")}`).join("; ");
  if (status === 401 || status === 403) return "Lexware lehnt den Zugang ab. Bitte den API-Schlüssel prüfen.";
  if (status === 429) return "Lexware ist gerade ausgelastet. Bitte gleich noch einmal versuchen.";
  if (status >= 500) return "Lexware ist gerade nicht erreichbar. Bitte später noch einmal versuchen.";
  return d.message ?? `Lexware meldet Fehler ${status}.`;
}

type Optionen = { body?: unknown; accept?: string };

/** Ein Aufruf der Lexware-API. Antwort als JSON bzw. bei PDF als Buffer. */
export async function lexware<T = unknown>(methode: "GET" | "POST" | "PUT", pfad: string, opt: Optionen = {}): Promise<T> {
  const schluessel = process.env.LEXWARE_API_KEY?.trim();
  if (!schluessel) throw new LexwareFehler("Die Lexware-Anbindung ist nicht eingerichtet (LEXWARE_API_KEY fehlt).", 0);
  const lesend = methode === "GET";
  for (let versuch = 0; ; versuch++) {
    await drosseln();
    let antwort: Response;
    try {
      antwort = await fetch(BASIS + pfad, {
        method: methode,
        headers: {
          Authorization: `Bearer ${schluessel}`,
          Accept: opt.accept ?? "application/json",
          ...(opt.body !== undefined ? { "Content-Type": "application/json" } : {}),
        },
        body: opt.body !== undefined ? JSON.stringify(opt.body) : undefined,
        signal: AbortSignal.timeout(30_000),
        cache: "no-store",
      });
    } catch {
      if (lesend && versuch < 3) {
        await warte(1000 * 2 ** versuch);
        continue;
      }
      throw new LexwareFehler("Lexware ist nicht erreichbar. Bitte später noch einmal versuchen.", 0, !lesend);
    }
    if (antwort.status === 429 && versuch < VERSUCHE_429) {
      const nach = Number(antwort.headers.get("retry-after"));
      await warte(Number.isFinite(nach) && nach > 0 ? nach * 1000 : 1000 * 2 ** versuch);
      continue;
    }
    if (antwort.status >= 500 && lesend && versuch < 3) {
      await warte(1000 * 2 ** versuch);
      continue;
    }
    const typ = antwort.headers.get("content-type") ?? "";
    const daten = typ.includes("json") ? await antwort.json().catch(() => null) : Buffer.from(await antwort.arrayBuffer());
    if (!antwort.ok) throw new LexwareFehler(meldungAus(antwort.status, daten), antwort.status, !lesend && antwort.status >= 500);
    return daten as T;
  }
}
