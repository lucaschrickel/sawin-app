import "server-only";
import { pruefeSitzung } from "@/lib/auth/sitzung";
import type { AufgabeStatus, Bezug, Prioritaet } from "@/lib/aufgaben-status";

export type Aufgabe = {
  id: string;
  titel: string;
  status: AufgabeStatus;
  prioritaet: Prioritaet;
  faellig: string | null;
  notiz: string | null;
  erledigt_am: string | null;
  zustaendig: { id: string; name: string } | null;
  bezug: Bezug | null;
};

type Roh = Omit<Aufgabe, "bezug" | "zustaendig"> & {
  zustaendig: { id: string; name: string } | null;
  kunde: { id: string; name: string } | null;
  anfrage: { id: string; titel: string } | null;
  auftrag: { id: string; nummer: string; titel: string } | null;
};

const FELDER =
  "id, titel, status, prioritaet, faellig, notiz, erledigt_am, zustaendig:zustaendig_id(id, name), kunde:kunde_id(id, name), anfrage:anfrage_id(id, titel), auftrag:auftrag_id(id, nummer, titel)";

const zuAufgabe = (r: Roh): Aufgabe => ({
  id: r.id,
  titel: r.titel,
  status: r.status,
  prioritaet: r.prioritaet,
  faellig: r.faellig,
  notiz: r.notiz,
  erledigt_am: r.erledigt_am,
  zustaendig: r.zustaendig,
  bezug: r.kunde
    ? { art: "kunde", id: r.kunde.id, text: r.kunde.name }
    : r.anfrage
      ? { art: "anfrage", id: r.anfrage.id, text: r.anfrage.titel }
      : r.auftrag
        ? { art: "auftrag", id: r.auftrag.id, text: `${r.auftrag.nummer} · ${r.auftrag.titel}` }
        : null,
});

export type AufgabenFilter = { meine: boolean; zustand: "offen" | "erledigt" | "alle" };

/** Aufgaben für die Seite „Aufgaben“: Meine oder Alle, offen/erledigt/alle; Anzahl offen und erledigt. */
export async function ladeAufgaben(f: AufgabenFilter) {
  const { supabase, benutzer } = await pruefeSitzung();
  const basis = (felder: string, head = false) => {
    let a = supabase.from("aufgabe").select(felder, { count: "exact", head });
    if (f.meine) a = a.eq("zustaendig_id", benutzer.id);
    return a;
  };
  let liste = basis(FELDER);
  if (f.zustand === "offen") liste = liste.neq("status", "erledigt");
  if (f.zustand === "erledigt") liste = liste.eq("status", "erledigt");
  const [ergebnis, offen, erledigt] = await Promise.all([
    liste.order("faellig", { ascending: true, nullsFirst: false }).order("created_at").limit(500).returns<Roh[]>(),
    basis("id", true).neq("status", "erledigt"),
    basis("id", true).eq("status", "erledigt"),
  ]);
  if (ergebnis.error) throw new Error(`Aufgaben konnten nicht geladen werden: ${ergebnis.error.message}`);
  return { liste: (ergebnis.data ?? []).map(zuAufgabe), anzahl: { offen: offen.count ?? 0, erledigt: erledigt.count ?? 0 } };
}

/** Offene und zuletzt erledigte Aufgaben zu einem Kunden oder einer Anfrage (Detailseiten) */
export async function ladeAufgabenZu(bezug: { kunde_id?: string; anfrage_id?: string; auftrag_id?: string }) {
  const { supabase } = await pruefeSitzung();
  let a = supabase.from("aufgabe").select(FELDER);
  if (bezug.kunde_id) a = a.eq("kunde_id", bezug.kunde_id);
  if (bezug.anfrage_id) a = a.eq("anfrage_id", bezug.anfrage_id);
  if (bezug.auftrag_id) a = a.eq("auftrag_id", bezug.auftrag_id);
  const { data } = await a.order("status").order("faellig", { ascending: true, nullsFirst: false }).limit(100).returns<Roh[]>();
  return (data ?? []).map(zuAufgabe);
}
