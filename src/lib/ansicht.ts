import "server-only";
import { pruefeSitzung } from "@/lib/auth/sitzung";

export type Ansicht = "liste" | "board";

/** Gemerkte Ansicht (Liste oder Board) des angemeldeten Benutzers für eine Seite. Standard: Liste. */
export async function ladeAnsicht(seite: string): Promise<Ansicht> {
  const { supabase, benutzer } = await pruefeSitzung();
  const { data } = await supabase.from("benutzer_einstellung").select("ansichten").eq("benutzer_id", benutzer.id).maybeSingle();
  return (data?.ansichten as Record<string, Ansicht> | undefined)?.[seite] === "board" ? "board" : "liste";
}
