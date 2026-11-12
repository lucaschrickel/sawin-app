"use server";

import { refresh } from "next/cache";
import { pruefeSitzung } from "@/lib/auth/sitzung";
import { istFarbschema, type Darstellung } from "@/lib/darstellung";

/** Darstellung des angemeldeten Benutzers speichern (nur die eigene, RLS) */
export async function darstellungSpeichern(d: Darstellung): Promise<{ ok?: boolean; fehler?: string }> {
  if (!istFarbschema(d?.farbschema) || typeof d.seitenleisteHell !== "boolean") return { fehler: "Ungültige Auswahl." };
  const { supabase, benutzer } = await pruefeSitzung();
  const werte = { farbschema: d.farbschema, seitenleiste_hell: d.seitenleisteHell };
  const { data } = await supabase.from("benutzer_einstellung").select("id").eq("benutzer_id", benutzer.id).maybeSingle();
  const { error } = data
    ? await supabase.from("benutzer_einstellung").update(werte).eq("id", data.id)
    : await supabase.from("benutzer_einstellung").insert({ benutzer_id: benutzer.id, ...werte });
  if (error) return { fehler: "Die Darstellung konnte nicht gespeichert werden." };
  refresh();
  return { ok: true };
}
