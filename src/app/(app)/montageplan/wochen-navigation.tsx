import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { plusTage, wocheAus } from "@/lib/woche";

/** Vor, Heute, Zurück für Montage- und Service-Plan */
export function WochenNavigation({ basis, montag, heute }: { basis: string; montag: string; heute: string }) {
  const knopf = "inline-flex h-10 items-center justify-center gap-1.5 rounded-full border border-line bg-surface px-3.5 text-sm hover:border-line-strong";
  return (
    <nav aria-label="Woche" className="flex items-center gap-2">
      <Link replace scroll={false} href={`${basis}?woche=${plusTage(montag, -7)}`} aria-label="Vorige Woche" className={knopf}>
        <ChevronLeft className="size-4" />
      </Link>
      <Link replace scroll={false} href={basis} className={knopf} aria-current={montag === wocheAus("", heute) ? "date" : undefined}>
        Heute
      </Link>
      <Link replace scroll={false} href={`${basis}?woche=${plusTage(montag, 7)}`} aria-label="Nächste Woche" className={knopf}>
        <ChevronRight className="size-4" />
      </Link>
    </nav>
  );
}
