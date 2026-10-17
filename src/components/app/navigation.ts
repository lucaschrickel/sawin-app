import {
  CalendarDays,
  CheckSquare,
  FileCheck2,
  FileText,
  Inbox,
  LayoutDashboard,
  Palette,
  Receipt,
  Settings2,
  Truck,
  Undo2,
  Users,
  Briefcase,
  type LucideIcon,
} from "lucide-react";

export type NavItem = { key: string; href: string; label: string; icon: LucideIcon };
export type NavGroup = { label: string; items: NavItem[] };

/**
 * Navigation für Version 1. Monteur-App, Zeiterfassung, Abwesenheiten und
 * Plantafel kommen in späteren Ausbaustufen dazu.
 */
export const NAVIGATION: NavGroup[] = [
  { label: "Übersicht", items: [{ key: "dashboard", href: "/", label: "Dashboard", icon: LayoutDashboard }] },
  {
    label: "Vertrieb",
    items: [
      { key: "anfragen", href: "/anfragen", label: "Anfragen", icon: Inbox },
      { key: "kunden", href: "/kunden", label: "Kunden", icon: Users },
    ],
  },
  {
    label: "Aufträge",
    items: [
      { key: "auftraege", href: "/auftraege", label: "Aufträge", icon: Briefcase },
      { key: "montageplan", href: "/montageplan", label: "Montageplan", icon: CalendarDays },
      { key: "aufgaben", href: "/aufgaben", label: "Aufgaben", icon: CheckSquare },
    ],
  },
  {
    label: "Belege",
    items: [
      { key: "angebote", href: "/belege/angebote", label: "Angebote", icon: FileText },
      { key: "auftragsbestaetigungen", href: "/belege/auftragsbestaetigungen", label: "Auftragsbestätigungen", icon: FileCheck2 },
      { key: "lieferscheine", href: "/belege/lieferscheine", label: "Lieferscheine", icon: Truck },
      { key: "rechnungen", href: "/belege/rechnungen", label: "Rechnungen", icon: Receipt },
      { key: "korrekturen", href: "/belege/korrekturen", label: "Gutschriften", icon: Undo2 },
    ],
  },
  {
    label: "System",
    items: [
      { key: "einstellungen", href: "/einstellungen", label: "Einstellungen", icon: Settings2 },
      { key: "styleguide", href: "/styleguide", label: "Designsystem", icon: Palette },
    ],
  },
];
