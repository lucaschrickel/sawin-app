import type { ComponentType } from "react";

/**
 * Namen der Basis-Bausteine, die ein Kunde durch eine eigene Komponente
 * ersetzen darf. Neue ersetzbare Bausteine hier ergänzen und im Basiscode
 * über `resolveSlot` einbinden. Basiscode wird dafür nie geändert.
 */
export type SlotName = "PipelineCard" | "DashboardHeader" | "SidebarFooter";

export type LogoComponent = ComponentType<{ gap?: string; className?: string }>;

export type CustomerConfig = {
  /** muss dem Ordnernamen und dem data-customer-Attribut entsprechen */
  id: string;
  name: string;
  brandWordmark: string;
  brandTagline?: string;
  Logo: LogoComponent;
  locale: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  overrides: Partial<Record<SlotName, ComponentType<any>>>;
};
