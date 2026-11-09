import {
  BookUser,
  CalendarDays,
  CalendarRange,
  CheckSquare,
  Clock,
  ClipboardList,
  Factory,
  FileCheck2,
  FileText,
  Files,
  Inbox,
  LayoutDashboard,
  Palette,
  Receipt,
  ReceiptText,
  Settings2,
  ShoppingCart,
  Truck,
  Undo2,
  UserX,
  Users,
  Van,
  Wrench,
  type LucideIcon,
} from "lucide-react";

export type NavItem = { key: string; href: string; label: string; icon: LucideIcon; bereit?: boolean };
export type NavGroup = { label: string; items: NavItem[] };

/**
 * Navigation für Version 1, Gruppen und Reihenfolge wie in CLAUDE.md („Rahmen und Navigation“).
 * Sichtbar sind nur Module mit `bereit: true`; weitere werden beim Bau ihres Moduls freigeschaltet.
 */
const ALLE: NavGroup[] = [
  {
    label: "Übersicht",
    items: [
      { key: "dashboard", href: "/", label: "Dashboard", icon: LayoutDashboard },
      { key: "aufgaben", href: "/aufgaben", label: "Aufgaben", icon: CheckSquare, bereit: true },
    ],
  },
  {
    label: "Kunden & Anfragen",
    items: [
      { key: "kunden", href: "/kunden", label: "Kunden", icon: Users, bereit: true },
      { key: "anfragen", href: "/anfragen", label: "Anfragen", icon: Inbox, bereit: true },
    ],
  },
  {
    label: "Belege",
    items: [
      { key: "belege", href: "/belege", label: "Alle Belege", icon: Files },
      { key: "angebote", href: "/belege/angebote", label: "Angebote", icon: FileText },
      { key: "auftraege", href: "/auftraege", label: "Aufträge", icon: FileCheck2, bereit: true },
      { key: "lieferscheine", href: "/belege/lieferscheine", label: "Lieferscheine", icon: Truck },
      { key: "abschlaege", href: "/belege/abschlaege", label: "Abschlagsrechnungen", icon: ReceiptText },
      { key: "rechnungen", href: "/belege/rechnungen", label: "Rechnungen", icon: Receipt },
      { key: "gutschriften", href: "/belege/gutschriften", label: "Gutschriften", icon: Undo2 },
    ],
  },
  {
    label: "Montage & Service",
    items: [
      { key: "montageplan", href: "/montageplan", label: "Montageplan", icon: CalendarRange, bereit: true },
      { key: "service", href: "/service", label: "Service-Tickets", icon: Wrench },
      { key: "serviceplan", href: "/serviceplan", label: "Service-Plan", icon: ClipboardList },
    ],
  },
  {
    label: "Einkauf",
    items: [
      { key: "lieferanten", href: "/lieferanten", label: "Lieferanten", icon: Factory },
      { key: "bestellungen", href: "/bestellungen", label: "Bestellungen", icon: ShoppingCart },
    ],
  },
  {
    label: "Team und Ressourcen",
    items: [
      { key: "kalender", href: "/kalender", label: "Kalender", icon: CalendarDays },
      { key: "mitarbeiter", href: "/mitarbeiter", label: "Mitarbeiter", icon: BookUser },
      { key: "fahrzeuge", href: "/fahrzeuge", label: "Fahrzeuge", icon: Van },
      { key: "zeiten", href: "/zeiten", label: "Zeiterfassung", icon: Clock },
      { key: "abwesenheiten", href: "/abwesenheiten", label: "Abwesenheiten", icon: UserX },
    ],
  },
  {
    label: "System",
    items: [
      { key: "einstellungen", href: "/einstellungen", label: "Einstellungen", icon: Settings2, bereit: true },
      { key: "styleguide", href: "/styleguide", label: "Designsystem", icon: Palette, bereit: true },
    ],
  },
];

export const NAVIGATION: NavGroup[] = ALLE.map((g) => ({ ...g, items: g.items.filter((i) => i.bereit) })).filter(
  (g) => g.items.length > 0,
);

