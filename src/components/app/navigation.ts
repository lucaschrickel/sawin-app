import {
  Briefcase,
  Calendar,
  CheckSquare,
  Clock,
  Download,
  FileText,
  Grid3x3,
  Inbox,
  LayoutDashboard,
  Receipt,
  Settings2,
  ShoppingCart,
  Store,
  Sun,
  Truck,
  Undo2,
  User,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";

/** Schlüssel der Zähler an den Menüpunkten (berechnet in der Server-Hülle) */
export type ZaehlerSchluessel = "aufgaben" | "anfragen" | "auftraege" | "service" | "fahrzeuge" | "abwesenheiten" | "bestellungen" | "belege" | "angebote";
export type Zaehler = Partial<Record<ZaehlerSchluessel, { n: number; dringend?: boolean }>>;

export type NavItem = { key: string; href: string; label: string; icon: LucideIcon; bereit?: boolean; zaehler?: ZaehlerSchluessel };
export type NavGroup = { label: string; items: NavItem[] };

/**
 * Navigation für Version 1: Gruppen, Reihenfolge und Symbole wie in der Demo (CLAUDE.md „Rahmen und Navigation“).
 * Module ohne `bereit: true` erscheinen ausgegraut als „folgt“ (Entscheidung 10.11.2026) und sind nicht anklickbar.
 */
export const NAVIGATION: NavGroup[] = [
  {
    label: "Übersicht",
    items: [
      { key: "dashboard", href: "/", label: "Dashboard", icon: LayoutDashboard, bereit: true },
      { key: "aufgaben", href: "/aufgaben", label: "Aufgaben", icon: CheckSquare, bereit: true, zaehler: "aufgaben" },
    ],
  },
  {
    label: "Kunden & Anfragen",
    items: [
      { key: "kunden", href: "/kunden", label: "Kunden", icon: Users, bereit: true },
      { key: "anfragen", href: "/anfragen", label: "Anfragen", icon: Inbox, bereit: true, zaehler: "anfragen" },
    ],
  },
  {
    label: "Belege",
    items: [
      { key: "belege", href: "/belege", label: "Alle Belege", icon: Download, bereit: true, zaehler: "belege" },
      { key: "angebote", href: "/belege/angebote", label: "Angebote", icon: FileText, bereit: true, zaehler: "angebote" },
      { key: "auftraege", href: "/auftraege", label: "Aufträge", icon: Briefcase, bereit: true, zaehler: "auftraege" },
      { key: "lieferscheine", href: "/belege/lieferscheine", label: "Lieferscheine", icon: Truck, bereit: true },
      { key: "abschlaege", href: "/belege/abschlaege", label: "Abschlagsrechnungen", icon: Receipt },
      { key: "rechnungen", href: "/belege/rechnungen", label: "Rechnungen", icon: Receipt },
      { key: "gutschriften", href: "/belege/gutschriften", label: "Gutschriften", icon: Undo2 },
    ],
  },
  {
    label: "Montage & Service",
    items: [
      { key: "montageplan", href: "/montageplan", label: "Montageplan", icon: Calendar, bereit: true },
      { key: "service", href: "/service", label: "Service-Tickets", icon: Wrench, bereit: true, zaehler: "service" },
      { key: "serviceplan", href: "/serviceplan", label: "Service-Plan", icon: Calendar, bereit: true },
    ],
  },
  {
    label: "Einkauf",
    items: [
      { key: "lieferanten", href: "/lieferanten", label: "Lieferanten", icon: Store, bereit: true },
      { key: "bestellungen", href: "/bestellungen", label: "Bestellungen", icon: ShoppingCart, bereit: true, zaehler: "bestellungen" },
    ],
  },
  {
    label: "Team und Ressourcen",
    items: [
      { key: "kalender", href: "/kalender", label: "Kalender", icon: Grid3x3, bereit: true },
      { key: "mitarbeiter", href: "/mitarbeiter", label: "Mitarbeiter", icon: User, bereit: true },
      { key: "fahrzeuge", href: "/fahrzeuge", label: "Fahrzeuge", icon: Truck, bereit: true, zaehler: "fahrzeuge" },
      { key: "zeiten", href: "/zeiten", label: "Zeiterfassung", icon: Clock, bereit: true },
      { key: "abwesenheiten", href: "/abwesenheiten", label: "Abwesenheiten", icon: Sun, bereit: true, zaehler: "abwesenheiten" },
    ],
  },
  {
    label: "System",
    items: [{ key: "einstellungen", href: "/einstellungen", label: "Einstellungen", icon: Settings2, bereit: true }],
  },
];
