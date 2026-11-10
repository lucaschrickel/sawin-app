"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Maximize2 } from "lucide-react";
import { useState, useTransition } from "react";
import { Bestaetigen } from "@/components/ui/bestaetigen";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { cn } from "@/lib/cn";
import { BELEGART_KURZ, type BelegKurz, type Schritt } from "@/lib/belege-status";
import { angebotStatus, belegUebergeben, belegVerwerfen, lexwarePdfHolen, nachtragAnlegen, tagsKommentarSpeichern } from "./aktionen";
import { TagEingabe } from "./editor";

/** Sprungleiste der Kette: aktueller Beleg dunkel, Entwürfe gestrichelt, abgelehnte durchgestrichen */
export function KettenLeiste({ kette, aktuell }: { kette: BelegKurz[]; aktuell: string }) {
  if (kette.length < 2) return null;
  return (
    <nav aria-label="Belegkette" className="flex flex-wrap items-center gap-1.5 text-[12.5px]" data-kette>
      {kette.map((b, i) => (
        <span key={b.id} className="inline-flex items-center gap-1.5">
          {i > 0 && <span className="text-muted-2">›</span>}
          <Link
            href={`/beleg/${b.id}`}
            aria-current={b.id === aktuell ? "page" : undefined}
            className={cn(
              "rounded-full border px-2.5 py-0.5 font-mono",
              b.id === aktuell ? "border-ink bg-ink text-surface" : "border-line bg-surface hover:border-line-strong",
              b.status === "entwurf" && b.id !== aktuell && "border-dashed text-muted",
              ["abgelehnt", "nicht_beauftragt"].includes(b.status) && "line-through opacity-70",
            )}
          >
            {BELEGART_KURZ[b.art]} {b.nummer ?? "Entwurf"}
          </Link>
        </span>
      ))}
    </nav>
  );
}

/** Knöpfe „Nächster Schritt“: Links öffnen den Editor, Angebots-Schritte ändern den Status */
export function SchrittKnoepfe({ schritte, belegId, klein }: { schritte: Schritt[]; belegId?: string; klein?: boolean }) {
  const router = useRouter();
  const [laeuft, starte] = useTransition();
  const [fehler, setFehler] = useState<string | null>(null);
  const [verloren, setVerloren] = useState<string | null>(null);
  if (!schritte.length) return null;
  return (
    <>
      <div className="flex flex-wrap items-center gap-2" data-schritte>
        {schritte.map((s) =>
          s.href ? (
            <Button key={s.text} asChild size={klein ? "xs" : "sm"} variant={s.ton === "primary" ? "primary" : "secondary"}>
              <Link href={s.href}>
                {s.text}
                {s.ton === "primary" && <ArrowRight className="size-3.5" />}
              </Link>
            </Button>
          ) : (
            <Button
              key={s.text}
              size={klein ? "xs" : "sm"}
              variant={s.ton === "primary" ? "primary" : s.ton === "danger" ? "danger" : "secondary"}
              disabled={laeuft}
              data-schritt={s.aktion}
              onClick={() =>
                starte(async () => {
                  setFehler(null);
                  const r = await angebotStatus(belegId!, s.aktion!);
                  if (r.fehler) return setFehler(r.fehler);
                  if (r.frage === "anfrage_verloren" && r.anfrageId) setVerloren(r.anfrageId);
                  router.refresh();
                })
              }
            >
              {s.text}
            </Button>
          ),
        )}
      </div>
      {fehler && <p role="alert" className="mt-2 text-sm text-tone-red-fg">{fehler}</p>}
      <Dialog open={!!verloren} onOpenChange={(o) => !o && setVerloren(null)}>
        <DialogContent title="Alle Angebote abgelehnt">
          <p className="text-base text-ink-3">Alle Angebote dieser Anfrage sind abgelehnt. Soll die Anfrage als verloren archiviert werden?</p>
          <div className="flex justify-end gap-2.5 pt-5">
            <Button onClick={() => setVerloren(null)}>Nein</Button>
            <Button asChild variant="primary">
              <Link href={`/anfragen/${verloren}`}>Zur Anfrage</Link>
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Angebot zurück auf „Offen“ (Annahme oder Ablehnung zurücknehmen, solange keine AB existiert) */
export function AngebotZuruecksetzen({ id }: { id: string }) {
  const router = useRouter();
  const [laeuft, starte] = useTransition();
  return (
    <Button
      size="sm"
      variant="ghost"
      disabled={laeuft}
      onClick={() =>
        starte(async () => {
          await angebotStatus(id, "offen");
          router.refresh();
        })
      }
    >
      Zurück auf „Offen“
    </Button>
  );
}

/** „Als übergeben markieren“: friert die aktuelle Version ein */
export function UebergebenKnopf({ id, version }: { id: string; version: number }) {
  const router = useRouter();
  const [laeuft, starte] = useTransition();
  const [meldung, setMeldung] = useState<string | null>(null);
  return (
    <div>
      <Button
        size="sm"
        className="w-full"
        disabled={laeuft}
        data-aktion="uebergeben"
        onClick={() =>
          starte(async () => {
            const r = await belegUebergeben(id);
            setMeldung(r.fehler ?? r.hinweis ?? null);
            router.refresh();
          })
        }
      >
        Als übergeben markieren
      </Button>
      <p className="mt-1.5 text-xs text-muted-2">{meldung ?? `Friert Version ${version} ein (Post, persönlich). Bearbeiten legt danach Version ${version + 1} an, die Nummer bleibt.`}</p>
    </div>
  );
}

/** Original-PDF eines Lexware-Belegs (erneut) bei Lexware abholen */
export function LexwarePdfKnopf({ id }: { id: string }) {
  const router = useRouter();
  const [laeuft, starte] = useTransition();
  const [meldung, setMeldung] = useState<string | null>(null);
  return (
    <div>
      <Button
        size="sm"
        className="w-full"
        disabled={laeuft}
        data-aktion="lexware-pdf"
        onClick={() =>
          starte(async () => {
            const r = await lexwarePdfHolen(id);
            setMeldung(r.fehler ?? null);
            router.refresh();
          })
        }
      >
        PDF von Lexware holen
      </Button>
      {meldung && <p className="mt-1.5 text-xs text-tone-red-fg">{meldung}</p>}
    </div>
  );
}

/** Tags und interner Kommentar (auch nach dem Fertigstellen änderbar) */
export function TagsKommentar({ id, tags, kommentar, vorschlaege }: { id: string; tags: string[]; kommentar: string; vorschlaege: string[] }) {
  const router = useRouter();
  const [t, setT] = useState(tags);
  const [k, setK] = useState(kommentar);
  const [laeuft, starte] = useTransition();
  const [meldung, setMeldung] = useState<string | null>(null);
  const geaendert = k !== kommentar || t.join("|") !== tags.join("|");
  return (
    <div className="flex flex-col gap-3" data-tags-kommentar>
      <div>
        <div className="mb-1.5 text-xs font-medium text-muted-2">Tags · nur intern</div>
        <TagEingabe tags={t} vorschlaege={vorschlaege} onChange={setT} />
      </div>
      <div>
        <div className="mb-1.5 text-xs font-medium text-muted-2">Interner Kommentar</div>
        <textarea
          rows={3}
          aria-label="Interner Kommentar"
          className="w-full rounded-sm border border-line bg-surface px-2.5 py-2 text-[14px] outline-none focus:border-(--focus-ring)"
          value={k}
          onChange={(e) => setK(e.target.value)}
        />
        <p className="mt-1 text-xs text-muted-2">Nicht auf dem PDF, geht nicht an Lexware.</p>
      </div>
      {geaendert && (
        <Button
          size="sm"
          variant="primary"
          disabled={laeuft}
          onClick={() =>
            starte(async () => {
              const r = await tagsKommentarSpeichern(id, t, k);
              setMeldung(r.fehler ?? "Gespeichert.");
              router.refresh();
            })
          }
        >
          Speichern
        </Button>
      )}
      {meldung && !geaendert && <p className="text-xs text-muted-2">{meldung}</p>}
    </div>
  );
}

/** Verkleinerte PDF-Vorschau; Klick vergrößert */
export function PdfKachel({ src, titel, hoehe = 250 }: { src: string; titel: string; hoehe?: number }) {
  const [gross, setGross] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setGross(true)}
        aria-label={`${titel} vergrößern`}
        className="group relative block w-full overflow-hidden rounded-md border border-line bg-surface-sunken"
        style={{ height: hoehe }}
        data-pdf-kachel
      >
        <iframe title={titel} src={`${src}#toolbar=0&navpanes=0&view=FitH`} className="pointer-events-none h-[340%] w-[340%] origin-top-left scale-[0.294]" tabIndex={-1} />
        <span className="absolute top-2 right-2 inline-flex size-7 items-center justify-center rounded-full bg-surface/90 text-ink opacity-0 shadow-sm group-hover:opacity-100">
          <Maximize2 className="size-3.5" />
        </span>
      </button>
      <Dialog open={gross} onOpenChange={setGross}>
        <DialogContent title={titel} wide className="max-w-[920px]">
          {gross && <iframe title={titel} src={src} className="h-[78vh] w-full rounded-md border border-line" />}
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Entwurf verwerfen (Vorschau-Leiste) */
export function VerwerfenKnopf({ id, nummer, art, kompakt, danach }: { id: string; nummer: string | null; art: string; kompakt?: boolean; danach?: string }) {
  const router = useRouter();
  const [laeuft, starte] = useTransition();
  return (
    <Bestaetigen
      titel="Entwurf verwerfen?"
      text={art === "angebot" && nummer ? `Der Entwurf wird verworfen. Seine Nummer ${nummer} wird nicht wiederverwendet.` : "Der Entwurf wird verworfen. Er hat noch keine Nummer."}
      knopf="Verwerfen"
      gefahr
      ausfuehren={() =>
        starte(async () => {
          const r = await belegVerwerfen(id);
          if (r.fehler) return;
          if (danach) router.replace(danach);
          else router.refresh();
        })
      }
    >
      {kompakt ? (
        <button type="button" disabled={laeuft} aria-label="Entwurf verwerfen" title="Entwurf verwerfen" className="inline-flex size-8 items-center justify-center rounded-full text-muted hover:bg-surface-sunken hover:text-tone-red-fg">
          <TrashIcon />
        </button>
      ) : (
        <Button size="sm" variant="danger" disabled={laeuft}>
          Verwerfen
        </Button>
      )}
    </Bestaetigen>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
    </svg>
  );
}

/** „Nachtragsangebot“: legt die Nachtragsanfrage an und öffnet den Angebots-Editor */
export function NachtragKnopf({ auftragId }: { auftragId: string }) {
  const router = useRouter();
  const [laeuft, starte] = useTransition();
  return (
    <button
      type="button"
      disabled={laeuft}
      className="w-full px-3 py-2 text-left text-sm hover:bg-surface-muted"
      onClick={() =>
        starte(async () => {
          const r = await nachtragAnlegen(auftragId);
          if (r.id) router.push(`/beleg/neu?art=angebot&anfrage=${r.id}`);
        })
      }
    >
      <span className="block font-medium">Nachtragsangebot</span>
      <span className="block text-xs text-muted-2">Wird nach Annahme ein eigener Auftrag</span>
    </button>
  );
}

/** „Beleg erstellen“ am Auftrag: nur Belege, die in der Lage möglich sind; öffnet direkt den Editor */
export function BelegErstellenMenue({ eintraege, auftragId }: { eintraege: { text: string; sub: string; href: string }[]; auftragId: string }) {
  const [offen, setOffen] = useState(false);
  return (
    <span className="relative">
      <button type="button" aria-expanded={offen} onClick={() => setOffen((o) => !o)} className="inline-flex items-center gap-1 rounded-full border border-line px-3 py-1 text-sm font-medium hover:border-line-strong" data-beleg-erstellen>
        + Beleg
      </button>
      {offen && (
        <div className="absolute top-full right-0 z-20 mt-1 w-72 overflow-hidden rounded-md border border-line bg-surface py-1 shadow-pop" onMouseLeave={() => setOffen(false)}>
          {eintraege.map((e) => (
            <Link key={e.text} href={e.href} className="block px-3 py-2 hover:bg-surface-muted">
              <span className="block text-sm font-medium">{e.text}</span>
              <span className="block text-xs text-muted-2">{e.sub}</span>
            </Link>
          ))}
          <NachtragKnopf auftragId={auftragId} />
        </div>
      )}
    </span>
  );
}
