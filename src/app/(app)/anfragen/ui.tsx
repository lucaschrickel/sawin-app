"use client";

import Link from "next/link";
import { RotateCcw, Trash2, XCircle } from "lucide-react";
import { useActionState, useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Bestaetigen } from "@/components/ui/bestaetigen";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/field";
import { FormularDialog } from "@/components/ui/formular-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Formular } from "@/components/ui/formular";
import { ansichtSetzen } from "@/lib/ansicht-aktion";
import { ANFRAGE_STATUS, ANFRAGE_STATUS_TEXT, ANFRAGE_STATUS_TON, type AnfrageStatus } from "@/lib/anfragen-status";
import { cn } from "@/lib/cn";
import { anfrageLoeschen, notizAnlegen, statusSetzen, verlorenSetzen, wiederherstellen, type Ergebnis } from "./aktionen";

function Meldung({ e }: { e: Ergebnis }) {
  if (!e.fehler && !e.hinweis) return null;
  return (
    <p role={e.fehler ? "alert" : "status"} className={cn("rounded-md px-3.5 py-2.5 text-sm", e.fehler ? "bg-tone-red-bg text-tone-red-fg" : "bg-tone-green-bg text-tone-green-fg")}>
      {e.fehler ?? e.hinweis}
    </p>
  );
}

/** Liste oder Board, gemerkt je Benutzer */
export function AnsichtUmschalter({ ansicht, seite = "anfragen" }: { ansicht: "liste" | "board"; seite?: string }) {
  const [laeuft, starten] = useTransition();
  return (
    <div role="group" aria-label="Ansicht" className="flex gap-1 rounded-full bg-surface-sunken p-1">
      {(["liste", "board"] as const).map((v) => (
        <button
          key={v}
          type="button"
          aria-pressed={ansicht === v}
          disabled={laeuft}
          onClick={() => starten(() => ansichtSetzen(seite, v))}
          className={cn("rounded-full px-3.5 py-1.5 text-sm", ansicht === v ? "bg-surface font-medium text-ink shadow-card" : "text-muted hover:text-ink")}
        >
          {v === "liste" ? "Liste" : "Board"}
        </button>
      ))}
    </div>
  );
}

export type BoardKarte = {
  id: string;
  titel: string;
  status: AnfrageStatus;
  kunde: string;
  objekt: string | null;
  wert: string | null;
  produkte: string[];
  termin: { text: string; ueberfaellig: boolean } | null;
  zustaendig: string | null;
};

/** Kanban der offenen Anfragen; Karten per Drag & Drop in eine andere Spalte ziehen ändert den Status. */
export function AnfragenBoard({ karten }: { karten: BoardKarte[] }) {
  const [liste, setListe] = useState(karten);
  const [ziel, setZiel] = useState<AnfrageStatus | null>(null);
  const [fehler, setFehler] = useState<string>();
  const [, starten] = useTransition();

  const ablegen = (id: string, status: AnfrageStatus) => {
    const vorher = liste;
    const karte = liste.find((k) => k.id === id);
    if (!karte || karte.status === status) return;
    setListe((l) => l.map((k) => (k.id === id ? { ...k, status } : k)));
    starten(async () => {
      const r = await statusSetzen(id, status);
      if (r.fehler) {
        setListe(vorher);
        setFehler(r.fehler);
      }
    });
  };

  return (
    <div className="flex flex-col gap-3">
      {fehler && <Meldung e={{ fehler }} />}
      <div className="flex gap-3 overflow-x-auto pb-2">
        {ANFRAGE_STATUS.map((s) => {
          const spalte = liste.filter((k) => k.status === s);
          return (
            <section
              key={s}
              aria-label={ANFRAGE_STATUS_TEXT[s]}
              data-status={s}
              onDragOver={(e) => { e.preventDefault(); setZiel(s); }}
              onDragLeave={() => setZiel((z) => (z === s ? null : z))}
              onDrop={(e) => { e.preventDefault(); setZiel(null); ablegen(e.dataTransfer.getData("text/plain"), s); }}
              className={cn("flex min-h-[220px] min-w-[200px] flex-1 flex-col gap-2.5 rounded-lg bg-surface-sunken p-2.5", ziel === s && "outline-2 outline-dashed outline-line-strong")}
            >
              <h2 className="flex items-center justify-between px-1.5 pt-1 text-sm font-semibold">
                <span className="flex items-center gap-2">
                  <Badge tone={ANFRAGE_STATUS_TON[s]} dot>{ANFRAGE_STATUS_TEXT[s]}</Badge>
                </span>
                <span className="text-xs text-muted-2 tabular">{spalte.length}</span>
              </h2>
              {spalte.map((k) => (
                <Link
                  key={k.id}
                  href={`/anfragen/${k.id}`}
                  draggable
                  data-anfrage={k.id}
                  onDragStart={(e) => { e.dataTransfer.setData("text/plain", k.id); e.dataTransfer.effectAllowed = "move"; }}
                  className="flex flex-col gap-1.5 rounded-md border border-line-soft bg-surface p-3 shadow-card hover:border-line-strong"
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <b className="text-[15px] font-medium">{k.titel}</b>
                    {k.wert && <span className="font-mono text-xs text-ink-3">≈ {k.wert}</span>}
                  </span>
                  <span className="text-[13px] text-muted">{[k.kunde, k.objekt].filter(Boolean).join(" · ")}</span>
                  {k.produkte.length > 0 && (
                    <span className="flex flex-wrap gap-1">{k.produkte.map((p) => <Badge key={p} tone="gray">{p}</Badge>)}</span>
                  )}
                  <span className="flex items-center justify-between border-t border-line-soft pt-2 text-xs">
                    <span className={k.termin?.ueberfaellig ? "font-medium text-tone-red-fg" : "text-muted"}>{k.termin?.text ?? "Keine Wiedervorlage"}</span>
                    {k.zustaendig && <span className="text-muted-2">{k.zustaendig}</span>}
                  </span>
                </Link>
              ))}
              {!spalte.length && <p className="px-1.5 text-xs text-muted-2">Karten hierher ziehen</p>}
            </section>
          );
        })}
      </div>
      <p className="text-xs text-muted-2">Karten per Drag & Drop zwischen den Spalten verschieben. Ein Klick öffnet die Anfrage.</p>
    </div>
  );
}

/** Status ändern (offene Anfrage) */
export function StatusAuswahl({ id, status }: { id: string; status: AnfrageStatus }) {
  const [fehler, setFehler] = useState<string>();
  const [laeuft, starten] = useTransition();
  return (
    <>
      <Select value={status} disabled={laeuft} onValueChange={(v) => starten(async () => setFehler((await statusSetzen(id, v)).fehler))}>
        <SelectTrigger aria-label="Status ändern" className="w-[200px]"><SelectValue /></SelectTrigger>
        <SelectContent>{ANFRAGE_STATUS.map((s) => <SelectItem key={s} value={s}>{ANFRAGE_STATUS_TEXT[s]}</SelectItem>)}</SelectContent>
      </Select>
      {fehler && <Meldung e={{ fehler }} />}
    </>
  );
}

/** Aktionen auf der Anfrageseite: Verloren, Wiederherstellen, Löschen. Gewonnen wird die Anfrage mit der AB. */
export function AnfrageAktionen({ id, titel, archiv, hatAuftrag }: { id: string; titel: string; archiv: "gewonnen" | "verloren" | null; hatAuftrag: boolean }) {
  const [ergebnis, setErgebnis] = useState<Ergebnis>({});
  const [laeuft, starten] = useTransition();
  const tun = (f: () => Promise<Ergebnis | undefined>) => starten(async () => setErgebnis((await f()) ?? {}));

  return (
    <>
      {!archiv && (
        <>
          <VerlorenDialog id={id} />
        </>
      )}
      {archiv && !hatAuftrag && (
        <Button disabled={laeuft} onClick={() => tun(() => wiederherstellen(id))}>
          <RotateCcw className="size-[15px]" />
          Wiederherstellen
        </Button>
      )}
      {!hatAuftrag && (
        <Bestaetigen
          titel="Anfrage löschen?"
          text={<><b className="text-ink">{titel}</b> wird als gelöscht markiert und verschwindet aus allen Listen. Die Daten bleiben im Protokoll erhalten.</>}
          knopf="Löschen"
          gefahr
          ausfuehren={() => tun(() => anfrageLoeschen(id))}
        >
          <Button variant="danger" disabled={laeuft}>
            <Trash2 className="size-[15px]" />
            Löschen
          </Button>
        </Bestaetigen>
      )}
      {(ergebnis.fehler || ergebnis.hinweis) && <div className="basis-full"><Meldung e={ergebnis} /></div>}
    </>
  );
}

function VerlorenDialog({ id }: { id: string }) {
  return (
    <FormularDialog
      titel="Anfrage als verloren archivieren"
      ausloeser={
        <Button variant="danger">
          <XCircle className="size-[15px]" />
          Verloren
        </Button>
      }
    >
      {(s) => <VerlorenFormular id={id} fertig={s.fertig} abbrechen={s.abbrechen} aenderung={s.aenderung} />}
    </FormularDialog>
  );
}
function VerlorenFormular({ id, fertig, abbrechen, aenderung }: { id: string; fertig: () => void; abbrechen: () => void; aenderung: () => void }) {
  const [z, aktion, laeuft] = useActionState<Ergebnis, FormData>(async (v, fd) => {
    const r = await verlorenSetzen(v, fd);
    if (r.ok) fertig();
    return r;
  }, {});
  return (
    <Formular aktion={aktion} onInput={aenderung} className="flex flex-col gap-4">
      <input type="hidden" name="id" value={id} />
      <Meldung e={{ fehler: z.fehler }} />
      <Field label="Grund *" hint="z. B. zu teuer, Mitbewerber, Projekt verschoben">
        {(p) => <Textarea {...p} name="grund" required autoFocus />}
      </Field>
      <div className="flex justify-end gap-2.5">
        <Button onClick={abbrechen}>Abbrechen</Button>
        <Button type="submit" variant="primary" disabled={laeuft}>Als verloren archivieren</Button>
      </div>
    </Formular>
  );
}

/** Notiz oder Telefonat in der Historie einer Anfrage oder eines Auftrags erfassen */
export function NotizFormular({ anfrageId, auftragId }: { anfrageId?: string; auftragId?: string }) {
  const [schluessel, setSchluessel] = useState(0);
  const [z, aktion, laeuft] = useActionState<Ergebnis, FormData>(async (v, fd) => {
    const r = await notizAnlegen(v, fd);
    if (r.ok) setSchluessel((k) => k + 1);
    return r;
  }, {});
  return (
    <form key={schluessel} action={aktion} className="flex flex-col gap-2">
      {auftragId ? <input type="hidden" name="auftrag_id" value={auftragId} /> : <input type="hidden" name="anfrage_id" value={anfrageId} />}
      <Textarea name="text" aria-label="Notiz" placeholder="Notiz oder Gesprächsnotiz …" className="min-h-[64px]" />
      {z.fehler && <Meldung e={z} />}
      <div className="flex items-center justify-end gap-2">
        <select name="art" aria-label="Art" className="h-9 rounded-sm border border-line bg-surface px-2 text-sm">
          <option value="notiz">Notiz</option>
          <option value="telefonat">Telefonat</option>
        </select>
        <Button type="submit" size="sm" variant="primary" disabled={laeuft}>Eintragen</Button>
      </div>
    </form>
  );
}
