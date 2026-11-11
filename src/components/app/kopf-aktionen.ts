"use server";

import { ladeGlocke, type Hinweis } from "@/lib/dashboard";
import type { Treffer } from "@/lib/such-typen";
import { suchen } from "@/lib/suche";

/** Glocke: Hinweise wie „Braucht Aufmerksamkeit“ im Dashboard (Rechte über die Sitzung und RLS) */
export async function glockeLaden(): Promise<Hinweis[]> {
  return ladeGlocke();
}

/** Vorschläge der globalen Suche: höchstens drei je Bereich */
export async function sucheVorschlaege(q: string): Promise<Treffer[]> {
  return suchen(typeof q === "string" ? q : "", 3);
}
