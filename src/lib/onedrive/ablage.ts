import "server-only";
import { after } from "next/server";
import { BELEGART_TEXT, type Belegart } from "@/lib/belege-status";
import { createAdminClient } from "@/lib/supabase/admin";
import { versandDateiname } from "@/lib/versand";
import { graph, graphEingerichtet, GraphFehler, type DriveItem } from "./graph";
import { basisPfad, ordnerName, pfadKodieren, SERVICE_ORDNER, SERVICE_UNTERORDNER, sharepointName, unterordnerFuer, UNTERORDNER } from "./schema";

/*
  OneDrive-Ablage (CLAUDE.md „OneDrive“): Ordner je Anfrage ab dem ersten Angebot (<AG-Nummer>_<Kunde>), mit der AB
  derselbe Ordner für den Auftrag (umbenannt in <AB-Nummer>_<Kunde>), Tickets unter Service/ bzw. 07 Service/ im
  Auftragsordner. Die App speichert nur die Verknüpfung. Ist Microsoft nicht erreichbar oder die Verbindung noch nicht
  eingerichtet, liegt die Datei im privaten Speicher ablage-puffer und wird später nachgeladen (Cron und Seitenaufruf).
  Gelesen und geschrieben wird mit der Service-Rolle; geschrieben nur über ablage_*_setzen mit dem handelnden Benutzer.
*/

const PUFFER = "ablage-puffer";
const EINFACH_GRENZE = 4 * 1024 * 1024;
const TEIL = 320 * 1024 * 10; // 3,125 MiB je Teil (Vielfaches von 320 KiB)

export type Bezug = { anfrage_id?: string | null; auftrag_id?: string | null; ticket_id?: string | null };
type Verbindung = { drive_id: string; basis_id: string; basis_url: string | null };
export type OrdnerZeile = {
  id: string;
  anfrage_id: string | null;
  auftrag_id: string | null;
  ticket_id: string | null;
  name: string;
  drive_id: string | null;
  item_id: string | null;
  web_url: string | null;
  unterordner: Record<string, string>;
  status: "wartet" | "angelegt" | "fehler";
  fehler: string | null;
};
export type DateiZeile = {
  id: string;
  ordner_id: string;
  unterordner: string | null;
  name: string;
  quelle: string;
  beleg_id: string | null;
  version: number | null;
  mime: string | null;
  groesse: number | null;
  item_id: string | null;
  web_url: string | null;
  status: "wartet" | "abgelegt" | "fehler";
  puffer_pfad: string | null;
  versuche: number;
  fehler: string | null;
  abgelegt_am: string | null;
  created_at: string;
};

const ORDNER_FELDER = "id, anfrage_id, auftrag_id, ticket_id, name, drive_id, item_id, web_url, unterordner, status, fehler";
const DATEI_FELDER = "id, ordner_id, unterordner, name, quelle, beleg_id, version, mime, groesse, item_id, web_url, status, puffer_pfad, versuche, fehler, abgelegt_am, created_at";
const fehlerText = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 500);

async function ordnerSetzen(benutzer: string | null, id: string | null, daten: Record<string, unknown>) {
  const { data, error } = await createAdminClient().rpc("ablage_ordner_setzen", { p_benutzer: benutzer, p_id: id, p_daten: daten });
  if (error) throw new Error(`Ablage-Ordner konnte nicht gespeichert werden: ${error.message}`);
  return data as string;
}
async function dateiSetzen(benutzer: string | null, id: string | null, daten: Record<string, unknown>) {
  const { data, error } = await createAdminClient().rpc("ablage_datei_setzen", { p_benutzer: benutzer, p_id: id, p_daten: daten });
  if (error) throw new Error(`Ablage-Datei konnte nicht gespeichert werden: ${error.message}`);
  return data as string;
}

/** Eingerichtete Verbindung (Zugangsdaten auf dem Server und geprüfte Bibliothek mit Basisordner) */
export async function verbindungLaden(): Promise<Verbindung | null> {
  if (!graphEingerichtet()) return null;
  const { data } = await createAdminClient().from("einstellung").select("onedrive_drive_id, onedrive_basis_id, onedrive_basis_url").eq("einzig", true).maybeSingle();
  return data?.onedrive_drive_id && data.onedrive_basis_id ? { drive_id: data.onedrive_drive_id, basis_id: data.onedrive_basis_id, basis_url: data.onedrive_basis_url } : null;
}

/** Unterordner anlegen oder vorhandenen holen */
async function ordnerItem(driveId: string, elternId: string, name: string): Promise<DriveItem> {
  const n = sharepointName(name);
  try {
    return await graph<DriveItem>("POST", `/drives/${driveId}/items/${elternId}/children`, { body: { name: n, folder: {}, "@microsoft.graph.conflictBehavior": "fail" } });
  } catch (e) {
    if (e instanceof GraphFehler && e.status === 409) return graph<DriveItem>("GET", `/drives/${driveId}/items/${elternId}:/${encodeURIComponent(n)}`);
    throw e;
  }
}

/**
 * Verbindung prüfen (Einstellungen › Verbindungen): Bibliothek der Website, Basisordner (fehlende Teile werden
 * angelegt). Liefert Drive und Basisordner zum Speichern.
 */
export async function verbindungPruefen(siteId: string, listeId: string, pfadEingabe: string) {
  const pfad = basisPfad(pfadEingabe);
  if (!pfad) throw new Error("Bitte einen gültigen Basisordner angeben, z. B. „Kunden/Aufträge“ oder „_App-Test“.");
  const drive = await graph<{ id: string; name: string; webUrl?: string }>("GET", `/sites/${encodeURIComponent(siteId)}/lists/${encodeURIComponent(listeId)}/drive`);
  let basis: DriveItem;
  try {
    basis = await graph<DriveItem>("GET", `/drives/${drive.id}/root:/${pfadKodieren(pfad)}`);
  } catch (e) {
    if (!(e instanceof GraphFehler && e.status === 404)) throw e;
    const wurzel = await graph<DriveItem>("GET", `/drives/${drive.id}/root`);
    let eltern = wurzel;
    for (const teil of pfad.split("/")) eltern = await ordnerItem(drive.id, eltern.id, teil);
    basis = eltern;
  }
  return { drive_id: drive.id, drive_name: drive.name, basis_id: basis.id, basis_url: basis.webUrl ?? null, basis_pfad: pfad };
}

/** Name des Ordners: Anfrage → erste Angebotsnummer, Auftrag → AB-Nummer, Ticket → Ticketnummer (ggf. ohne Kunde) */
async function ordnerNameFuer(b: Bezug): Promise<{ name: string; ticketAuftrag: string | null }> {
  const admin = createAdminClient();
  if (b.auftrag_id) {
    const { data } = await admin.from("auftrag").select("nummer, kunde:kunde_id(name)").eq("id", b.auftrag_id).single<{ nummer: string; kunde: { name: string } | null }>();
    return { name: ordnerName(data!.nummer, data!.kunde?.name ?? null), ticketAuftrag: null };
  }
  if (b.ticket_id) {
    const { data } = await admin.from("service_ticket").select("nummer, auftrag_id, kunde:kunde_id(name)").eq("id", b.ticket_id).single<{ nummer: string; auftrag_id: string | null; kunde: { name: string } | null }>();
    return { name: data!.auftrag_id ? sharepointName(data!.nummer) : ordnerName(data!.nummer, data!.kunde?.name ?? null), ticketAuftrag: data!.auftrag_id };
  }
  const { data: a } = await admin.from("anfrage").select("nummer, kunde:kunde_id(name)").eq("id", b.anfrage_id!).single<{ nummer: string; kunde: { name: string } | null }>();
  const { data: ag } = await admin.from("beleg").select("nummer").eq("anfrage_id", b.anfrage_id!).eq("art", "angebot").not("nummer", "is", null).is("deleted_at", null).order("created_at").limit(1).maybeSingle();
  return { name: ordnerName(ag?.nummer ?? a!.nummer, a!.kunde?.name ?? null), ticketAuftrag: null };
}

/** In Graph anlegen (Ordner und Unterordner); bei Fehlern bleibt der Ordner „wartet“ bzw. „fehler“ */
async function ordnerAnlegen(o: OrdnerZeile, v: Verbindung, benutzer: string | null): Promise<OrdnerZeile> {
  try {
    let elternId = v.basis_id;
    if (o.ticket_id) {
      const { ticketAuftrag } = await ordnerNameFuer({ ticket_id: o.ticket_id });
      if (ticketAuftrag) {
        const auftrag = await ordnerFuer({ auftrag_id: ticketAuftrag }, benutzer);
        if (auftrag.status !== "angelegt" || !auftrag.item_id) throw new Error("Der Auftragsordner ist noch nicht angelegt.");
        elternId = await unterordnerId(auftrag, SERVICE_UNTERORDNER, benutzer);
      } else elternId = (await ordnerItem(v.drive_id, v.basis_id, SERVICE_ORDNER)).id;
    }
    const item = o.item_id ? await graph<DriveItem>("GET", `/drives/${v.drive_id}/items/${o.item_id}`) : await ordnerItem(v.drive_id, elternId, o.name);
    const unter: Record<string, string> = { ...o.unterordner };
    if (!o.ticket_id) for (const u of UNTERORDNER) if (!unter[u]) unter[u] = (await ordnerItem(v.drive_id, item.id, u)).id;
    await ordnerSetzen(benutzer, o.id, { drive_id: v.drive_id, item_id: item.id, web_url: item.webUrl ?? null, unterordner: unter, status: "angelegt", fehler: null });
    return { ...o, drive_id: v.drive_id, item_id: item.id, web_url: item.webUrl ?? null, unterordner: unter, status: "angelegt", fehler: null };
  } catch (e) {
    const meldung = fehlerText(e);
    console.error(`OneDrive: Ordner ${o.name}:`, meldung);
    await ordnerSetzen(benutzer, o.id, { status: e instanceof GraphFehler && e.status === 0 ? "wartet" : "fehler", fehler: meldung });
    return { ...o, status: "fehler", fehler: meldung };
  }
}

/** Item-ID eines Unterordners (wird bei Bedarf angelegt und gemerkt) */
async function unterordnerId(o: OrdnerZeile, name: string, benutzer: string | null): Promise<string> {
  if (o.unterordner[name]) return o.unterordner[name];
  const item = await ordnerItem(o.drive_id!, o.item_id!, name);
  o.unterordner = { ...o.unterordner, [name]: item.id };
  await ordnerSetzen(benutzer, o.id, { unterordner: o.unterordner });
  return item.id;
}

/**
 * Ordner eines Vorgangs sichern: Zeile anlegen (falls nötig) und – wenn verbunden – in OneDrive anlegen. Ein Auftrag
 * übernimmt den Ordner seiner Anfrage (derselbe Ordner, umbenannt auf die AB-Nummer).
 */
export async function ordnerFuer(b: Bezug, benutzer: string | null): Promise<OrdnerZeile> {
  const admin = createAdminClient();
  const spalte = b.auftrag_id ? "auftrag_id" : b.ticket_id ? "ticket_id" : "anfrage_id";
  const wert = (b.auftrag_id ?? b.ticket_id ?? b.anfrage_id)!;
  let { data: o } = await admin.from("ablage_ordner").select(ORDNER_FELDER).eq(spalte, wert).is("deleted_at", null).maybeSingle<OrdnerZeile>();
  if (!o && b.auftrag_id) {
    // Auftrag aus einer Anfrage: deren Ordner übernehmen und umbenennen
    const { data: a } = await admin.from("auftrag").select("anfrage_id").eq("id", b.auftrag_id).single();
    if (a?.anfrage_id) {
      const { data: q } = await admin.from("ablage_ordner").select(ORDNER_FELDER).eq("anfrage_id", a.anfrage_id).is("deleted_at", null).maybeSingle<OrdnerZeile>();
      if (q) o = await auftragUebernehmen(q, b.auftrag_id, benutzer);
    }
  }
  if (!o) {
    const { name } = await ordnerNameFuer(b);
    let id: string;
    try {
      id = await ordnerSetzen(benutzer, null, { [spalte]: wert, name, status: "wartet" });
    } catch (e) {
      // gleichzeitig von einer anderen Aufgabe angelegt (eindeutiger Index): diese Zeile verwenden
      const { data: da } = await admin.from("ablage_ordner").select(ORDNER_FELDER).eq(spalte, wert).is("deleted_at", null).maybeSingle<OrdnerZeile>();
      if (!da) throw e;
      return da.status === "angelegt" ? da : ordnerFuer(b, benutzer);
    }
    o = { id, anfrage_id: b.anfrage_id ?? null, auftrag_id: b.auftrag_id ?? null, ticket_id: b.ticket_id ?? null, name, drive_id: null, item_id: null, web_url: null, unterordner: {}, status: "wartet", fehler: null };
  }
  if (o.status !== "angelegt") {
    const v = await verbindungLaden();
    if (v) o = await ordnerAnlegen(o, v, benutzer);
  }
  return o;
}

/** Ordner der Anfrage wird zum Auftragsordner: Verweis setzen, in OneDrive umbenennen (<AB-Nummer>_<Kunde>) */
async function auftragUebernehmen(o: OrdnerZeile, auftragId: string, benutzer: string | null): Promise<OrdnerZeile> {
  const { name } = await ordnerNameFuer({ auftrag_id: auftragId });
  let neu: OrdnerZeile = { ...o, auftrag_id: auftragId };
  await ordnerSetzen(benutzer, o.id, { auftrag_id: auftragId });
  if (name !== o.name) {
    if (o.status === "angelegt" && o.item_id && o.drive_id) {
      try {
        const item = await graph<DriveItem>("PATCH", `/drives/${o.drive_id}/items/${o.item_id}`, { body: { name } });
        await ordnerSetzen(benutzer, o.id, { name, web_url: item.webUrl ?? o.web_url });
        neu = { ...neu, name, web_url: item.webUrl ?? o.web_url };
      } catch (e) {
        console.error(`OneDrive: Umbenennen ${o.name} → ${name}:`, fehlerText(e));
        await ordnerSetzen(benutzer, o.id, { fehler: `Umbenennen in „${name}“ fehlgeschlagen: ${fehlerText(e)}` });
      }
    } else {
      await ordnerSetzen(benutzer, o.id, { name });
      neu = { ...neu, name };
    }
  }
  return neu;
}

/** Nach dem Fertigstellen der AB: Ordner der Anfrage übernehmen bzw. neu anlegen (im Hintergrund aufrufen) */
export async function ordnerZumAuftrag(auftragId: string, benutzer: string | null) {
  await ordnerFuer({ auftrag_id: auftragId }, benutzer);
}

/** Hochladen: bis 4 MB in einem Schritt, sonst in Teilen über eine Upload-Sitzung */
async function hochladen(driveId: string, elternId: string, name: string, inhalt: Buffer): Promise<DriveItem> {
  const ziel = `/drives/${driveId}/items/${elternId}:/${encodeURIComponent(name)}:`;
  if (inhalt.length <= EINFACH_GRENZE) return graph<DriveItem>("PUT", `${ziel}/content?@microsoft.graph.conflictBehavior=replace`, { inhalt });
  const sitzung = await graph<{ uploadUrl: string }>("POST", `${ziel}/createUploadSession`, { body: { item: { "@microsoft.graph.conflictBehavior": "replace" } } });
  let item: DriveItem | null = null;
  for (let start = 0; start < inhalt.length; start += TEIL) {
    const teil = inhalt.subarray(start, Math.min(start + TEIL, inhalt.length));
    const r = await graph<DriveItem | { nextExpectedRanges: string[] }>("PUT", sitzung.uploadUrl, {
      inhalt: teil,
      ohneToken: true,
      headers: { "Content-Range": `bytes ${start}-${start + teil.length - 1}/${inhalt.length}` },
    });
    if (r && "id" in r) item = r;
  }
  if (!item) throw new GraphFehler("Upload unvollständig.", 500);
  return item;
}

type Ablegen = { bezug: Bezug; unterordner: string | null; name: string; inhalt: Buffer; mime: string; quelle: "beleg" | "upload" | "formular"; beleg_id?: string | null; version?: number | null };

/** Datei ablegen: direkt nach OneDrive, sonst in den Zwischenspeicher (wird nachgeladen) */
export async function dateiAblegen(a: Ablegen, benutzer: string | null): Promise<DateiZeile> {
  const admin = createAdminClient();
  const name = sharepointName(a.name, 150);
  const ordner = await ordnerFuer(a.bezug, benutzer);
  let vorhanden: DateiZeile | null = null;
  if (a.beleg_id) {
    const { data } = await admin.from("ablage_datei").select(DATEI_FELDER).eq("beleg_id", a.beleg_id).eq("version", a.version ?? 1).is("deleted_at", null).maybeSingle<DateiZeile>();
    vorhanden = data;
  }
  const basis = { ordner_id: ordner.id, unterordner: a.unterordner, name, quelle: a.quelle, beleg_id: a.beleg_id ?? null, version: a.version ?? null, mime: a.mime, groesse: a.inhalt.length };
  const id = vorhanden?.id ?? (await dateiSetzen(benutzer, null, { ...basis, status: "wartet" }));
  if (ordner.status === "angelegt") {
    try {
      const eltern = a.unterordner ? await unterordnerId(ordner, a.unterordner, benutzer) : ordner.item_id!;
      const item = await hochladen(ordner.drive_id!, eltern, name, a.inhalt);
      const jetzt = new Date().toISOString();
      await dateiSetzen(benutzer, id, { name, drive_id: ordner.drive_id, item_id: item.id, web_url: item.webUrl ?? null, status: "abgelegt", puffer_pfad: null, fehler: null, abgelegt_am: jetzt });
      if (vorhanden?.puffer_pfad) await admin.storage.from(PUFFER).remove([vorhanden.puffer_pfad]);
      return { ...(vorhanden ?? ({} as DateiZeile)), ...basis, id, item_id: item.id, web_url: item.webUrl ?? null, status: "abgelegt", puffer_pfad: null, fehler: null, abgelegt_am: jetzt, versuche: 0, created_at: jetzt };
    } catch (e) {
      console.error(`OneDrive: ${name} wird zwischengespeichert:`, fehlerText(e));
      return zwischenspeichern(id, basis, a.inhalt, a.mime, fehlerText(e), benutzer);
    }
  }
  return zwischenspeichern(id, basis, a.inhalt, a.mime, ordner.fehler ?? "OneDrive ist noch nicht verbunden.", benutzer);
}

async function zwischenspeichern(id: string, basis: Record<string, unknown>, inhalt: Buffer, mime: string, grund: string, benutzer: string | null): Promise<DateiZeile> {
  const pfad = `${id}/${basis.name as string}`;
  const { error } = await createAdminClient().storage.from(PUFFER).upload(pfad, inhalt, { contentType: mime, upsert: true });
  if (error) throw new Error(`Die Datei konnte weder in OneDrive noch im Zwischenspeicher abgelegt werden: ${error.message}`);
  await dateiSetzen(benutzer, id, { status: "wartet", puffer_pfad: pfad, fehler: grund });
  return { ...(basis as unknown as DateiZeile), id, status: "wartet", puffer_pfad: pfad, fehler: grund, item_id: null, web_url: null, versuche: 0, abgelegt_am: null, created_at: new Date().toISOString() };
}

/** PDF eines Belegs ablegen (App-Original bzw. Lexware-Original), Unterordner nach Belegart */
export async function belegPdfAblegen(belegId: string, pdf: Buffer, benutzer: string | null) {
  const { data: b } = await createAdminClient()
    .from("beleg")
    .select("art, nummer, version, adresse_name, anfrage_id, auftrag_id, ticket_id, kunde:kunde_id(name)")
    .eq("id", belegId)
    .single<{ art: Belegart; nummer: string | null; version: number; adresse_name: string | null; anfrage_id: string | null; auftrag_id: string | null; ticket_id: string | null; kunde: { name: string } | null }>();
  if (!b?.nummer) return null;
  const name = versandDateiname({ nummer: b.nummer, version: b.version, artText: BELEGART_TEXT[b.art], kunde: b.kunde?.name ?? b.adresse_name });
  const bezug: Bezug = b.auftrag_id ? { auftrag_id: b.auftrag_id } : b.ticket_id ? { ticket_id: b.ticket_id } : { anfrage_id: b.anfrage_id };
  return dateiAblegen({ bezug, unterordner: b.ticket_id ? null : unterordnerFuer(b.art), name, inhalt: pdf, mime: "application/pdf", quelle: "beleg", beleg_id: belegId, version: b.version }, benutzer);
}

/** Im Hintergrund nach der Antwort ausführen; Fehler nur protokollieren (Ablage darf nie den Hauptablauf stören) */
export function imHintergrund(aufgabe: () => Promise<unknown>, was: string) {
  after(async () => {
    try {
      await aufgabe();
    } catch (e) {
      console.error(`OneDrive (${was}):`, fehlerText(e));
    }
  });
}

/**
 * Nachladen: wartende Ordner anlegen und zwischengespeicherte Dateien hochladen (Cron, „Jetzt nachladen“,
 * Seitenaufruf). Höchstens max Dateien je Lauf; nach 20 Versuchen bleibt eine Datei auf „fehler“.
 */
export async function nachladen(max = 25, benutzer: string | null = null) {
  const v = await verbindungLaden();
  if (!v) return { ordner: 0, dateien: 0, offen: await offeneAnzahl(), verbunden: false };
  const admin = createAdminClient();
  const { data: ordner } = await admin.from("ablage_ordner").select(ORDNER_FELDER).in("status", ["wartet", "fehler"]).is("deleted_at", null).limit(20).returns<OrdnerZeile[]>();
  let o = 0;
  for (const x of ordner ?? []) if ((await ordnerAnlegen(x, v, benutzer)).status === "angelegt") o++;
  const { data: dateien } = await admin.from("ablage_datei").select(DATEI_FELDER).in("status", ["wartet", "fehler"]).lt("versuche", 20).not("puffer_pfad", "is", null).is("deleted_at", null).order("created_at").limit(max).returns<DateiZeile[]>();
  let d = 0;
  for (const x of dateien ?? []) if (await dateiUebertragen(x, v, benutzer)) d++;
  return { ordner: o, dateien: d, offen: await offeneAnzahl(), verbunden: true };
}

/** Eine zwischengespeicherte Datei nach OneDrive übertragen; true bei Erfolg */
async function dateiUebertragen(x: DateiZeile, v: Verbindung, benutzer: string | null, inhalt?: Buffer): Promise<boolean> {
  const admin = createAdminClient();
  try {
    let daten = inhalt;
    if (!daten) {
      const { data: blob, error } = await admin.storage.from(PUFFER).download(x.puffer_pfad!);
      if (error || !blob) throw new Error(`Zwischenspeicher: ${error?.message ?? "Datei fehlt"}`);
      daten = Buffer.from(await blob.arrayBuffer());
    }
    const { data: oz } = await admin.from("ablage_ordner").select(ORDNER_FELDER).eq("id", x.ordner_id).single<OrdnerZeile>();
    const ordnerZeile = oz!.status === "angelegt" ? oz! : await ordnerAnlegen(oz!, v, benutzer);
    if (ordnerZeile.status !== "angelegt") throw new Error(ordnerZeile.fehler ?? "Ordner nicht angelegt");
    const eltern = x.unterordner ? await unterordnerId(ordnerZeile, x.unterordner, benutzer) : ordnerZeile.item_id!;
    const item = await hochladen(ordnerZeile.drive_id!, eltern, x.name, daten);
    await dateiSetzen(benutzer, x.id, { drive_id: ordnerZeile.drive_id, item_id: item.id, web_url: item.webUrl ?? null, status: "abgelegt", puffer_pfad: null, fehler: null, abgelegt_am: new Date().toISOString() });
    if (x.puffer_pfad) await admin.storage.from(PUFFER).remove([x.puffer_pfad]);
    return true;
  } catch (e) {
    await dateiSetzen(benutzer, x.id, { status: "fehler", versuche: x.versuche + 1, fehler: fehlerText(e) });
    return false;
  }
}

/**
 * Upload vom Browser (große Scans): Zeile mit Status „upload“ und eine signierte, einmalige Upload-Adresse in den
 * Zwischenspeicher. Erst uploadAbschliessen prüft die Datei und überträgt sie.
 */
export async function uploadVorbereiten(bezug: Bezug, name: string, groesse: number, unterordner: string | null, benutzer: string) {
  const ordner = await ordnerFuer(bezug, benutzer);
  const datei = sharepointName(name, 150);
  const pfad = `${crypto.randomUUID()}/${datei}`;
  const id = await dateiSetzen(benutzer, null, { ordner_id: ordner.id, unterordner, name: datei, quelle: "upload", groesse, status: "upload", puffer_pfad: pfad });
  const { data, error } = await createAdminClient().storage.from(PUFFER).createSignedUploadUrl(pfad);
  if (error || !data) throw new Error(`Upload konnte nicht vorbereitet werden: ${error?.message ?? ""}`);
  return { id, url: data.signedUrl };
}

/**
 * Upload abschließen: Größe und Typ am Dateianfang prüfen (sonst verwerfen), dann nach OneDrive übertragen bzw. als
 * „wartet“ im Zwischenspeicher lassen. erkennen liefert den MIME-Typ oder null.
 */
export async function uploadAbschliessen(id: string, benutzer: string, pruefen: (inhalt: Buffer, name: string) => string | null, grenze: number) {
  const admin = createAdminClient();
  const { data: x } = await admin.from("ablage_datei").select(DATEI_FELDER).eq("id", id).eq("status", "upload").is("deleted_at", null).maybeSingle<DateiZeile>();
  if (!x?.puffer_pfad) throw new Error("Upload nicht gefunden.");
  const { data: blob, error } = await admin.storage.from(PUFFER).download(x.puffer_pfad);
  const verwerfen = async (grund: string) => {
    await admin.storage.from(PUFFER).remove([x.puffer_pfad!]);
    await dateiSetzen(benutzer, id, { geloescht: true });
    throw new Error(grund);
  };
  if (error || !blob) return verwerfen("Die Datei ist nicht angekommen. Bitte erneut hochladen.");
  const inhalt = Buffer.from(await blob.arrayBuffer());
  if (inhalt.length > grenze) return verwerfen("Die Datei ist zu groß.");
  const mime = pruefen(inhalt, x.name);
  if (!mime) return verwerfen("Erlaubt sind PDF, JPEG, PNG, HEIC und Office-Dokumente (docx, xlsx).");
  await dateiSetzen(benutzer, id, { status: "wartet", mime, groesse: inhalt.length, fehler: null });
  const v = await verbindungLaden();
  if (!v) {
    await dateiSetzen(benutzer, id, { fehler: "OneDrive ist noch nicht verbunden." });
    return { abgelegt: false, name: x.name };
  }
  const ok = await dateiUebertragen({ ...x, status: "wartet", mime }, v, benutzer, inhalt);
  return { abgelegt: ok, name: x.name };
}

export async function offeneAnzahl() {
  const { count } = await createAdminClient().from("ablage_datei").select("id", { count: "exact", head: true }).in("status", ["wartet", "fehler"]).is("deleted_at", null);
  return count ?? 0;
}

let zuletztNachgeladen = 0;
/** Beim Öffnen einer Seite: höchstens alle 2 Minuten je Server-Instanz im Hintergrund nachladen */
export function nachladenImHintergrund() {
  if (Date.now() - zuletztNachgeladen < 120_000) return;
  zuletztNachgeladen = Date.now();
  imHintergrund(() => nachladen(10), "nachladen");
}
