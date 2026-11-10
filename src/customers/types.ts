import type { ComponentType } from "react";

/**
 * Namen der Basis-Bausteine, die ein Kunde durch eine eigene Komponente
 * ersetzen darf. Neue ersetzbare Bausteine hier ergänzen und im Basiscode
 * über `resolveSlot` einbinden. Basiscode wird dafür nie geändert.
 */
export type SlotName = "PipelineCard" | "DashboardHeader" | "SidebarFooter";

/** Logo des Betriebs: „voll“ mit Wortmarke (Seitenleiste, Anmeldung, Belegköpfe), „symbol“ ohne (eingeklappte Seitenleiste). Strichfarbe über das Token --logo-ink. */
export type LogoComponent = ComponentType<{ variante?: "voll" | "symbol"; className?: string }>;

/** Pfade des Logos als Daten: gemeinsame Quelle für die App (SVG) und PDFs. Strichfarbe „ink“ = Token --logo-ink bzw. Anthrazit im PDF. */
export type LogoPfade = {
  viewBoxVoll: string;
  viewBoxSymbol: string;
  flaechen: { d: string; fill: string }[];
  striche: { d: string; breite: number }[];
  wortmarke: { d: string; fill: string }[];
};

export type CustomerConfig = {
  /** muss dem Ordnernamen und dem data-customer-Attribut entsprechen */
  id: string;
  name: string;
  Logo: LogoComponent;
  /** Logo als Pfade für PDFs (Belege, Formulare, Wochenplan) */
  logoPfade: LogoPfade;
  locale: string;
  /** Auswahl „Herkunft“ bei Kunden und Anfragen (Daten der Instanz, kein Sonder-Code) */
  herkunft: string[];
  /** Herkunftsarten, die im Dashboard als „online“ zählen (Anteil Anfragen online) */
  herkunftOnline: string[];
  /** Produktgruppen (Anfragen, Aufträge, Lieferanten) */
  produkte: string[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  overrides: Partial<Record<SlotName, ComponentType<any>>>;
};
