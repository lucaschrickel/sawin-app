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

/** Merkt, ob die Seitenleiste eingeklappt ist (je Benutzer). Kein refresh: der Zustand lebt im Browser weiter. */
export async function seitenleisteSetzen(eingeklappt: boolean) {
  const { supabase, benutzer } = await pruefeSitzung();
  const { data } = await supabase.from("benutzer_einstellung").select("id").eq("benutzer_id", benutzer.id).maybeSingle();
  if (data) await supabase.from("benutzer_einstellung").update({ seitenleiste_eingeklappt: !!eingeklappt }).eq("id", data.id);
  else await supabase.from("benutzer_einstellung").insert({ benutzer_id: benutzer.id, seitenleiste_eingeklappt: !!eingeklappt });
}

/** Merkt die gewählte Dashboard-Ansicht (Geschäftsführung, Montage, Einkauf) je Benutzer. Gibt keine Rechte. */
export async function dashboardAnsichtSetzen(ansicht: "gf" | "montage" | "einkauf") {
  if (!["gf", "montage", "einkauf"].includes(ansicht)) return;
  const { supabase, benutzer } = await pruefeSitzung();
  const { data } = await supabase.from("benutzer_einstellung").select("id, ansichten").eq("benutzer_id", benutzer.id).maybeSingle();
  const ansichten = { ...((data?.ansichten as Record<string, string>) ?? {}), dashboard: ansicht };
  if (data) await supabase.from("benutzer_einstellung").update({ ansichten }).eq("id", data.id);
  else await supabase.from("benutzer_einstellung").insert({ benutzer_id: benutzer.id, ansichten });
  refresh();
}

/**
 * Merkt die gezogenen Spaltenbreiten einer Tabelle je Benutzer (null = zurücksetzen). Kein refresh: die Breiten leben im
 * Browser weiter. Nur bekannte Formen werden gespeichert (Schlüssel aus Kleinbuchstaben, Breiten 24–800 px).
 */
export async function spaltenbreitenSetzen(tabelle: string, breiten: Record<string, number> | null) {
  if (!/^[a-z_]{1,40}$/.test(tabelle)) return;
  const sauber = breiten
    ? Object.fromEntries(Object.entries(breiten).filter(([k, v]) => /^[a-z_]{1,24}$/.test(k) && Number.isFinite(v)).slice(0, 20).map(([k, v]) => [k, Math.round(Math.min(800, Math.max(24, v)))]))
    : null;
  const { supabase, benutzer } = await pruefeSitzung();
  const { data } = await supabase.from("benutzer_einstellung").select("id, spaltenbreiten").eq("benutzer_id", benutzer.id).maybeSingle();
  const alle = { ...((data?.spaltenbreiten as Record<string, unknown>) ?? {}) };
  if (sauber && Object.keys(sauber).length) alle[tabelle] = sauber;
  else delete alle[tabelle];
  if (data) await supabase.from("benutzer_einstellung").update({ spaltenbreiten: alle }).eq("id", data.id);
  else await supabase.from("benutzer_einstellung").insert({ benutzer_id: benutzer.id, spaltenbreiten: alle });
}
