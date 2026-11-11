"use client";

import { ClipboardCheck, FileText, Printer, Ruler, Trash2, Upload, Wrench } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { dateiHochladen } from "@/components/app/ablage-upload";
import { Bestaetigen } from "@/components/ui/bestaetigen";
import { Button } from "@/components/ui/button";
import { FORMULAR_TEXT, type FormularTyp } from "@/lib/formular-logik";
import { aufmassAnlegen, aufmassInAngebot, formularEntfernen, protokollDrucken } from "./aktionen";

type Bezug = { anfrage_id?: string; auftrag_id?: string; ticket_id?: string };

const SYMBOL: Record<FormularTyp, typeof Ruler> = { aufmass: Ruler, montageprotokoll: ClipboardCheck, servicebericht: Wrench, uebergabeprotokoll: FileText };

function Meldung({ text }: { text?: string }) {
  return text ? <p role="alert" className="w-full text-xs text-tone-red-fg">{text}</p> : null;
}

/** „Aufmaßblatt ausfüllen“: legt das Aufmaß an und öffnet den Editor */
export function AufmassNeu({ bezug, text = "Aufmaßblatt ausfüllen", dunkel = true }: { bezug: Bezug; text?: string; dunkel?: boolean }) {
  const router = useRouter();
  const [laeuft, starten] = useTransition();
  const [fehler, setFehler] = useState<string>();
  return (
    <>
      <Button
        size="sm"
        variant={dunkel ? "primary" : "secondary"}
        disabled={laeuft}
        data-aufmass-neu
        onClick={() =>
          starten(async () => {
            const r = await aufmassAnlegen(bezug);
            if (r.id) router.push(`/formulare/${r.id}`);
            else setFehler(r.fehler);
          })
        }
      >
        <Ruler className="size-4" /> {text}
      </Button>
      <Meldung text={fehler} />
    </>
  );
}

/** „Montageprotokoll drucken“ usw.: legt das Protokoll an (Status „Gedruckt“) und öffnet die Vorlage als PDF */
export function ProtokollDrucken({ typ, bezug }: { typ: FormularTyp; bezug: Bezug }) {
  const [laeuft, starten] = useTransition();
  const [fehler, setFehler] = useState<string>();
  const Symbol = SYMBOL[typ];
  return (
    <>
      <Button
        size="sm"
        disabled={laeuft}
        data-protokoll-drucken={typ}
        onClick={() => {
          // Fenster sofort öffnen (sonst blockt der Browser das Pop-up nach der Server-Antwort)
          const fenster = window.open("", "_blank");
          starten(async () => {
            const r = await protokollDrucken(typ, bezug);
            if (!r.id) {
              fenster?.close();
              return setFehler(r.fehler);
            }
            if (fenster) fenster.location.href = `/pdf/formular/${r.id}`;
          });
        }}
      >
        <Symbol className="size-4" /> {FORMULAR_TEXT[typ]} drucken
      </Button>
      <Meldung text={fehler} />
    </>
  );
}

/** „In Angebot übernehmen“: an der Anfrage direkt, am Auftrag als Nachtragsangebot */
export function InAngebot({ id, klein = true, vorher }: { id: string; klein?: boolean; vorher?: () => Promise<boolean> }) {
  const router = useRouter();
  const [laeuft, starten] = useTransition();
  const [fehler, setFehler] = useState<string>();
  return (
    <>
      <Button
        size={klein ? "xs" : "sm"}
        disabled={laeuft}
        data-aufmass-angebot
        onClick={() =>
          starten(async () => {
            if (vorher && !(await vorher())) return;
            const r = await aufmassInAngebot(id);
            if (r.href) router.push(r.href);
            else setFehler(r.fehler);
          })
        }
      >
        In Angebot übernehmen
      </Button>
      <Meldung text={fehler} />
    </>
  );
}

/** Scan des unterschriebenen Protokolls hochladen (Unterordner und Dateiname bestimmt der Server) */
export function ScanHochladen({ id }: { id: string }) {
  const router = useRouter();
  const datei = useRef<HTMLInputElement>(null);
  const [laeuft, starten] = useTransition();
  const [meldung, setMeldung] = useState<{ fehler?: string; ok?: string }>({});
  return (
    <>
      <input
        ref={datei}
        type="file"
        className="sr-only"
        tabIndex={-1}
        aria-label="Scan des unterschriebenen Protokolls"
        accept=".pdf,.jpg,.jpeg,.png,.heic"
        data-scan-datei={id}
        onChange={() =>
          starten(async () => {
            const f = datei.current?.files?.[0];
            if (!f) return;
            setMeldung({});
            const r = await dateiHochladen(f, { formular_id: id });
            setMeldung(r.fehler ? { fehler: r.fehler } : { ok: r.hinweis });
            if (datei.current) datei.current.value = "";
            router.refresh();
          })
        }
      />
      <Button size="xs" disabled={laeuft} onClick={() => datei.current?.click()} data-scan-hochladen={id}>
        <Upload className="size-3.5" /> {laeuft ? "Lädt …" : "Scan hochladen"}
      </Button>
      {meldung.fehler && <p role="alert" className="w-full text-right text-xs text-tone-red-fg">{meldung.fehler}</p>}
      {meldung.ok && <p role="status" className="w-full text-right text-xs text-tone-green-fg">{meldung.ok}</p>}
    </>
  );
}

/** Vorlage bzw. PDF öffnen */
export function PdfOeffnen({ id, text }: { id: string; text: string }) {
  return (
    <Button size="xs" asChild>
      <a href={`/pdf/formular/${id}`} target="_blank" rel="noopener" data-formular-pdf={id}>
        <Printer className="size-3.5" /> {text}
      </a>
    </Button>
  );
}

/** Formular entfernen (Aufmaß im Entwurf, Protokoll ohne Scan): Markierung als gelöscht */
export function FormularEntfernen({ id, typ }: { id: string; typ: FormularTyp }) {
  const [laeuft, starten] = useTransition();
  const [fehler, setFehler] = useState<string>();
  return (
    <>
      <Bestaetigen
        titel={`${FORMULAR_TEXT[typ]} entfernen?`}
        text={typ === "aufmass" ? "Das Aufmaß im Entwurf wird mit allen Zeilen entfernt." : "Das gedruckte Protokoll wird aus der Liste entfernt."}
        knopf="Entfernen"
        gefahr
        ausfuehren={() => starten(async () => setFehler((await formularEntfernen(id)).fehler))}
      >
        <Button size="xs" variant="ghost" disabled={laeuft} aria-label={`${FORMULAR_TEXT[typ]} entfernen`} data-formular-entfernen={id}>
          <Trash2 className="size-3.5" />
        </Button>
      </Bestaetigen>
      <Meldung text={fehler} />
    </>
  );
}
