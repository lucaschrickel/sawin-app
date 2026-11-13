"use client";

import { useActionState, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Formular } from "@/components/ui/formular";
import { jetztNachladen, verbindungSpeichern } from "../../ablage/aktionen";
import { bccSpeichern, fremdbelegeJetztPruefen, stichtagSpeichern, type Ergebnis } from "./aktionen";

const Meldung = ({ e }: { e: { fehler?: string; hinweis?: string; ok?: boolean } }) =>
  e.fehler ? (
    <p role="alert" className="rounded-md bg-tone-red-bg px-3.5 py-2.5 text-sm text-tone-red-fg">{e.fehler}</p>
  ) : e.hinweis ? (
    <p role="status" className="rounded-md bg-tone-green-bg px-3.5 py-2.5 text-sm text-tone-green-fg">{e.hinweis}</p>
  ) : null;

/** OneDrive: Website-ID, Bibliotheks-ID und Basisordner prüfen und speichern */
export function OneDriveFormular({ start, admin, eingerichtet }: { start: { site_id: string; liste_id: string; basis_pfad: string }; admin: boolean; eingerichtet: boolean }) {
  const [z, aktion, laeuft] = useActionState(verbindungSpeichern, {});
  const [pfad, setPfad] = useState(start.basis_pfad || "_App-Test");
  return (
    <Formular aktion={aktion} className="flex flex-col gap-3" data-onedrive-formular>
      <Meldung e={z} />
      <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1">
        <Field label="Website-ID (SharePoint)" hint="z. B. sawin.sharepoint.com,1234…,5678…">{(p) => <Input {...p} name="site_id" defaultValue={start.site_id} disabled={!admin} autoComplete="off" />}</Field>
        <Field label="Bibliotheks-ID (Liste)" hint="ID der Dokumentbibliothek, für die die App freigegeben ist">{(p) => <Input {...p} name="liste_id" defaultValue={start.liste_id} disabled={!admin} autoComplete="off" />}</Field>
      </div>
      <Field label="Basisordner" hint="Darin entstehen die Vorgangsordner. Zum Testen „_App-Test“; fehlende Ordner legt die App an.">
        {(p) => <Input {...p} name="basis_pfad" value={pfad} onChange={(e) => setPfad(e.target.value)} disabled={!admin} />}
      </Field>
      {admin && (
        <div className="flex flex-wrap items-center gap-2.5">
          <Button type="submit" variant="primary" disabled={laeuft || !eingerichtet}>{laeuft ? "Prüfe …" : "Prüfen und speichern"}</Button>
          <Button onClick={() => setPfad("_App-Test")} disabled={pfad === "_App-Test"}>Testordner „_App-Test“</Button>
        </div>
      )}
    </Formular>
  );
}

export function NachladenKnopf({ offen }: { offen: number }) {
  const [e, setE] = useState<{ fehler?: string; hinweis?: string }>({});
  const [laeuft, starten] = useTransition();
  return (
    <div className="flex flex-col gap-2">
      <Button size="sm" disabled={laeuft || !offen} onClick={() => starten(async () => setE(await jetztNachladen()))} data-nachladen>
        {laeuft ? "Überträgt …" : "Jetzt übertragen"}
      </Button>
      <Meldung e={e} />
    </div>
  );
}

const ART_TEXT: Record<string, string> = {
  angebot: "Angebot",
  auftragsbestaetigung: "Auftragsbestätigung",
  teil_ab: "Teil-Auftragsbestätigung",
  lieferschein: "Lieferschein",
  abschlagsrechnung: "Abschlagsrechnung",
  rechnung: "Rechnung",
  zahlungsbestaetigung: "Zahlungsbestätigung",
  gutschrift: "Gutschrift",
};

/** Go-live-Datum: ab diesem Tag entstehen Angebote, ABs und Lieferscheine nur noch in der App */
export function StichtagFormular({ wert, admin }: { wert: string | null; admin: boolean }) {
  const [z, aktion, laeuft] = useActionState<Ergebnis, FormData>(stichtagSpeichern, {});
  return (
    <Formular aktion={aktion} className="flex flex-wrap items-end gap-3" data-stichtag-formular>
      <Field label="Go-live-Datum (Stichtag)" error={z.felder?.golive_datum}>
        {(p) => <Input {...p} type="date" name="golive_datum" defaultValue={wert ?? ""} disabled={!admin} className="w-[180px]" />}
      </Field>
      {admin && (
        <Button type="submit" variant="secondary" disabled={laeuft}>
          Speichern
        </Button>
      )}
      {z.fehler && <p role="alert" className="w-full rounded-md bg-tone-red-bg px-3.5 py-2.5 text-sm text-tone-red-fg">{z.fehler}</p>}
      {z.ok && <p role="status" className="w-full rounded-md bg-tone-green-bg px-3.5 py-2.5 text-sm text-tone-green-fg">Gespeichert und Lexware geprüft.</p>}
    </Formular>
  );
}

/** Lexware sofort auf Belege nach dem Stichtag prüfen (nur lesend) */
export function FremdbelegeKnopf() {
  const [laeuft, start] = useTransition();
  const [fehler, setFehler] = useState<string | null>(null);
  return (
    <span className="inline-flex items-center gap-2">
      <Button
        variant="ghost"
        size="sm"
        disabled={laeuft}
        data-fremdbelege-pruefen
        onClick={() =>
          start(async () => {
            const r = await fremdbelegeJetztPruefen();
            setFehler(r.fehler ?? null);
          })
        }
      >
        {laeuft ? "Prüft …" : "Jetzt prüfen"}
      </Button>
      {fehler && <span role="alert" className="text-sm text-tone-red-fg">{fehler}</span>}
    </span>
  );
}

/** Interne Kopie (BCC) je Belegart */
export function BccFormular({ werte, admin }: { werte: Record<string, string>; admin: boolean }) {
  const [z, aktion, laeuft] = useActionState<Ergebnis, FormData>(bccSpeichern, {});
  return (
    <Formular aktion={aktion} className="flex flex-col gap-3" data-bcc-formular>
      {z.fehler && <p role="alert" className="rounded-md bg-tone-red-bg px-3.5 py-2.5 text-sm text-tone-red-fg">{z.fehler}</p>}
      {z.ok && <p role="status" className="rounded-md bg-tone-green-bg px-3.5 py-2.5 text-sm text-tone-green-fg">Gespeichert.</p>}
      <div className="grid grid-cols-2 gap-x-3 gap-y-2.5 max-md:grid-cols-1">
        {Object.entries(ART_TEXT).map(([art, text]) => (
          <Field key={art} label={text} error={z.felder?.[`bcc_${art}`]}>
            {(p) => <Input {...p} type="email" name={`bcc_${art}`} defaultValue={werte[art] ?? ""} placeholder="leer = keine Kopie" disabled={!admin} />}
          </Field>
        ))}
      </div>
      {admin && (
        <div>
          <Button type="submit" variant="primary" disabled={laeuft}>Speichern</Button>
        </div>
      )}
    </Formular>
  );
}
