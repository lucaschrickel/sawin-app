import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { entschluesseln, schluesselLesen, verschluesseln } from "./krypto";

/*
  Zugang zu Microsoft Graph als Anwendung (Client-Credentials, keine Benutzeranmeldung, keine Mailrechte). Zugriff nur
  auf die eine freigegebene SharePoint-Bibliothek (Lists.SelectedOperations.Selected bzw. Sites.Selected).
  Zugangsdaten nur in Server-Umgebungsvariablen: MS_GRAPH_TENANT_ID, MS_GRAPH_CLIENT_ID, MS_GRAPH_CLIENT_SECRET,
  MS_TOKEN_SCHLUESSEL. Das Zugriffstoken liegt verschlüsselt in public.ms_token (nur Service-Rolle) und im Speicher.
  Für Tests lassen sich die Adressen umlenken: MS_GRAPH_BASIS, MS_LOGIN_BASIS (nie in Produktion setzen).
*/

const GRAPH = () => (process.env.MS_GRAPH_BASIS?.trim() || "https://graph.microsoft.com/v1.0").replace(/\/$/, "");
const LOGIN = () => (process.env.MS_LOGIN_BASIS?.trim() || "https://login.microsoftonline.com").replace(/\/$/, "");

export class GraphFehler extends Error {
  status: number;
  code: string | null;
  constructor(meldung: string, status: number, code: string | null = null) {
    super(meldung);
    this.name = "GraphFehler";
    this.status = status;
    this.code = code;
  }
}

/** Sind die Zugangsdaten auf dem Server gesetzt? (Werte werden nie ausgegeben) */
export function graphEingerichtet(): boolean {
  return !!(process.env.MS_GRAPH_TENANT_ID?.trim() && process.env.MS_GRAPH_CLIENT_ID?.trim() && process.env.MS_GRAPH_CLIENT_SECRET?.trim() && process.env.MS_TOKEN_SCHLUESSEL?.trim());
}

let imSpeicher: { token: string; bis: number } | null = null;

async function tokenHolen(): Promise<string> {
  if (imSpeicher && imSpeicher.bis - Date.now() > 5 * 60_000) return imSpeicher.token;
  const schluessel = schluesselLesen(process.env.MS_TOKEN_SCHLUESSEL);
  const admin = createAdminClient();
  // Gespeichertes Token anderer Server-Instanzen nutzen, solange es noch mindestens 5 Minuten gilt
  const { data: gespeichert } = await admin.from("ms_token").select("wert, gueltig_bis").eq("id", 1).maybeSingle();
  if (gespeichert && Date.parse(gespeichert.gueltig_bis) - Date.now() > 5 * 60_000) {
    try {
      imSpeicher = { token: entschluesseln(gespeichert.wert, schluessel), bis: Date.parse(gespeichert.gueltig_bis) };
      return imSpeicher.token;
    } catch {
      // Schlüssel gewechselt oder Daten beschädigt: neu holen
    }
  }
  const tenant = encodeURIComponent(process.env.MS_GRAPH_TENANT_ID!.trim());
  const antwort = await fetch(`${LOGIN()}/${tenant}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.MS_GRAPH_CLIENT_ID!.trim(),
      client_secret: process.env.MS_GRAPH_CLIENT_SECRET!.trim(),
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials",
    }),
    signal: AbortSignal.timeout(20_000),
    cache: "no-store",
  }).catch(() => null);
  if (!antwort) throw new GraphFehler("Microsoft ist nicht erreichbar.", 0);
  const d = (await antwort.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: string; error_description?: string };
  if (!antwort.ok || !d.access_token) {
    // Fehlertext von Microsoft ohne Geheimnisse (enthält nur Codes wie AADSTS7000215)
    throw new GraphFehler(`Anmeldung bei Microsoft fehlgeschlagen (${d.error ?? antwort.status}). Bitte Mandant, App-ID und geheimen Schlüssel prüfen.`, antwort.status, d.error ?? null);
  }
  const bis = Date.now() + (d.expires_in ?? 3600) * 1000;
  imSpeicher = { token: d.access_token, bis };
  await admin.from("ms_token").upsert({ id: 1, wert: verschluesseln(d.access_token, schluessel), gueltig_bis: new Date(bis).toISOString(), updated_at: new Date().toISOString() });
  return d.access_token;
}

const warte = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Optionen = { body?: unknown; inhalt?: Buffer | Uint8Array; headers?: Record<string, string>; ohneToken?: boolean };

/** Ein Aufruf an Graph (Pfad relativ zu /v1.0 oder volle Adresse, z. B. Upload-Sitzung). 429/503 mit Wartezeit wiederholt. */
export async function graph<T = unknown>(methode: "GET" | "POST" | "PATCH" | "PUT" | "DELETE", pfad: string, opt: Optionen = {}): Promise<T> {
  if (!graphEingerichtet()) throw new GraphFehler("Die OneDrive-Anbindung ist nicht eingerichtet.", 0);
  const url = pfad.startsWith("http") ? pfad : GRAPH() + pfad;
  for (let versuch = 0; ; versuch++) {
    const token = opt.ohneToken ? null : await tokenHolen();
    let antwort: Response;
    try {
      antwort = await fetch(url, {
        method: methode,
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(opt.body !== undefined ? { "Content-Type": "application/json" } : {}),
          ...(opt.inhalt ? { "Content-Type": "application/octet-stream" } : {}),
          ...opt.headers,
        },
        body: opt.body !== undefined ? JSON.stringify(opt.body) : opt.inhalt ? new Uint8Array(opt.inhalt) : undefined,
        signal: AbortSignal.timeout(60_000),
        cache: "no-store",
      });
    } catch {
      if (versuch < 2) {
        await warte(1000 * 2 ** versuch);
        continue;
      }
      throw new GraphFehler("Microsoft ist nicht erreichbar.", 0);
    }
    if ((antwort.status === 429 || antwort.status === 503) && versuch < 4) {
      const nach = Number(antwort.headers.get("retry-after"));
      await warte(Number.isFinite(nach) && nach > 0 ? Math.min(nach, 30) * 1000 : 1000 * 2 ** versuch);
      continue;
    }
    if (antwort.status === 401 && !opt.ohneToken && versuch === 0) {
      // Token abgelaufen oder widerrufen: einmal neu holen
      imSpeicher = null;
      await createAdminClient().from("ms_token").delete().eq("id", 1);
      continue;
    }
    if (antwort.status === 204) return undefined as T;
    const typ = antwort.headers.get("content-type") ?? "";
    const daten = typ.includes("json") ? await antwort.json().catch(() => null) : await antwort.text().catch(() => null);
    if (!antwort.ok) {
      const f = (daten as { error?: { code?: string; message?: string } } | null)?.error;
      const meldung =
        antwort.status === 403
          ? "Microsoft verweigert den Zugriff. Ist die Bibliothek für die App freigegeben (Admin-Zustimmung und Freigabe der Liste)?"
          : antwort.status === 404
            ? "Nicht gefunden (Website, Bibliothek oder Ordner)."
            : `Microsoft meldet Fehler ${antwort.status}${f?.code ? ` (${f.code})` : ""}.`;
      throw new GraphFehler(meldung, antwort.status, f?.code ?? null);
    }
    return daten as T;
  }
}

export type DriveItem = { id: string; name: string; webUrl?: string; folder?: unknown; file?: unknown; size?: number; parentReference?: { driveId?: string } };
