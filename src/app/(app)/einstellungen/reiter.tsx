import Link from "next/link";
import { cn } from "@/lib/cn";

/** Reiter der Einstellungen; „Benutzer“ nur für Admins */
export function EinstellungenReiter({ aktiv, admin }: { aktiv: "firma" | "benutzer" | "montageplan" | "belege"; admin: boolean }) {
  const reiter = [
    { key: "firma", href: "/einstellungen/firma", label: "Firma" },
    ...(admin ? [{ key: "benutzer", href: "/einstellungen/benutzer", label: "Benutzer" }] : []),
    { key: "montageplan", href: "/einstellungen/montageplan", label: "Montageplan" },
    { key: "belege", href: "/einstellungen/belege", label: "Belege & Artikel" },
  ];
  return (
    <nav aria-label="Einstellungen" className="mb-5 flex gap-6 border-b border-line-soft">
      {reiter.map((r) => (
        <Link
          key={r.key}
          replace
          href={r.href}
          aria-current={aktiv === r.key ? "page" : undefined}
          className={cn("-mb-px border-b-2 px-1 pb-2.5 text-[15px]", aktiv === r.key ? "border-ink font-semibold text-ink" : "border-transparent text-muted hover:text-ink")}
        >
          {r.label}
        </Link>
      ))}
    </nav>
  );
}
