import Link from "next/link";
import { cn } from "@/lib/cn";

type KpiCardProps = {
  label: string;
  value: string;
  note?: React.ReactNode;
  href?: string;
  /** Werte für die Mini-Balken, ältester zuerst. Der letzte Balken wird hervorgehoben. */
  spark?: number[];
  /** Beschriftung je Balken für Tooltip und Screenreader (z. B. „KW 45: 3“) */
  sparkTitel?: string[];
  /** Hervorgehobener Balken (aktueller Zeitraum); Standard: der letzte */
  sparkAktuell?: number;
  /** Wert rot (z. B. Konflikte, überfällig) */
  warnung?: boolean;
};

export function KpiCard({ label, value, note, href, spark, sparkTitel, sparkAktuell, warnung }: KpiCardProps) {
  const max = Math.max(1, ...(spark ?? []));
  const body = (
    <>
      <div className="min-w-0 flex-1">
        <span className="text-[12.5px] font-medium text-muted-2">{label}</span>
        <div className={cn("tabular mt-2 text-[26px] leading-tight font-bold tracking-[-0.02em] whitespace-nowrap", warnung && "text-tone-red-fg")}>{value}</div>
        {note && <div className="mt-2 text-[12.5px] text-muted-2">{note}</div>}
      </div>
      {spark && (
        <div className="flex h-[46px] shrink-0 items-end gap-1 self-center" role="img" aria-label={sparkTitel?.join(", ") ?? spark.join(", ")}>
          {spark.map((v, i) => (
            <i
              key={i}
              title={sparkTitel?.[i]}
              className={cn(
                "block w-[7px] rounded-[3px]",
                i === (sparkAktuell ?? spark.length - 1) ? "bg-ink" : v < max * 0.45 ? "bg-accent-soft-2" : "bg-accent",
              )}
              style={{ height: Math.max(5, Math.round((v / max) * 46)) }}
            />
          ))}
        </div>
      )}
    </>
  );
  const cls =
    "flex items-stretch justify-between gap-3 rounded-lg border border-line-soft bg-surface py-5 pr-5 pl-[22px]";
  return href ? (
    <Link href={href} className={cn(cls, "transition hover:border-line-strong hover:shadow-hover")}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}
