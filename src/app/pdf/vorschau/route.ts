import { erzeugePdf } from "@/lib/beleg-ablage";
import { aufbereiten } from "@/lib/beleg-eingabe";
import type { EditorZustand } from "@/lib/beleg-typen";
import { pruefeSitzung } from "@/lib/auth/sitzung";
import type { PdfBeleg, PdfPosition } from "@/lib/pdf/beleg-pdf";

/**
 * Vorschau aus dem Editor (auch mit ungespeicherten Änderungen). Entwürfe tragen das Wasserzeichen „ENTWURF“.
 * Nichts wird gespeichert.
 */
export async function POST(request: Request) {
  const { supabase } = await pruefeSitzung();
  let z: EditorZustand;
  try {
    z = (await request.json()) as EditorZustand;
  } catch {
    return new Response("Ungültige Daten", { status: 400 });
  }
  if (!z?.kopf || !Array.isArray(z.positionen)) return new Response("Ungültige Daten", { status: 400 });
  // Für die Vorschau reicht ein Kunde nicht als Pflicht: ohne Kunde bleibt die Adresse leer
  const daten = aufbereiten({ ...z, kopf: { ...z.kopf, kunde_id: z.kopf.kunde_id || "00000000-0000-4000-8000-000000000000" } });
  if ("fehler" in daten) return new Response(daten.fehler, { status: 422 });
  const k = daten.kopf as Record<string, string>;
  let bezugNummer: string | null = null;
  if (k.auftrag_id) bezugNummer = (await supabase.from("auftrag").select("nummer").eq("id", k.auftrag_id).maybeSingle()).data?.nummer ?? null;
  const n = (v: string) => (v === "" || v == null ? null : Number(v));
  const b: PdfBeleg = {
    art: z.kopf.art,
    nummer: z.kopf.nummer,
    version: z.kopf.version,
    datum: k.datum,
    kundennummer: z.kopf.kunde_nummer || null,
    bezug_nummer: bezugNummer,
    adresse_name: k.adresse_name,
    adresse_zusatz: k.adresse_zusatz,
    adresse_strasse: k.adresse_strasse,
    adresse_plz: k.adresse_plz,
    adresse_ort: k.adresse_ort,
    adresse_land: k.adresse_land,
    titel: k.titel,
    bauvorhaben: k.bauvorhaben,
    objekt: k.objekt,
    einleitung: k.einleitung,
    lieferbedingungen: k.lieferbedingungen,
    nachbemerkung: k.nachbemerkung,
    zahlungsbedingung_text: k.zahlungsbedingung_text,
    zahlungsziel_tage: n(k.zahlungsziel_tage),
    skontoziel_tage: n(k.skontoziel_tage),
    skonto_prozent: n(k.skonto_prozent),
    steuerart: z.kopf.steuerart,
    preise_brutto: !!daten.kopf.preise_brutto,
    gesamtrabatt_prozent: Number(k.gesamtrabatt_prozent) || 0,
    gueltig_bis: k.gueltig_bis || null,
    liefertermin: k.liefertermin || null,
    leistung_von: k.leistung_von || null,
    leistung_bis: k.leistung_bis || null,
  };
  const pdf = await erzeugePdf({ b, positionen: daten.positionen as unknown as PdfPosition[] }, z.kopf.status === "entwurf");
  return new Response(new Uint8Array(pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": 'inline; filename="Vorschau.pdf"', "Cache-Control": "private, no-store" },
  });
}
