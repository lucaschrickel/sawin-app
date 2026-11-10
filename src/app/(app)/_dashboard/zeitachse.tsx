import Link from "next/link";
import { Fragment } from "react";
import { MapPin } from "lucide-react";
import { KALENDER_ART_TEXT, KALENDER_TOKEN, type KalenderEintrag } from "@/lib/kalender-text";
import { cn } from "@/lib/cn";

type Eintrag = KalenderEintrag & { team: string[] };
const uhr = (lokal: string) => lokal.slice(11, 16);

/** Termine eines Tages als Zeitachse mit „Jetzt“-Linie (Demo: Dashboard „Heute“) */
export function Zeitachse({ eintraege, jetzt, leer }: { eintraege: Eintrag[]; jetzt: string; leer: string }) {
  if (!eintraege.length) return <p className="py-2 text-sm text-muted">{leer}</p>;
  const jetztIndex = eintraege.findIndex((e) => e.beginn > jetzt);
  const linie = (
    <div className="flex items-center gap-2 py-1 text-xs font-medium text-tone-red-fg" data-jetzt>
      <span className="tabular">Jetzt {uhr(jetzt)}</span>
      <i className="h-px flex-1 bg-tone-red-fg" />
    </div>
  );
  return (
    <ol className="flex flex-col">
      {eintraege.map((e, i) => (
        <Fragment key={e.schluessel}>
          {i === jetztIndex && linie}
          <li>
            <Link
              href={e.href ?? `/kalender?ansicht=tag&datum=${e.beginn.slice(0, 10)}`}
              className={cn("flex gap-3 rounded-md px-1.5 py-2.5 hover:bg-surface-sunken", e.vorgeplant && "opacity-75")}
              data-termin={e.art}
            >
              <span className="mt-1.5 size-2.5 shrink-0 rounded-full" style={{ background: `var(--cal-${KALENDER_TOKEN[e.art]})` }} title={KALENDER_ART_TEXT[e.art]} />
              <span className="w-[92px] shrink-0 font-mono text-[13px] font-semibold tabular">
                {uhr(e.beginn)}–{uhr(e.ende)}
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <b className="text-[14.5px] font-semibold">
                  {e.titel}
                  {e.vorgeplant && <span className="ml-2 text-xs font-normal text-muted-2">vorgeplant</span>}
                </b>
                {e.unter && (
                  <span className="flex items-center gap-1 text-[13px] text-muted">
                    {e.art === "aufmass" && <MapPin className="size-3.5 shrink-0" />}
                    {e.unter}
                  </span>
                )}
              </span>
              {e.team.length > 0 && <span className="shrink-0 text-xs text-muted-2">{e.team.map((t) => t.split(" ")[0]).join(", ")}</span>}
            </Link>
          </li>
        </Fragment>
      ))}
      {jetztIndex === -1 && linie}
    </ol>
  );
}
