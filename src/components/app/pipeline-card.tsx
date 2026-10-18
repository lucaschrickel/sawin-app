import Link from "next/link";
import { AvatarStack } from "@/components/ui/avatar";
import { StatusDot, Tag, type Tone } from "@/components/ui/badge";
import { eurK } from "@/lib/format";

export type BelegKette = { kurz: "AG" | "AB" | "LS" | "RE"; name: string; vorhanden: boolean }[];

export type PipelineCardProps = {
  href: string;
  auftragId: string;
  kunde: string;
  titel: string;
  wert?: number;
  produkte: string[];
  hinweis: { text: string; tone: Tone };
  warnung?: string;
  kette: BelegKette;
  team: { initials: string; name: string }[];
};

/** Karte in der Auftrags-Pipeline. Ersetzbar je Kunde über den Slot "PipelineCard". */
export function PipelineCard(p: PipelineCardProps) {
  return (
    <Link
      href={p.href}
      className="flex flex-col gap-[9px] rounded-[15px] border border-transparent bg-surface px-[15px] pt-[15px] pb-3 shadow-card transition hover:border-line-strong hover:shadow-hover"
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-mono text-xs text-muted">{p.auftragId}</span>
        <span className="tabular text-sm font-medium">{p.wert != null ? eurK(p.wert) : "offen"}</span>
      </div>
      <span className="text-md leading-snug font-medium">{p.kunde}</span>
      <span className="-mt-1 text-sm text-muted">{p.titel}</span>
      <div className="flex flex-wrap gap-[5px]">
        {p.produkte.map((x) => (
          <Tag key={x}>{x}</Tag>
        ))}
      </div>
      <span className="flex items-center gap-1.5 text-sm text-ink-3">
        <StatusDot tone={p.hinweis.tone} className="size-1.5" />
        {p.hinweis.text}
      </span>
      {p.warnung && (
        <span className="rounded-xs bg-tone-red-bg px-[9px] py-1 text-[12.5px] text-tone-red-fg">{p.warnung}</span>
      )}
      <div className="flex items-center justify-between border-t border-line-soft pt-2.5">
        <div className="flex gap-[3px]" aria-label="Belegkette">
          {p.kette.map((k) => (
            <span
              key={k.kurz}
              title={k.name + (k.vorhanden ? " vorhanden" : " fehlt")}
              className={
                "rounded-full px-1.5 py-0.5 text-[10.5px] font-semibold " +
                (k.vorhanden ? "bg-accent text-accent-ink" : "bg-tone-gray-bg text-muted-2")
              }
            >
              {k.kurz}
            </span>
          ))}
        </div>
        <AvatarStack people={p.team} />
      </div>
    </Link>
  );
}
