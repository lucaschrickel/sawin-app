import "server-only";
import { pruefeSitzung } from "@/lib/auth/sitzung";
import { ANFRAGE_STATUS_TEXT, type AnfrageStatus } from "@/lib/anfragen-status";
import { BELEGART_TEXT, type Belegart } from "@/lib/belege-status";
import { AUFTRAG_PHASE_TEXT, type AuftragPhase } from "@/lib/status";
import { TICKET_STATUS_TEXT, type TicketStatus } from "@/lib/ticket-status";
import { AUFGABE_STATUS_TEXT, PRIORITAET_TEXT, type AufgabeStatus, type Prioritaet } from "@/lib/aufgaben-status";
import { BESTELL_STATUS_TEXT, type BestellStatus } from "@/lib/einkauf-status";
import type { SuchBereich, Treffer } from "@/lib/such-typen";

/*
  Globale Suche (CLAUDE.md „Suche“): Datenbankfunktion public.suche mit den Rechten des Benutzers (RLS), hier nur
  aufbereitet: Bereich, Link, lesbarer Status, Fundstelle.
*/

type Roh = { bereich: SuchBereich; id: string; nummer: string | null; titel: string | null; details: string | null; art: string | null; betrag: number | null; status: string | null; fundstelle: string; fundtext: string | null };

const HREF: Record<SuchBereich, (r: Roh) => string> = {
  kunde: (r) => `/kunden/${r.id}`,
  anfrage: (r) => `/anfragen/${r.id}`,
  auftrag: (r) => `/auftraege/${r.id}`,
  beleg: (r) => `/beleg/${r.id}`,
  ticket: (r) => `/service/${r.id}`,
  lieferant: (r) => `/lieferanten/${r.id}`,
  bestellung: (r) => `/bestellungen/${r.id}`,
  // Aufgaben und Termine haben keine eigene Seite: Liste bzw. Tagesansicht mit geöffnetem Dialog
  aufgabe: (r) => `/aufgaben?wer=alle&zustand=alle&aufgabe=${r.id}`,
  termin: (r) => `/kalender?ansicht=tag&datum=${r.nummer ?? ""}&termin=${r.id}`,
};
const BELEG_STATUS: Record<string, string> = {
  entwurf: "Entwurf",
  offen: "Offen",
  angenommen: "Angenommen",
  abgelehnt: "Abgelehnt",
  nicht_beauftragt: "Nicht beauftragt",
  fertiggestellt: "Fertiggestellt",
  bezahlt: "Bezahlt",
};

function statusText(r: Roh): string | null {
  if (!r.status) return null;
  if (r.bereich === "anfrage") return r.status === "gewonnen" ? "Gewonnen" : r.status === "verloren" ? "Verloren" : (ANFRAGE_STATUS_TEXT[r.status as AnfrageStatus] ?? r.status);
  if (r.bereich === "auftrag") return AUFTRAG_PHASE_TEXT[r.status as AuftragPhase] ?? r.status;
  if (r.bereich === "ticket") return TICKET_STATUS_TEXT[r.status as TicketStatus] ?? r.status;
  if (r.bereich === "beleg") return BELEG_STATUS[r.status] ?? r.status;
  if (r.bereich === "aufgabe") return AUFGABE_STATUS_TEXT[r.status as AufgabeStatus] ?? r.status;
  if (r.bereich === "bestellung") return BESTELL_STATUS_TEXT[r.status as BestellStatus] ?? r.status;
  return null;
}

/** Suche ab zwei Zeichen; jeBereich = 3 für die Vorschläge, mehr für die Ergebnisseite */
export async function suchen(q: string, jeBereich = 3): Promise<Treffer[]> {
  const begriff = q.trim().slice(0, 100);
  if (begriff.length < 2) return [];
  const { supabase } = await pruefeSitzung();
  const { data, error } = await supabase.rpc("suche", { p_q: begriff, p_je_bereich: jeBereich });
  if (error) throw new Error(`Suche fehlgeschlagen: ${error.message}`);
  return ((data as Roh[] | null) ?? []).map((r) => {
    const beleg = r.bereich === "beleg" && r.art ? BELEGART_TEXT[r.art as Belegart] : null;
    const art =
      beleg ??
      (r.bereich === "termin" ? (r.art === "intern" ? "Intern" : "Beratung") : r.bereich === "aufgabe" && r.art && r.art !== "normal" ? `Priorität ${PRIORITAET_TEXT[r.art as Prioritaet] ?? r.art}` : null);
    return {
      bereich: r.bereich,
      id: r.id,
      // bei Terminen steht in nummer das Datum (nur für den Link)
      nummer: r.bereich === "termin" ? null : r.nummer,
      titel: (r.bereich === "beleg" && r.titel === r.art ? beleg : r.titel) ?? "",
      details: [art, r.details].filter(Boolean).join(" · "),
      betrag: r.betrag == null ? null : Number(r.betrag),
      status: statusText(r),
      fundstelle: r.fundstelle,
      fundtext: r.fundtext,
      href: HREF[r.bereich](r),
    };
  });
}
