"use client";

import Link from "next/link";
import { Plus, Search, Trash2, X } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import { useActionState, useEffect, useRef, useState, useTransition, type CSSProperties, type ReactNode } from "react";
import { Bestaetigen } from "@/components/ui/bestaetigen";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Formular } from "@/components/ui/formular";
import { FormularDialog, neuParameterEntfernen, type FormularSteuerung } from "@/components/ui/formular-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Bezug } from "@/lib/aufgaben-status";
import { cn } from "@/lib/cn";
import { amTag, KALENDER_ART_TEXT, KALENDER_TOKEN, tagLang, type KalenderAnsicht, type KalenderEintrag, type TerminDaten } from "@/lib/kalender-text";
import { plusTage } from "@/lib/woche";
import { bezugSuchen } from "../aufgaben/aktionen";
import { terminLoeschen, terminSpeichern, type Ergebnis } from "./aktionen";

type Props = {
  ansicht: KalenderAnsicht;
  von: string;
  bis: string;
  /** Monat der Ansicht (für ausgegraute Tage außerhalb) */
  monat: string;
  heute: string;
  eintraege: KalenderEintrag[];
  feiertage: { datum: string; name: string }[];
  mitarbeiter: { id: string; name: string }[];
  /** Termin, der beim Öffnen gleich angezeigt wird (Treffer der Suche) */
  oeffnen?: string;
};

const VON_H = 6;
const BIS_H = 20;
const STUNDE = 44;
const WT = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];
const tageZwischen = (von: string, bis: string) => {
  const out: string[] = [];
  for (let d = von; d <= bis; d = plusTage(d, 1)) out.push(d);
  return out;
};
const wochenende = (d: string) => [0, 6].includes(new Date(`${d}T12:00:00Z`).getUTCDay());
const farbe = (e: KalenderEintrag): CSSProperties => {
  const t = KALENDER_TOKEN[e.art];
  return {
    background: e.beantragt ? `repeating-linear-gradient(135deg, var(--cal-${t}-bg) 0 5px, var(--surface) 5px 10px)` : e.vorgeplant ? "var(--surface)" : `var(--cal-${t}-bg)`,
    borderColor: `var(--cal-${t})`,
  };
};
const zeitText = (e: KalenderEintrag, d: string) =>
  e.ganztags ? "ganztags" : e.beginn.slice(0, 10) === d ? e.beginn.slice(11, 16) : "Fortsetzung";

/** Kalenderinhalt je Ansicht; Klick öffnet Auftrag, Ticket, Anfrage, Abwesenheit oder den Termin-Dialog */
export function KalenderInhalt(p: Props) {
  // Treffer der Suche (?termin=<id>): Termin gleich geöffnet
  const [offen, setOffen] = useState<TerminDaten | null>(() => (p.oeffnen ? (p.eintraege.find((e) => e.termin?.id === p.oeffnen)?.termin ?? null) : null));
  const pfad = usePathname();
  const params = useSearchParams();
  const tagHref = (d: string) => {
    const neu = new URLSearchParams(params);
    neu.set("ansicht", "tag");
    neu.set("datum", d);
    return `${pfad}?${neu}`;
  };
  const feiertag = new Map(p.feiertage.map((f) => [f.datum, f.name]));

  const eintrag = (e: KalenderEintrag, d: string, klein = true): ReactNode => {
    const inhalt = (
      <>
        <span className="size-2 shrink-0 rounded-full" style={{ background: `var(--cal-${KALENDER_TOKEN[e.art]})` }} aria-hidden="true" />
        <span className="shrink-0 font-mono text-[11px] text-muted">{zeitText(e, d)}</span>
        <span className="min-w-0 truncate font-medium">{e.titel}</span>
        {!klein && e.unter && <span className="min-w-0 truncate text-muted">· {e.unter}</span>}
      </>
    );
    const klasse = cn(
      "flex w-full items-center gap-1.5 rounded-sm border-l-[3px] px-1.5 py-0.5 text-left text-[12px] text-ink",
      e.vorgeplant && "border border-dashed border-l-[3px]",
    );
    const titel = [KALENDER_ART_TEXT[e.art], e.titel, e.unter, e.vorgeplant ? "vorgeplant" : ""].filter(Boolean).join(" · ");
    return e.termin ? (
      <button key={e.schluessel} type="button" data-eintrag={e.schluessel} data-art={e.art} title={titel} onClick={() => setOffen(e.termin)} className={klasse} style={farbe(e)}>
        {inhalt}
      </button>
    ) : e.href ? (
      <Link key={e.schluessel} href={e.href} data-eintrag={e.schluessel} data-art={e.art} title={titel} className={klasse} style={farbe(e)}>
        {inhalt}
      </Link>
    ) : (
      <span key={e.schluessel} data-eintrag={e.schluessel} data-art={e.art} title={titel} className={klasse} style={farbe(e)}>
        {inhalt}
      </span>
    );
  };

  let inhalt: ReactNode;
  if (p.ansicht === "monat") {
    const tage = tageZwischen(p.von, p.bis);
    const wochen = Array.from({ length: tage.length / 7 }, (_, i) => tage.slice(i * 7, i * 7 + 7));
    inhalt = (
      <div>
        <div className="grid grid-cols-7 border-b border-line text-xs font-medium text-muted-2">
          {WT.map((w) => <span key={w} className="px-2 py-2">{w}</span>)}
        </div>
        {wochen.map((w) => (
          <div key={w[0]} className="grid grid-cols-7 border-b border-line-soft last:border-b-0">
            {w.map((d) => {
              const liste = p.eintraege.filter((e) => amTag(e, d));
              const f = feiertag.get(d);
              return (
                <div
                  key={d}
                  data-tag={d}
                  className={cn(
                    "flex min-h-[112px] min-w-0 flex-col gap-1 border-l border-line-soft p-1.5 first:border-l-0",
                    d.slice(0, 7) !== p.monat && "opacity-50",
                    wochenende(d) && "bg-surface-muted",
                    f && "bg-tone-red-bg/60",
                  )}
                >
                  <div className="flex items-center gap-1.5">
                    <Link href={tagHref(d)} aria-label={`${tagLang(d)} als Tag öffnen`} className={cn("grid size-6 place-items-center rounded-full text-xs font-semibold hover:bg-surface-sunken", d === p.heute && "bg-ink text-surface hover:bg-ink")}>
                      {Number(d.slice(8, 10))}
                    </Link>
                    {f && <span className="truncate text-[11px] font-medium text-tone-red-fg" data-feiertag={d}>{f}</span>}
                  </div>
                  {liste.slice(0, 3).map((e) => eintrag(e, d))}
                  {liste.length > 3 && (
                    <Link href={tagHref(d)} className="px-1.5 text-[11.5px] text-muted hover:text-ink">+{liste.length - 3} weitere</Link>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    );
  } else if (p.ansicht === "liste") {
    const tage = tageZwischen(p.von, p.bis).filter((d) => feiertag.has(d) || p.eintraege.some((e) => amTag(e, d)));
    inhalt = tage.length ? (
      <div className="flex flex-col">
        {tage.map((d) => (
          <section key={d} className="border-b border-line-soft px-4 py-3 last:border-b-0" data-tag={d}>
            <h3 className="mb-2 flex flex-wrap items-baseline gap-2 text-sm font-semibold">
              {tagLang(d, true)}
              {d === p.heute && <span className="text-xs font-normal text-muted">heute</span>}
              {feiertag.has(d) && <span className="text-xs font-medium text-tone-red-fg">{feiertag.get(d)}</span>}
            </h3>
            <div className="flex flex-col gap-1">{p.eintraege.filter((e) => amTag(e, d)).map((e) => eintrag(e, d, false))}</div>
          </section>
        ))}
      </div>
    ) : (
      <p className="px-4 py-10 text-center text-sm text-muted">Keine Einträge in diesem Monat.</p>
    );
  } else {
    // Woche und Tag: Stundenraster 6 bis 20 Uhr, ganztägige Einträge oben
    const tage = tageZwischen(p.von, p.bis);
    const minuten = (t: string) => Number(t.slice(11, 13)) * 60 + Number(t.slice(14, 16));
    inhalt = (
      <div className="overflow-x-auto">
        <div style={{ minWidth: tage.length > 1 ? 840 : 0 }}>
          <div className="grid border-b border-line" style={{ gridTemplateColumns: `56px repeat(${tage.length}, minmax(0, 1fr))` }}>
            <span />
            {tage.map((d) => (
              <div key={d} className={cn("border-l border-line-soft px-2 py-1.5 text-sm font-semibold", feiertag.has(d) && "bg-tone-red-bg text-tone-red-fg", d === p.heute && !feiertag.has(d) && "bg-tone-brand-bg")}>
                <Link href={tagHref(d)} className="hover:underline">{tagLang(d, true).replace(/\.\d{4}$/, ".")}</Link>
                {feiertag.has(d) && <div className="truncate text-xs font-normal">{feiertag.get(d)}</div>}
                <div className="mt-1 flex flex-col gap-0.5 font-normal">{p.eintraege.filter((e) => e.ganztags && amTag(e, d)).map((e) => eintrag(e, d))}</div>
              </div>
            ))}
          </div>
          <div className="grid" style={{ gridTemplateColumns: `56px repeat(${tage.length}, minmax(0, 1fr))` }}>
            <div>
              {Array.from({ length: BIS_H - VON_H }, (_, i) => (
                <div key={i} className="pr-2 text-right text-[11px] text-muted-2 tabular" style={{ height: STUNDE }}>{VON_H + i}:00</div>
              ))}
            </div>
            {tage.map((d) => {
              const teile = p.eintraege
                .filter((e) => !e.ganztags && amTag(e, d))
                .map((e) => {
                  const a = e.beginn.slice(0, 10) === d ? minuten(e.beginn) : 0;
                  const z = e.ende.slice(0, 10) === d ? minuten(e.ende) : 24 * 60;
                  return { e, a: Math.max(a, VON_H * 60), z: Math.min(Math.max(z, a + 30), BIS_H * 60) };
                })
                .filter((t) => t.z > t.a)
                .sort((x, y) => x.a - y.a);
              const enden: number[] = [];
              const mitSpur = teile.map((t) => {
                let spur = enden.findIndex((x) => x <= t.a);
                if (spur < 0) spur = enden.push(0) - 1;
                enden[spur] = t.z;
                return { ...t, spur };
              });
              const spuren = Math.max(1, enden.length);
              return (
                <div
                  key={d}
                  data-tag={d}
                  className={cn("relative border-l border-line-soft", feiertag.has(d) && "bg-tone-red-bg/50", wochenende(d) && !feiertag.has(d) && "bg-surface-muted")}
                  style={{ height: (BIS_H - VON_H) * STUNDE, backgroundImage: `repeating-linear-gradient(to bottom, var(--line-soft) 0 1px, transparent 1px ${STUNDE}px)` }}
                >
                  {mitSpur.map(({ e, a, z, spur }) => (
                    <div
                      key={e.schluessel}
                      className="absolute overflow-hidden px-0.5"
                      style={{ top: ((a - VON_H * 60) / 60) * STUNDE, height: Math.max(((z - a) / 60) * STUNDE - 2, 20), left: `${(spur / spuren) * 100}%`, width: `${100 / spuren}%` }}
                    >
                      <div className="h-full [&>*]:h-full [&>*]:items-start">{eintrag(e, d, p.ansicht === "tag")}</div>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {inhalt}
      {offen && <TerminDialog key={offen.id} termin={offen} mitarbeiter={p.mitarbeiter} heute={p.heute} beiSchliessen={() => { setOffen(null); neuParameterEntfernen(); }} />}
    </>
  );
}

/** Neuer Termin (Knopf „+ Termin“ im Kopf) */
export function NeuerTermin({ mitarbeiter, datum }: { mitarbeiter: { id: string; name: string }[]; datum: string }) {
  return (
    <TerminDialog
      mitarbeiter={mitarbeiter}
      heute={datum}
      ausloeser={
        <Button variant="primary">
          <Plus className="size-[15px]" strokeWidth={2.2} />
          Termin
        </Button>
      }
    />
  );
}

type TerminProps = { termin?: TerminDaten; mitarbeiter: { id: string; name: string }[]; heute: string; ausloeser?: ReactNode; beiSchliessen?: () => void };

/** Termin (Beratung, Intern) anlegen, bearbeiten, löschen */
function TerminDialog(p: TerminProps) {
  return (
    <FormularDialog titel={p.termin ? "Termin bearbeiten" : "Neuer Termin"} breit ausloeser={p.ausloeser} beiSchliessen={p.beiSchliessen}>
      {(s) => <TerminFormular {...p} s={s} />}
    </FormularDialog>
  );
}

function TerminFormular({ termin: t, mitarbeiter, heute, s }: TerminProps & { s: FormularSteuerung }) {
  const [z, aktion, laeuft] = useActionState<Ergebnis, FormData>(async (v, fd) => {
    const r = await terminSpeichern(v, fd);
    if (r.ok) s.fertig();
    return r;
  }, {});
  const [bezug, setBezug] = useState<Bezug | null>(t?.bezug ?? null);
  const [art, setArt] = useState<string>(t?.art ?? "beratung");
  const [loeschFehler, setLoeschFehler] = useState<string>();
  const [loescht, loeschen] = useTransition();
  const f = z.felder ?? {};
  return (
    <Formular aktion={aktion} onInput={s.aenderung} className="flex flex-col gap-4">
      {t && <input type="hidden" name="id" value={t.id} />}
      <input type="hidden" name="bezug_art" value={bezug?.art ?? ""} />
      <input type="hidden" name="bezug_id" value={bezug?.id ?? ""} />
      {(z.fehler || loeschFehler) && <p role="alert" className="rounded-md bg-tone-red-bg px-3.5 py-2.5 text-sm text-tone-red-fg">{z.fehler ?? loeschFehler}</p>}
      <div className="grid grid-cols-[minmax(0,1fr)_180px] gap-3 max-md:grid-cols-1">
        <Field label="Titel *" error={f.titel}>{(x) => <Input {...x} name="titel" defaultValue={t?.titel} placeholder="z. B. Beratung Haustür" autoFocus={!t} />}</Field>
        <Field label="Art" error={f.art}>
          {(x) => (
            <Select name="art" value={art} onValueChange={(v) => { setArt(v); s.aenderung(); }}>
              <SelectTrigger id={x.id}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="beratung">Beratung</SelectItem>
                <SelectItem value="intern">Intern</SelectItem>
              </SelectContent>
            </Select>
          )}
        </Field>
      </div>
      <div className="grid grid-cols-3 gap-3 max-md:grid-cols-1">
        <Field label="Datum *" error={f.datum}>{(x) => <Input {...x} name="datum" type="date" defaultValue={t?.datum ?? heute} />}</Field>
        <Field label="Beginn *" error={f.beginn}>{(x) => <Input {...x} name="beginn" type="time" step={300} defaultValue={t?.beginn ?? "10:00"} />}</Field>
        <Field label="Ende *" error={f.ende}>{(x) => <Input {...x} name="ende" type="time" step={300} defaultValue={t?.ende ?? "11:00"} />}</Field>
      </div>
      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1.5 text-sm font-medium text-ink-3">Mitarbeiter</legend>
        <div className="flex flex-wrap gap-2">
          {mitarbeiter.map((m) => (
            <label key={m.id} className="flex cursor-pointer items-center gap-2 rounded-full border border-line px-3 py-1.5 text-sm has-[:checked]:border-ink has-[:checked]:bg-surface-sunken">
              <input type="checkbox" name="mitarbeiter" value={m.id} defaultChecked={t?.mitarbeiter.includes(m.id)} className="size-4 [accent-color:var(--ink)]" />
              {m.name}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-ink-3">Bezug (optional)</span>
        {bezug ? (
          <div className="flex h-[42px] items-center justify-between gap-2 rounded-md border border-line bg-surface-muted px-[13px]">
            <span className="min-w-0 truncate"><span className="text-xs text-muted-2">{bezug.art === "kunde" ? "Kunde" : bezug.art === "anfrage" ? "Anfrage" : "Auftrag"} · </span>{bezug.text}</span>
            <Button size="xs" variant="ghost" onClick={() => { setBezug(null); s.aenderung(); }}>Entfernen</Button>
          </div>
        ) : (
          <BezugAuswahl onWahl={(b) => { setBezug(b); s.aenderung(); }} fehler={f.bezug} />
        )}
      </div>
      <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1">
        <Field label="Ort">{(x) => <Input {...x} name="ort" defaultValue={t?.ort ?? ""} />}</Field>
        <Field label="Notiz">{(x) => <Textarea {...x} name="notiz" defaultValue={t?.notiz ?? ""} className="min-h-[42px]" />}</Field>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <span>
          {t && (
            <Bestaetigen
              titel="Termin löschen?"
              text={<><b className="text-ink">{t.titel}</b> wird als gelöscht markiert und verschwindet aus dem Kalender.</>}
              knopf="Löschen"
              gefahr
              ausfuehren={() =>
                loeschen(async () => {
                  const r = await terminLoeschen(t.id);
                  if (r.ok) s.fertig();
                  else setLoeschFehler(r.fehler);
                })
              }
            >
              <Button variant="danger" disabled={loescht}>
                <Trash2 className="size-[15px]" />
                Löschen
              </Button>
            </Bestaetigen>
          )}
        </span>
        <span className="flex gap-2.5">
          <Button onClick={s.abbrechen}>Abbrechen</Button>
          <Button type="submit" variant="primary" disabled={laeuft}>{laeuft ? "Speichern …" : t ? "Speichern" : "Termin anlegen"}</Button>
        </span>
      </div>
    </Formular>
  );
}

function BezugAuswahl({ onWahl, fehler }: { onWahl: (b: Bezug) => void; fehler?: string }) {
  const [q, setQ] = useState("");
  const [treffer, setTreffer] = useState<Bezug[]>([]);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const suchen = (wert: string) => {
    setQ(wert);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(async () => setTreffer(wert.trim().length >= 2 ? (await bezugSuchen(wert)).filter((b) => b.art !== "ticket") : []), 250);
  };
  return (
    <div className="relative">
      <label className={cn("flex h-[42px] items-center gap-2 rounded-md border bg-surface px-[13px]", fehler ? "border-tone-red-fg" : "border-line")}>
        <Search className="size-4 text-muted-2" aria-hidden="true" />
        <input aria-label="Bezug suchen" value={q} onChange={(e) => suchen(e.target.value)} placeholder="Kunde, Anfrage oder Auftrag suchen …" className="min-w-0 flex-1 bg-transparent outline-none" />
        {q && (
          <button type="button" aria-label="Suche leeren" onClick={() => suchen("")} className="text-muted-2">
            <X className="size-4" />
          </button>
        )}
      </label>
      {treffer.length > 0 && (
        <ul id="termin-bezug-treffer" role="listbox" className="absolute top-[46px] right-0 left-0 z-10 max-h-64 overflow-y-auto rounded-md border border-line-soft bg-surface p-1 shadow-pop">
          {treffer.map((b) => (
            <li key={`${b.art}-${b.id}`} role="option" aria-selected={false}>
              <button type="button" onClick={() => { onWahl(b); setTreffer([]); setQ(""); }} className="flex w-full items-baseline gap-2 rounded-sm px-3 py-2 text-left hover:bg-canvas">
                <span className="text-xs text-muted-2">{b.art === "kunde" ? "Kunde" : b.art === "anfrage" ? "Anfrage" : "Auftrag"}</span>
                <span>{b.text}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {fehler && <small className="mt-1 block text-xs text-tone-red-fg">{fehler}</small>}
    </div>
  );
}
