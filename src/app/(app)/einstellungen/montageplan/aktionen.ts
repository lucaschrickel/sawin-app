"use server";

import { refresh } from "next/cache";
import { pruefeSitzung } from "@/lib/auth/sitzung";

export type Ergebnis = { fehler?: string; ok?: boolean; hinweis?: string };

/** Arbeitszeit in vollen Stunden; zugleich Stundenraster der Plantafel und Vorbelegung beim Einplanen */
export async function arbeitszeitSpeichern(_: Ergebnis, fd: FormData): Promise<Ergebnis> {
  const { supabase } = await pruefeSitzung();
  const von = Number(fd.get("von"));
  const bis = Number(fd.get("bis"));
  if (!Number.isInteger(von) || !Number.isInteger(bis) || von < 0 || bis > 23 || bis <= von) {
    return { fehler: "Bitte volle Stunden wählen; das Ende muss nach dem Beginn liegen." };
  }
  const z = (h: number) => `${String(h).padStart(2, "0")}:00`;
  const { error } = await supabase.from("einstellung").update({ arbeitszeit_von: z(von), arbeitszeit_bis: z(bis) }).eq("einzig", true);
  if (error) return { fehler: "Die Arbeitszeit konnte nicht gespeichert werden." };
  refresh();
  return { ok: true, hinweis: "Gespeichert." };
}
