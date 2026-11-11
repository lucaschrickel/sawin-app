import Link from "next/link";
import { Pencil } from "lucide-react";
import { Karte } from "@/components/app/info-karte";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, Td, Th } from "@/components/ui/table";
import { FORMULAR_STATUS_TEXT, FORMULAR_STATUS_TON, FORMULAR_TEXT, formularReihenfolge } from "@/lib/formular-logik";
import { ladeFormulare, type FormularBezug, type FormularListe } from "@/lib/formulare";
import { FORMULAR_UNTERORDNER } from "@/lib/onedrive/schema";
import { tag } from "@/lib/zeit";
import { AufmassNeu, FormularEntfernen, InAngebot, PdfOeffnen, ProtokollDrucken, ScanHochladen } from "./ui";

/** Ablage-Spalte: Unterordner und Datei (Link nach OneDrive) bzw. Hinweis, solange die Datei wartet */
function Ablage({ f, ticket }: { f: FormularListe; ticket: boolean }) {
  const ordner = ticket ? "Ticket-Ordner" : FORMULAR_UNTERORDNER[f.typ];
  if (!f.dateien.length) {
    if (f.typ === "aufmass" && f.status === "abgeschlossen") return <span className="text-xs text-muted-2">{ordner} · PDF folgt</span>;
    return <span className="text-xs text-muted-2">{f.typ === "aufmass" ? "" : ordner}</span>;
  }
  return (
    <span className="flex flex-col gap-0.5 text-xs">
      {f.dateien.map((d) =>
        d.web_url ? (
          <a key={d.id} href={d.web_url} target="_blank" rel="noopener" className="truncate text-accent-text hover:underline" title={`${ordner} › ${d.name}`}>
            {d.name}
          </a>
        ) : (
          <span key={d.id} className="truncate text-muted-2" title="Wird nach OneDrive übertragen">
            {d.name} · wartet
          </span>
        ),
      )}
    </span>
  );
}

/** Reiter „Formulare & Protokolle“ an Auftrag und Ticket */
export async function FormulareKarte({ bezug }: { bezug: FormularBezug }) {
  const ticket = !!bezug.ticket_id;
  const formulare = await ladeFormulare(bezug);
  return (
    <Karte titel="Formulare & Protokolle">
      <p className="-mt-1 text-[13px] text-muted">Aufmaßblatt digital vor Ort ausfüllen. Die Protokolle drucken, auf der Baustelle unterschreiben lassen, Scan hochladen.</p>
      <div className="mt-3.5 flex flex-wrap gap-2" data-formular-knoepfe>
        {formularReihenfolge(ticket).map((t) => (t === "aufmass" ? <AufmassNeu key={t} bezug={bezug} dunkel={!ticket} /> : <ProtokollDrucken key={t} typ={t} bezug={bezug} />))}
      </div>
      {formulare.length ? (
        <div className="mt-4">
          <Table className="text-sm">
            <thead>
              <tr>
                <Th>Formular</Th>
                <Th>Datum</Th>
                <Th>Status</Th>
                <Th>Ablage</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {formulare.map((f) => (
                <tr key={f.id} data-formular={f.id} data-formular-typ={f.typ}>
                  <Td className="whitespace-nowrap">
                    <span className="font-medium">{FORMULAR_TEXT[f.typ]}</span>
                    {f.typ === "aufmass" && <span className="text-muted-2"> · {f.elemente === 1 ? "1 Element" : `${f.elemente} Elemente`}</span>}
                  </Td>
                  <Td className="whitespace-nowrap tabular">{tag(f.datum)}</Td>
                  <Td>
                    <Badge tone={FORMULAR_STATUS_TON[f.status]} data-formular-status={f.status}>{FORMULAR_STATUS_TEXT[f.status]}</Badge>
                  </Td>
                  <Td className="max-w-[260px]">
                    <Ablage f={f} ticket={ticket} />
                  </Td>
                  <Td>
                    <div className="flex flex-wrap items-center justify-end gap-1.5">
                      {f.typ === "aufmass" ? (
                        <>
                          <Button size="xs" asChild>
                            <Link href={`/formulare/${f.id}`} data-formular-oeffnen={f.id}>
                              <Pencil className="size-3.5" /> Öffnen
                            </Link>
                          </Button>
                          {!ticket && <InAngebot id={f.id} />}
                          <PdfOeffnen id={f.id} text="PDF" />
                        </>
                      ) : (
                        <>
                          {f.status !== "scan_abgelegt" && <ScanHochladen id={f.id} />}
                          <PdfOeffnen id={f.id} text="Vorlage" />
                        </>
                      )}
                      {(f.status === "entwurf" || f.status === "gedruckt") && <FormularEntfernen id={f.id} typ={f.typ} />}
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      ) : (
        <p className="mt-4 text-sm text-muted">Noch keine Formulare.</p>
      )}
    </Karte>
  );
}

/** Karte „Aufmaßblatt“ auf der Anfrageseite */
export async function AufmassKarte({ anfrageId, archiviert, auftrag, termin }: { anfrageId: string; archiviert: boolean; auftrag: { id: string; nummer: string } | null; termin: string | null }) {
  const formulare = await ladeFormulare({ anfrage_id: anfrageId });
  return (
    <Karte titel="Aufmaßblatt" rechts={!archiviert ? <AufmassNeu bezug={{ anfrage_id: anfrageId }} text={formulare.length ? "Weiteres Aufmaß" : "Aufmaß erfassen"} dunkel={false} /> : undefined}>
      {formulare.length ? (
        <ul className="flex flex-col">
          {formulare.map((f) => (
            <li key={f.id} className="flex flex-wrap items-center gap-2 border-t border-line-soft py-2.5 text-sm first:border-t-0" data-formular={f.id}>
              <span className="min-w-0 flex-1">
                Aufmaß vom {tag(f.datum)} <span className="text-muted-2">· {f.elemente === 1 ? "1 Element" : `${f.elemente} Elemente`}</span>
              </span>
              <Badge tone={FORMULAR_STATUS_TON[f.status]} data-formular-status={f.status}>{FORMULAR_STATUS_TEXT[f.status]}</Badge>
              <Button size="xs" asChild>
                <Link href={`/formulare/${f.id}`} data-formular-oeffnen={f.id}>
                  <Pencil className="size-3.5" /> Öffnen
                </Link>
              </Button>
              {!archiviert && <InAngebot id={f.id} />}
            </li>
          ))}
        </ul>
      ) : auftrag ? (
        <p className="text-sm text-muted">
          Das Aufmaß liegt jetzt im Auftrag{" "}
          <Link href={`/auftraege/${auftrag.id}?reiter=formulare`} className="text-accent-text hover:underline">{auftrag.nummer}</Link>.
        </p>
      ) : (
        <p className="text-sm text-muted">Noch kein Aufmaß.{termin ? ` Termin ${termin}.` : ""}</p>
      )}
    </Karte>
  );
}
