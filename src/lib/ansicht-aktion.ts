"use server";

import { refresh } from "next/cache";
import { pruefeSitzung } from "@/lib/auth/sitzung";

/** Merkt die Ansicht (Liste oder Board) je Benutzer und Seite in benutzer_einstellung.ansichten. */
export async function ansichtSetzen(seite: string, ansicht: "liste" | "board") {
  if (!/^[a-z_]{1,40}$/.test(seite) || (ansicht !== "liste" && ansicht !== "board")) return;
  const { supabase, benutzer } = await pruefeSitzung();
  const { data } = await supabase.from("benutzer_einstellung").select("id, ansichten").eq("benutzer_id", benutzer.id).maybeSingle();
  const ansichten = { ...((data?.ansichten as Record<string, string>) ?? {}), [seite]: ansicht };
  if (data) await supabase.from("benutzer_einstellung").update({ ansichten }).eq("id", data.id);
  else await supabase.from("benutzer_einstellung").insert({ benutzer_id: benutzer.id, ansichten });
  refresh();
}
