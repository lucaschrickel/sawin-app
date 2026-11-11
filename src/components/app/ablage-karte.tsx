import { ExternalLink, FolderOpen } from "lucide-react";
import { Karte } from "@/components/app/info-karte";
import { Badge } from "@/components/ui/badge";
import { ladeAblage } from "@/lib/onedrive/anzeige";
import { UNTERORDNER } from "@/lib/onedrive/schema";
import { AblageAktionen, AblageUpload } from "./ablage-upload";

const STATUS = {
  angelegt: { text: "OneDrive", ton: "green" },
  wartet: { text: "wartet", ton: "amber" },
  fehler: { text: "Fehler", ton: "red" },
} as const;

/**
 * Karte „OneDrive-Ordner“ an Anfrage, Auftrag und Ticket: Link zum Ordner, letzte Dateien, Upload (Scans, Fotos,
 * Dokumente). Ohne Verbindung landen Dateien im Zwischenspeicher und werden später übertragen.
 */
export async function AblageKarte({ bezug, hinweisOhneOrdner }: { bezug: { anfrage_id?: string; auftrag_id?: string; ticket_id?: string }; hinweisOhneOrdner?: string }) {
  const { ordner, dateien, verbunden } = await ladeAblage(bezug);
  const wartend = dateien.filter((d) => d.status !== "abgelegt").length;
  const ticket = !!bezug.ticket_id;
  return (
    <Karte
      titel="OneDrive-Ordner"
      rechts={
        ordner ? (
          <Badge tone={STATUS[ordner.status].ton} data-ablage-status={ordner.status}>{STATUS[ordner.status].text}</Badge>
        ) : (
          <Badge tone="gray" data-ablage-status="keiner">kein Ordner</Badge>
        )
      }
    >
      <div className="flex flex-col gap-3 text-sm" data-ablage>
        {ordner ? (
          <p className="flex min-w-0 items-center gap-2">
            <FolderOpen className="size-4 shrink-0 text-muted-2" />
            {ordner.web_url ? (
              <a href={ordner.web_url} target="_blank" rel="noopener" className="truncate font-medium text-accent-text hover:underline" data-ablage-ordner>
                {ordner.name}
              </a>
            ) : (
              <span className="truncate font-medium" data-ablage-ordner>{ordner.name}</span>
            )}
            {ordner.web_url && <ExternalLink className="size-3.5 shrink-0 text-muted-2" />}
          </p>
        ) : (
          <p className="text-muted">{hinweisOhneOrdner ?? "Noch kein Ordner."}</p>
        )}
        {ordner?.status === "fehler" && ordner.fehler && <p className="text-xs text-tone-red-fg">{ordner.fehler}</p>}
        {!verbunden && <p className="text-xs text-muted-2">OneDrive ist noch nicht verbunden (Einstellungen › Verbindungen). Dateien werden zwischengespeichert und später übertragen.</p>}

        {dateien.length > 0 && (
          <ul className="flex flex-col" data-ablage-dateien>
            {dateien.slice(0, 8).map((d) => (
              <li key={d.id} className="flex items-baseline justify-between gap-2 border-t border-line-soft py-1.5 first:border-t-0" data-ablage-datei={d.status}>
                <span className="min-w-0">
                  {d.web_url ? (
                    <a href={d.web_url} target="_blank" rel="noopener" className="block truncate hover:underline">{d.name}</a>
                  ) : (
                    <span className="block truncate">{d.name}</span>
                  )}
                  {d.unterordner && <span className="block truncate text-xs text-muted-2">{d.unterordner}</span>}
                </span>
                {d.status !== "abgelegt" && (
                  <span title={d.fehler ?? undefined}>
                    <Badge tone={d.status === "fehler" ? "red" : "amber"}>{d.status === "fehler" ? "Fehler" : "wartet"}</Badge>
                  </span>
                )}
              </li>
            ))}
            {dateien.length > 8 && <li className="pt-1 text-xs text-muted-2">+ {dateien.length - 8} weitere im Ordner</li>}
          </ul>
        )}

        {(ordner || !bezug.anfrage_id) && <AblageUpload bezug={bezug} unterordner={ticket ? [] : [...UNTERORDNER]} />}
        <AblageAktionen bezug={bezug} ordnerFehlt={!ordner && !bezug.anfrage_id} wartend={wartend} verbunden={verbunden} />
      </div>
    </Karte>
  );
}
