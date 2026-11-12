"use client";

import { ChatZahl } from "../chat/ui";
import Link from "next/link";
import { AlertTriangle, Check, Pencil, Plus, Trash2 } from "lucide-react";
import { useActionState, useState, useTransition, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Bestaetigen } from "@/components/ui/bestaetigen";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Formular } from "@/components/ui/formular";
import { FormularDialog, type FormularSteuerung } from "@/components/ui/formular-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/cn";
import type { Ticket } from "@/lib/service";
import { ABRECHNUNG, ABRECHNUNG_TEXT, TICKET_ART_TEXT, TICKET_ARTEN, TICKET_PRIO, TICKET_PRIO_TEXT, TICKET_STATUS, TICKET_STATUS_HAND, TICKET_STATUS_TEXT, TICKET_STATUS_TON, type TicketPrio, type TicketStatus } from "@/lib/ticket-status";
import { KundenAuswahl } from "../anfragen/anfrage-dialog";
import { kundenObjekte } from "../anfragen/aktionen";
import { AuftragSuche, type AuftragWahl } from "../montageplan/einsatz-dialog";
import { auftragAufReklamation, ticketLoeschen, ticketNotiz, ticketSpeichern, ticketStatusSetzen, type Ergebnis } from "./aktionen";

function Meldung({ e }: { e: Ergebnis }) {
  if (!e.fehler && !e.hinweis) return null;
  return (
    <p role={e.fehler ? "alert" : "status"} className={cn("rounded-md px-3.5 py-2.5 text-sm", e.fehler ? "bg-tone-red-bg text-tone-red-fg" : "bg-tone-green-bg text-tone-green-fg")}>
      {e.fehler ?? e.hinweis}
    </p>
  );
}

type DialogProps = {
  /** aus dem „Neu“-Menü: beim Laden offen */
  startOffen?: boolean;
  ticket?: Ticket & { auftragInfo?: AuftragWahl | null };
  /** Vorbelegung (z. B. „Ticket“ am Auftrag oder Kunden) */
  vorlage?: { kunde?: { id: string; name: string }; auftrag?: AuftragWahl };
  benutzer: { id: string; name: string }[];
  ichId: string;
  herkunftListe: string[];
  ausloeser?: ReactNode;
};

/** Ticket anlegen oder bearbeiten */
export function TicketDialog(p: DialogProps) {
  return (
    <FormularDialog
      titel={p.ticket ? `Ticket ${p.ticket.nummer}` : "Neues Service-Ticket"}
      breit
      startOffen={p.startOffen}
      ausloeser={
        p.ausloeser ??
        (p.ticket ? (
          <Button>
            <Pencil className="size-[15px]" />
            Bearbeiten
          </Button>
        ) : (
          <Button variant="primary">
            <Plus className="size-[15px]" strokeWidth={2.2} />
            Neues Ticket
          </Button>
        ))
      }
    >
      {(s) => <TicketFormular {...p} s={s} />}
    </FormularDialog>
  );
}

function TicketFormular({ ticket: t, vorlage, benutzer, ichId, herkunftListe, s }: DialogProps & { s: FormularSteuerung }) {
  const [z, aktion, laeuft] = useActionState<Ergebnis, FormData>(async (v, fd) => {
    const r = await ticketSpeichern(v, fd);
    if (r.ok) s.fertig();
    return r;
  }, {});
  const [kunde, setKunde] = useState<{ id: string; name: string } | null>(t?.kunde ?? vorlage?.kunde ?? null);
  const [auftrag, setAuftrag] = useState<AuftragWahl | null>(t?.auftragInfo ?? vorlage?.auftrag ?? null);
  const [art, setArt] = useState<string>(t?.art ?? "reparatur");
  const [abrechnung, setAbrechnung] = useState<string>(t?.abrechnung ?? "kostenpflichtig");
  const [objekt, setObjekt] = useState(t?.objekt ?? "");
  const [adressen, setAdressen] = useState<string[]>([]);
  const [umleiten, starteUmleiten] = useTransition();
  const f = z.felder ?? {};
  // Reklamation vor dem Abschluss läuft über die Phase „Reklamation“ im Auftrag (CLAUDE.md)
  const reklamationAmAuftrag = !t && art === "reklamation" && auftrag && auftrag.phase && auftrag.phase !== "abgeschlossen";

  const kundeWaehlen = async (k: { id: string; name: string }) => {
    setKunde(k);
    s.aenderung();
    const info = await kundenObjekte(k.id);
    if (info) {
      setAdressen(info.objekte);
      if (!objekt && info.objekte[0]) setObjekt(info.objekte[0]);
    }
  };

  return (
    <Formular aktion={aktion} onInput={s.aenderung} className="flex flex-col gap-4">
      {t && <input type="hidden" name="id" value={t.id} />}
      <input type="hidden" name="kunde_id" value={kunde?.id ?? ""} />
      <input type="hidden" name="auftrag_id" value={auftrag?.id ?? ""} />
      {z.fehler && <Meldung e={{ fehler: z.fehler }} />}

      <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1">
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-ink-3">Kunde *</span>
          {kunde ? (
            <div className="flex h-[42px] items-center justify-between gap-2 rounded-md border border-line bg-surface-muted px-[13px]">
              <b className="truncate font-medium">{kunde.name}</b>
              {!t && <Button size="xs" variant="ghost" onClick={() => { setKunde(null); s.aenderung(); }}>Ändern</Button>}
            </div>
          ) : (
            <KundenAuswahl onWahl={kundeWaehlen} herkunftListe={herkunftListe} fehler={f.kunde_id} />
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-ink-3">Ursprungsauftrag</span>
          {auftrag ? (
            <div className="flex h-[42px] items-center justify-between gap-2 rounded-md border border-line bg-surface-muted px-[13px]">
              <span className="min-w-0 truncate"><span className="font-mono text-[13px]">{auftrag.nummer}</span> · {auftrag.kunde}</span>
              <Button size="xs" variant="ghost" onClick={() => { setAuftrag(null); s.aenderung(); }}>Entfernen</Button>
            </div>
          ) : (
            <AuftragSuche auchAbgeschlossene onWahl={(a) => { setAuftrag(a); s.aenderung(); }} fehler={f.auftrag} />
          )}
          <small className="text-xs text-muted-2">Optional, z. B. bei Reklamation oder Wartung</small>
        </div>
      </div>

      <Field label="Thema *" error={f.thema}>{(x) => <Input {...x} name="thema" defaultValue={t?.thema} placeholder="z. B. Rollladen klemmt" autoFocus={!t && !!kunde} />}</Field>
      <div className="grid grid-cols-3 gap-3 max-md:grid-cols-1">
        <Field label="Art" error={f.art}>
          {(x) => (
            <Select name="art" value={art} onValueChange={(v) => { setArt(v); s.aenderung(); }}>
              <SelectTrigger id={x.id}><SelectValue /></SelectTrigger>
              <SelectContent>{TICKET_ARTEN.map((a) => <SelectItem key={a} value={a}>{TICKET_ART_TEXT[a]}</SelectItem>)}</SelectContent>
            </Select>
          )}
        </Field>
        <Field label="Abrechnung" error={f.abrechnung}>
          {(x) => (
            <Select name="abrechnung" value={abrechnung} onValueChange={(v) => { setAbrechnung(v); s.aenderung(); }}>
              <SelectTrigger id={x.id}><SelectValue /></SelectTrigger>
              <SelectContent>{ABRECHNUNG.map((a) => <SelectItem key={a} value={a}>{ABRECHNUNG_TEXT[a]}</SelectItem>)}</SelectContent>
            </Select>
          )}
        </Field>
        <Field label="Priorität" error={f.prioritaet}>
          {(x) => (
            <Select name="prioritaet" defaultValue={t?.prioritaet ?? "normal"} onValueChange={s.aenderung}>
              <SelectTrigger id={x.id}><SelectValue /></SelectTrigger>
              <SelectContent>{TICKET_PRIO.map((a) => <SelectItem key={a} value={a}>{TICKET_PRIO_TEXT[a]}</SelectItem>)}</SelectContent>
            </Select>
          )}
        </Field>
      </div>

      {reklamationAmAuftrag && (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-md bg-tone-amber-bg px-4 py-3 text-sm text-tone-amber-fg" data-reklamation-hinweis>
          <AlertTriangle className="size-4 shrink-0" />
          <span className="flex-1">Auftrag {auftrag.nummer} ist noch nicht abgeschlossen. Reklamationen vor dem Abschluss laufen über die Phase „Reklamation“ im Auftrag.</span>
          <Button size="sm" disabled={umleiten} onClick={() => starteUmleiten(async () => { await auftragAufReklamation(auftrag.id); })}>
            Stattdessen Auftrag auf „Reklamation“ setzen
          </Button>
        </div>
      )}

      <Field label="Problem / Beschreibung">{(x) => <Textarea {...x} name="problem" defaultValue={t?.problem ?? ""} placeholder="Was ist zu tun? Was hat der Kunde gemeldet?" />}</Field>
      <div className="grid grid-cols-3 gap-3 max-md:grid-cols-1">
        <Field label="Wunschtermin" error={f.wunschtermin}>{(x) => <Input {...x} name="wunschtermin" type="date" defaultValue={t?.wunschtermin ?? ""} />}</Field>
        <Field label="Zuständig" error={f.zustaendig_id}>
          {(x) => (
            <Select name="zustaendig_id" defaultValue={t ? (t.zustaendig_id ?? undefined) : ichId} onValueChange={s.aenderung}>
              <SelectTrigger id={x.id}><SelectValue placeholder="Niemand" /></SelectTrigger>
              <SelectContent>{benutzer.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
            </Select>
          )}
        </Field>
        <Field label="Objekt">
          {(x) => (
            <>
              <Input {...x} name="objekt" list="ticket-objekte" value={objekt} onChange={(e) => setObjekt(e.target.value)} />
              <datalist id="ticket-objekte">{adressen.map((o) => <option key={o} value={o} />)}</datalist>
            </>
          )}
        </Field>
      </div>
      {(abrechnung === "garantie" || abrechnung === "kulanz") && (
        <p className="text-xs text-muted-2">Bei {ABRECHNUNG_TEXT[abrechnung as "garantie"]} entsteht in der Regel keine Rechnung an den Kunden.</p>
      )}
      <div className="flex justify-end gap-2.5">
        <Button onClick={s.abbrechen}>Abbrechen</Button>
        <Button type="submit" variant="primary" disabled={laeuft}>{laeuft ? "Speichern …" : t ? "Speichern" : "Ticket anlegen"}</Button>
      </div>
    </Formular>
  );
}

export type BoardKarte = { id: string; nummer: string; thema: string; kunde: string; status: TicketStatus; art: string; prioritaet: TicketPrio; termin: string; auftrag: string | null; abrechnung: string; chat: number };

/** Board: Karten in eine andere Spalte ziehen ändert den Status (nicht nach „Abgerechnet“) */
export function TicketBoard({ karten }: { karten: BoardKarte[] }) {
  const [liste, setListe] = useState(karten);
  const [ziel, setZiel] = useState<TicketStatus | null>(null);
  const [fehler, setFehler] = useState<string>();
  const [, starten] = useTransition();
  const ablegen = (id: string, status: TicketStatus) => {
    const vorher = liste;
    const k = liste.find((x) => x.id === id);
    if (!k || k.status === status) return;
    if (status === "abgerechnet") {
      setFehler("„Abgerechnet“ setzt die App, sobald die Rechnung zum Ticket fertiggestellt ist.");
      return;
    }
    setListe((l) => l.map((x) => (x.id === id ? { ...x, status } : x)));
    starten(async () => {
      const r = await ticketStatusSetzen(id, status);
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
        {TICKET_STATUS.map((st) => {
          const spalte = liste.filter((k) => k.status === st);
          return (
            <section
              key={st}
              aria-label={TICKET_STATUS_TEXT[st]}
              data-status={st}
              onDragOver={(e) => { e.preventDefault(); setZiel(st); }}
              onDragLeave={() => setZiel((x) => (x === st ? null : x))}
              onDrop={(e) => { e.preventDefault(); setZiel(null); ablegen(e.dataTransfer.getData("text/plain"), st); }}
              className={cn("flex min-h-[240px] min-w-[210px] flex-1 flex-col gap-2.5 rounded-lg bg-surface-sunken p-2.5", ziel === st && "outline-2 outline-dashed outline-line-strong")}
            >
              <h2 className="flex items-center justify-between px-1.5 pt-1 text-sm font-semibold">
                <Badge tone={TICKET_STATUS_TON[st]} dot>{TICKET_STATUS_TEXT[st]}</Badge>
                <span className="text-xs text-muted-2 tabular">{spalte.length}</span>
              </h2>
              {spalte.map((k) => (
                <Link
                  key={k.id}
                  href={`/service/${k.id}`}
                  draggable
                  data-ticket={k.id}
                  onDragStart={(e) => { e.dataTransfer.setData("text/plain", k.id); e.dataTransfer.effectAllowed = "move"; }}
                  className="flex flex-col gap-2 rounded-[15px] border border-transparent bg-surface p-3.5 shadow-card transition hover:border-line-strong hover:shadow-hover"
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="font-mono text-xs text-muted">{k.nummer}</span>
                    <span className="flex items-center gap-1.5">
                      <Badge tone={k.abrechnung === "kostenpflichtig" ? "brand" : "gray"}>{ABRECHNUNG_TEXT[k.abrechnung as "garantie"]}</Badge>
                      <ChatZahl n={k.chat} />
                    </span>
                  </span>
                  <span className="text-[15px] leading-snug font-medium">{k.kunde}</span>
                  <span className="-mt-1 text-[13px] text-muted">{k.thema}</span>
                  <span className="flex flex-wrap gap-1">
                    <Badge tone="gray">{TICKET_ART_TEXT[k.art as "wartung"]}</Badge>
                    {k.auftrag && <Badge tone="gray">zu {k.auftrag}</Badge>}
                    {k.prioritaet === "hoch" && <Badge tone="red">Hoch</Badge>}
                  </span>
                  <span className="text-[13px] text-ink-3">{k.termin}</span>
                </Link>
              ))}
              {!spalte.length && <p className="px-1.5 text-xs text-muted-2">Karten hierher ziehen</p>}
            </section>
          );
        })}
      </div>
      <p className="text-xs text-muted-2">Karten per Drag & Drop in eine andere Spalte ziehen. Einen Termin bekommt ein Ticket im Service-Plan oder über „Einsatz planen“.</p>
    </div>
  );
}

/** Status ändern auf der Ticketseite (ohne „Abgerechnet“) */
export function TicketStatusAuswahl({ id, status }: { id: string; status: TicketStatus }) {
  const [fehler, setFehler] = useState<string>();
  const [laeuft, starten] = useTransition();
  return (
    <>
      <Select value={status} disabled={laeuft || status === "abgerechnet"} onValueChange={(v) => starten(async () => setFehler((await ticketStatusSetzen(id, v)).fehler))}>
        <SelectTrigger aria-label="Status ändern" className="w-[180px]"><SelectValue /></SelectTrigger>
        <SelectContent>
          {(status === "abgerechnet" ? TICKET_STATUS : TICKET_STATUS_HAND).map((x) => <SelectItem key={x} value={x}>{TICKET_STATUS_TEXT[x]}</SelectItem>)}
        </SelectContent>
      </Select>
      {fehler && <div className="basis-full"><Meldung e={{ fehler }} /></div>}
    </>
  );
}

/** Statusleiste der Ticketseite */
export function TicketStatusleiste({ status }: { status: TicketStatus }) {
  const jetzt = TICKET_STATUS.indexOf(status);
  return (
    <ol aria-label="Ticketstatus" className="flex overflow-x-auto rounded-lg border border-line-soft bg-surface px-3 py-2.5">
      {TICKET_STATUS.map((s, i) => (
        <li key={s} className="flex min-w-0 flex-1 items-center">
          <span className="flex shrink-0 items-center gap-2 px-2 py-1 text-sm whitespace-nowrap" aria-current={i === jetzt ? "step" : undefined}>
            <span className={cn("grid size-6 place-items-center rounded-full text-xs font-semibold", i < jetzt ? "bg-accent text-accent-ink" : i === jetzt ? "bg-ink text-surface" : "bg-surface-sunken text-muted-2")}>
              {i < jetzt ? <Check className="size-3.5" strokeWidth={3} /> : i + 1}
            </span>
            <span className={cn(i === jetzt ? "font-semibold" : i < jetzt ? "text-ink-3" : "text-muted")}>{TICKET_STATUS_TEXT[s]}</span>
          </span>
          {i < TICKET_STATUS.length - 1 && <span aria-hidden="true" className={cn("mx-2 h-px min-w-4 flex-1", i < jetzt ? "bg-accent" : "bg-line")} />}
        </li>
      ))}
    </ol>
  );
}

export function TicketLoeschen({ id, nummer }: { id: string; nummer: string }) {
  const [e, setE] = useState<Ergebnis>({});
  const [laeuft, starten] = useTransition();
  return (
    <>
      <Bestaetigen
        titel="Ticket löschen?"
        text={<>Ticket <b className="font-mono text-ink">{nummer}</b> wird als gelöscht markiert. Das geht nur ohne Einsätze, Zeiten und Belege.</>}
        knopf="Löschen"
        gefahr
        ausfuehren={() => starten(async () => setE((await ticketLoeschen(id)) ?? {}))}
      >
        <Button variant="danger" disabled={laeuft}>
          <Trash2 className="size-[15px]" />
          Löschen
        </Button>
      </Bestaetigen>
      {e.fehler && <div className="basis-full"><Meldung e={e} /></div>}
    </>
  );
}

export function TicketNotizFormular({ ticketId }: { ticketId: string }) {
  const [schluessel, setSchluessel] = useState(0);
  const [z, aktion, laeuft] = useActionState<Ergebnis, FormData>(async (v, fd) => {
    const r = await ticketNotiz(v, fd);
    if (r.ok) setSchluessel((k) => k + 1);
    return r;
  }, {});
  return (
    <form key={schluessel} action={aktion} className="flex flex-col gap-2">
      <input type="hidden" name="ticket_id" value={ticketId} />
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

