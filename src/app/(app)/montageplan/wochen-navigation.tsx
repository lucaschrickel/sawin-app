import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";
import { plusTage, wocheAus } from "@/lib/woche";

/** Ansicht (1 Woche im Stundenraster, 4 Wochen tagesgenau), Vor, Heute, Zurück für Montage- und Service-Plan */
export function WochenNavigation({ basis, montag, heute, wochen = 1 }: { basis: string; montag: string; heute: string; wochen?: 1 | 4 }) {
  const knopf = "inline-flex h-10 items-center justify-center gap-1.5 rounded-full border border-line bg-surface px-3.5 text-sm hover:border-line-strong";
  const zusatz = wochen === 4 ? "&ansicht=4" : "";
  const segment = "inline-flex h-8 items-center rounded-full px-3 text-sm font-medium";
  return (
    <nav aria-label="Woche" className="flex flex-wrap items-center gap-2">
      <span role="group" aria-label="Ansicht" className="mr-1 inline-flex h-10 items-center gap-0.5 rounded-full border border-line bg-surface p-1">
        <Link replace scroll={false} href={`${basis}?woche=${montag}`} aria-current={wochen === 1 ? "page" : undefined} className={cn(segment, wochen === 1 ? "bg-ink text-white" : "text-muted hover:text-ink")}>
          1 Woche
        </Link>
        <Link replace scroll={false} href={`${basis}?woche=${montag}&ansicht=4`} aria-current={wochen === 4 ? "page" : undefined} className={cn(segment, wochen === 4 ? "bg-ink text-white" : "text-muted hover:text-ink")}>
          4 Wochen
        </Link>
      </span>
      <Link replace scroll={false} href={`${basis}?woche=${plusTage(montag, -7)}${zusatz}`} aria-label="Vorige Woche" className={knopf}>
        <ChevronLeft className="size-4" />
      </Link>
      <Link replace scroll={false} href={wochen === 4 ? `${basis}?ansicht=4` : basis} className={knopf} aria-current={montag === wocheAus("", heute) ? "date" : undefined}>
        Heute
      </Link>
      <Link replace scroll={false} href={`${basis}?woche=${plusTage(montag, 7)}${zusatz}`} aria-label="Nächste Woche" className={knopf}>
        <ChevronRight className="size-4" />
      </Link>
    </nav>
  );
}
