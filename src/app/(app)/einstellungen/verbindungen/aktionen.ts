"use server";

import { refresh } from "next/cache";
import { pruefeAdmin } from "@/lib/auth/sitzung";
import { BELEGARTEN } from "@/lib/belege-status";
import { adressenLesen } from "@/lib/versand";

export type Ergebnis = { ok?: boolean; fehler?: string; felder?: Record<string, string> };

/** Interne Kopie (BCC) je Belegart für den Versand (nur Admin) */
export async function bccSpeichern(_: Ergebnis, fd: FormData): Promise<Ergebnis> {
  const { supabase } = await pruefeAdmin();
  const felder: Record<string, string> = {};
  const werte: [string, string | null][] = [];
  for (const art of BELEGARTEN) {
    const roh = String(fd.get(`bcc_${art}`) ?? "").trim();
    const liste = adressenLesen(roh);
    if (liste === null || liste.length > 1) felder[`bcc_${art}`] = "Bitte genau eine gültige Adresse oder leer.";
    else werte.push([art, liste[0] ?? null]);
  }
  if (Object.keys(felder).length) return { fehler: "Bitte die markierten Felder prüfen.", felder };
  const { data: vorhanden } = await supabase.from("belegart_einstellung").select("id, belegart");
  for (const [art, bcc] of werte) {
    const zeile = (vorhanden ?? []).find((x) => x.belegart === art);
    const { error } = zeile
      ? await supabase.from("belegart_einstellung").update({ bcc_email: bcc }).eq("id", zeile.id)
      : bcc
        ? await supabase.from("belegart_einstellung").insert({ belegart: art, bcc_email: bcc })
        : { error: null };
    if (error) return { fehler: "Die interne Kopie konnte nicht gespeichert werden." };
  }
  refresh();
  return { ok: true };
}
