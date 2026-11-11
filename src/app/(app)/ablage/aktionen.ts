"use server";

import { refresh } from "next/cache";
import { pruefeAdmin, pruefeSitzung } from "@/lib/auth/sitzung";
import { nachladen, ordnerFuer, uploadAbschliessen, uploadVorbereiten, verbindungPruefen, type Bezug } from "@/lib/onedrive/ablage";
import { graphEingerichtet } from "@/lib/onedrive/graph";
import { dateiTypErkennen, sharepointName, UNTERORDNER, UPLOAD_GRENZE } from "@/lib/onedrive/schema";

export type Ergebnis = { ok?: boolean; fehler?: string; hinweis?: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Bezug aus dem Formular; der Benutzer muss den Vorgang sehen dürfen (RLS) */
async function bezugPruefen(fd: FormData): Promise<Bezug | null> {
  const { supabase } = await pruefeSitzung();
  for (const [feld, tabelle] of [["auftrag_id", "auftrag"], ["anfrage_id", "anfrage"], ["ticket_id", "service_ticket"]] as const) {
    const id = String(fd.get(feld) ?? "");
    if (!UUID.test(id)) continue;
    const { data } = await supabase.from(tabelle).select("id").eq("id", id).maybeSingle();
    return data ? { [feld]: id } : null;
  }
  return null;
}

/** Typ am Dateianfang; Office-Dateien sind ZIP und nur mit passender Endung erlaubt */
function erlaubterTyp(inhalt: Buffer, name: string): string | null {
  const typ = dateiTypErkennen(inhalt.subarray(0, 16));
  if (typ !== "application/zip") return typ;
  const endung = name.toLowerCase().split(".").pop() ?? "";
  return ["docx", "xlsx", "pptx"].includes(endung) ? `application/vnd.openxmlformats-officedocument.${endung}` : null;
}

/**
 * Upload Schritt 1: Prüfen und eine einmalige Upload-Adresse in den privaten Zwischenspeicher holen. Der Browser lädt
 * die Datei direkt dorthin (Vercel nimmt in Serverfunktionen nur kleine Anfragen an).
 */
export async function uploadVorbereitenAktion(fd: FormData): Promise<Ergebnis & { id?: string; url?: string }> {
  const { benutzer } = await pruefeSitzung();
  const bezug = await bezugPruefen(fd);
  if (!bezug) return { fehler: "Vorgang nicht gefunden." };
  const name = String(fd.get("name") ?? "").trim();
  const groesse = Number(fd.get("groesse"));
  const unterordner = String(fd.get("unterordner") ?? "");
  if (!name) return { fehler: "Bitte eine Datei wählen." };
  if (!Number.isFinite(groesse) || groesse <= 0) return { fehler: "Die Datei ist leer." };
  if (groesse > UPLOAD_GRENZE) return { fehler: "Die Datei ist größer als 50 MB." };
  if (unterordner && !(UNTERORDNER as readonly string[]).includes(unterordner)) return { fehler: "Bitte einen Unterordner aus der Liste wählen." };
  try {
    const r = await uploadVorbereiten(bezug, sharepointName(name, 150), groesse, unterordner || null, benutzer.id);
    return { ok: true, ...r };
  } catch (e) {
    return { fehler: e instanceof Error ? e.message : "Der Upload konnte nicht vorbereitet werden." };
  }
}

/** Upload Schritt 2: Datei prüfen (Typ, Größe) und nach OneDrive übertragen bzw. zwischengespeichert lassen */
export async function uploadAbschliessenAktion(id: string): Promise<Ergebnis> {
  const { benutzer } = await pruefeSitzung();
  if (!UUID.test(id)) return { fehler: "Upload nicht gefunden." };
  try {
    const r = await uploadAbschliessen(id, benutzer.id, erlaubterTyp, UPLOAD_GRENZE);
    refresh();
    return r.abgelegt ? { ok: true, hinweis: `${r.name} liegt im OneDrive-Ordner.` } : { ok: true, hinweis: `${r.name} ist zwischengespeichert und wird nach OneDrive übertragen, sobald die Verbindung steht.` };
  } catch (e) {
    refresh();
    return { fehler: e instanceof Error ? e.message : "Die Datei konnte nicht abgelegt werden." };
  }
}

/** Ordner jetzt anlegen (z. B. für Aufträge aus der Zeit vor der Ablage) */
export async function ordnerAnlegen(fd: FormData): Promise<Ergebnis> {
  const { benutzer } = await pruefeSitzung();
  const bezug = await bezugPruefen(fd);
  if (!bezug) return { fehler: "Vorgang nicht gefunden." };
  try {
    const o = await ordnerFuer(bezug, benutzer.id);
    refresh();
    return o.status === "angelegt" ? { ok: true } : { fehler: o.fehler ?? "OneDrive ist noch nicht verbunden. Der Ordner wird angelegt, sobald die Verbindung steht." };
  } catch (e) {
    return { fehler: e instanceof Error ? e.message : "Der Ordner konnte nicht angelegt werden." };
  }
}

/** Zwischengespeicherte Dateien jetzt nach OneDrive übertragen */
export async function jetztNachladen(): Promise<Ergebnis> {
  const { benutzer } = await pruefeSitzung();
  try {
    const r = await nachladen(50, benutzer.id);
    refresh();
    if (!r.verbunden) return { fehler: "OneDrive ist noch nicht verbunden." };
    return { ok: true, hinweis: `${r.dateien === 1 ? "1 Datei" : `${r.dateien} Dateien`} übertragen${r.offen ? `, ${r.offen} noch offen` : ""}.` };
  } catch (e) {
    return { fehler: e instanceof Error ? e.message : "Nachladen fehlgeschlagen." };
  }
}

/** Einstellungen › Verbindungen: Bibliothek und Basisordner prüfen und speichern (nur Admin) */
export async function verbindungSpeichern(_: Ergebnis, fd: FormData): Promise<Ergebnis> {
  const { supabase } = await pruefeAdmin();
  if (!graphEingerichtet()) return { fehler: "Zuerst die Zugangsdaten (MS_GRAPH_…, MS_TOKEN_SCHLUESSEL) auf dem Server eintragen." };
  const site = String(fd.get("site_id") ?? "").trim();
  const liste = String(fd.get("liste_id") ?? "").trim();
  const pfad = String(fd.get("basis_pfad") ?? "").trim();
  if (!site || !liste) return { fehler: "Bitte Website-ID und Bibliotheks-ID angeben." };
  if (site.length > 300 || liste.length > 100) return { fehler: "Die IDs sind zu lang." };
  try {
    const v = await verbindungPruefen(site, liste, pfad);
    const { error } = await supabase
      .from("einstellung")
      .update({
        onedrive_site_id: site,
        onedrive_liste_id: liste,
        onedrive_drive_id: v.drive_id,
        onedrive_basis_pfad: v.basis_pfad,
        onedrive_basis_id: v.basis_id,
        onedrive_basis_url: v.basis_url,
        onedrive_geprueft_am: new Date().toISOString(),
      })
      .eq("einzig", true);
    if (error) return { fehler: "Die Verbindung konnte nicht gespeichert werden." };
    refresh();
    return { ok: true, hinweis: `Verbunden: Bibliothek „${v.drive_name}“, Basisordner „${v.basis_pfad}“.` };
  } catch (e) {
    return { fehler: e instanceof Error ? e.message : "Die Verbindung konnte nicht geprüft werden." };
  }
}
