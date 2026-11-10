"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { pruefeSitzung } from "@/lib/auth/sitzung";
import { ohneBestellte } from "@/lib/einkauf-status";

export type Ergebnis = { fehler?: string; ok?: boolean; hinweis?: string; felder?: Record<string, string> };

const text = (fd: FormData, n: string) => String(fd.get(n) ?? "").trim();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATUM = /^\d{4}-\d{2}-\d{2}$/;

/** Bestellung anlegen oder ändern; beim Anlegen werden bestellte Positionen aus „Noch nicht bestellt“ entfernt */
export async function bestellungSpeichern(_: Ergebnis, fd: FormData): Promise<Ergebnis> {
  const { supabase } = await pruefeSitzung();
  const id = text(fd, "id");
  const kw = text(fd, "liefer_kw");
  const jahr = text(fd, "liefer_jahr");
  const kopf = {
    lieferant_id: text(fd, "lieferant_id"),
    bestelldatum: text(fd, "bestelldatum"),
    lieferanten_ab_nummer: text(fd, "lieferanten_ab_nummer"),
    liefer_kw: kw ? Number(kw) : null,
    liefer_jahr: kw ? Number(jahr || new Date().getFullYear()) : null,
    status: text(fd, "status") === "bestaetigt" ? "bestaetigt" : "bestellt",
    notiz: text(fd, "notiz"),
  };
  const spalte = (n: string) => fd.getAll(n).map((v) => String(v).trim());
  const ids = spalte("z_id");
  const auftraege = spalte("z_auftrag");
  const mengen = spalte("z_menge");
  const zeilen = spalte("z_text")
    .map((artikeltext, i) => ({ id: ids[i] || null, auftrag_id: auftraege[i], artikeltext, menge: Number((mengen[i] || "1").replace(",", ".")) }))
    .filter((z) => z.artikeltext || z.auftrag_id);
  const felder: Record<string, string> = {};
  if (!UUID.test(kopf.lieferant_id)) felder.lieferant_id = "Bitte einen Lieferanten wählen.";
  if (kopf.bestelldatum && !DATUM.test(kopf.bestelldatum)) felder.bestelldatum = "Ungültiges Datum.";
  if (kopf.liefer_kw !== null && !(Number.isInteger(kopf.liefer_kw) && kopf.liefer_kw >= 1 && kopf.liefer_kw <= 53)) felder.liefer_kw = "KW 1 bis 53.";
  if (kopf.liefer_jahr !== null && !(Number.isInteger(kopf.liefer_jahr) && kopf.liefer_jahr >= 2000 && kopf.liefer_jahr <= 2100)) felder.liefer_jahr = "Ungültiges Jahr.";
  if (!zeilen.length) felder.zeilen = "Bitte mindestens eine Position mit Auftrag und Artikel eingeben.";
  else if (zeilen.some((z) => !UUID.test(z.auftrag_id) || !z.artikeltext)) felder.zeilen = "Jede Position braucht einen Auftrag und einen Artikel.";
  else if (zeilen.some((z) => !(z.menge > 0))) felder.zeilen = "Die Menge muss größer als 0 sein.";
  if ((id && !UUID.test(id)) || zeilen.some((z) => z.id && !UUID.test(z.id))) return { fehler: "Bestellung nicht gefunden." };
  if (Object.keys(felder).length) return { fehler: Object.values(felder)[0], felder };

  const { data, error } = await supabase.rpc("bestellung_speichern", { p_id: id || null, p_kopf: { ...kopf, bestelldatum: kopf.bestelldatum || null }, p_zeilen: zeilen });
  if (error || !data) return { fehler: error?.code === "23514" ? error.message : "Die Bestellung konnte nicht gespeichert werden." };

  if (!id) {
    // „Noch nicht bestellt“ der Aufträge um die jetzt bestellten Positionen kürzen (CLAUDE.md „Einkauf“)
    for (const auftragId of [...new Set(zeilen.map((z) => z.auftrag_id))]) {
      const { data: a } = await supabase.from("auftrag").select("noch_nicht_bestellt").eq("id", auftragId).maybeSingle();
      if (!a?.noch_nicht_bestellt) continue;
      const rest = ohneBestellte(a.noch_nicht_bestellt, zeilen.filter((z) => z.auftrag_id === auftragId).map((z) => z.artikeltext));
      if (rest !== a.noch_nicht_bestellt.trim()) await supabase.from("auftrag").update({ noch_nicht_bestellt: rest || null }).eq("id", auftragId);
    }
    redirect(`/bestellungen/${data}`);
  }
  refresh();
  return { ok: true };
}

/** Zeile geliefert bzw. nicht geliefert */
export async function zeileGeliefert(id: string, geliefert: boolean): Promise<Ergebnis> {
  if (!UUID.test(id)) return { fehler: "Zeile nicht gefunden." };
  const { supabase } = await pruefeSitzung();
  const { error } = await supabase.from("bestellzeile").update({ geliefert }).eq("id", id);
  if (error) return { fehler: "Die Lieferung konnte nicht gespeichert werden." };
  refresh();
  return { ok: true };
}

/** Alle Zeilen einer Bestellung geliefert */
export async function allesGeliefert(bestellungId: string): Promise<Ergebnis> {
  if (!UUID.test(bestellungId)) return { fehler: "Bestellung nicht gefunden." };
  const { supabase } = await pruefeSitzung();
  const { error } = await supabase.from("bestellzeile").update({ geliefert: true }).eq("bestellung_id", bestellungId).eq("geliefert", false);
  if (error) return { fehler: "Die Lieferung konnte nicht gespeichert werden." };
  refresh();
  return { ok: true, hinweis: "Alle Positionen als geliefert markiert." };
}

export async function bestellungLoeschen(id: string): Promise<Ergebnis> {
  const { supabase } = await pruefeSitzung();
  const { error } = await supabase.rpc("bestellung_loeschen", { p_id: id });
  if (error) return { fehler: error.code === "23503" ? error.message : "Die Bestellung konnte nicht gelöscht werden." };
  redirect("/bestellungen");
}
