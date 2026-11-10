import type { Belegart } from "@/lib/belege-status";

/** Menüpunkt der Seitenleiste je Belegart */
export const AKTIV: Record<Belegart, string> = {
  angebot: "angebote",
  auftragsbestaetigung: "auftraege",
  teil_ab: "auftraege",
  lieferschein: "lieferscheine",
  abschlagsrechnung: "abschlaege",
  rechnung: "rechnungen",
  zahlungsbestaetigung: "rechnungen",
  gutschrift: "gutschriften",
};

/** Liste der Belegart (fachlicher Pfad, wenn es keinen Verlauf gibt) */
export const LISTE: Record<Belegart, { href: string; text: string }> = {
  angebot: { href: "/belege/angebote", text: "Angebote" },
  auftragsbestaetigung: { href: "/auftraege", text: "Aufträge" },
  teil_ab: { href: "/auftraege", text: "Aufträge" },
  lieferschein: { href: "/belege/lieferscheine", text: "Lieferscheine" },
  abschlagsrechnung: { href: "/belege/abschlaege", text: "Abschlagsrechnungen" },
  rechnung: { href: "/belege/rechnungen", text: "Rechnungen" },
  zahlungsbestaetigung: { href: "/belege/rechnungen", text: "Rechnungen" },
  gutschrift: { href: "/belege/gutschriften", text: "Gutschriften" },
};
