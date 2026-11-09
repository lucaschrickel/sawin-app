"use client";

import { Trash2 } from "lucide-react";
import { useActionState, useState, useTransition } from "react";
import { ListenSuche, useListenParameter } from "@/components/app/listen-suche";
import { Bestaetigen } from "@/components/ui/bestaetigen";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";
import { konditionenSpeichern, kundeLoeschen, type Ergebnis } from "./aktionen";

export function KundenSuche({ wert }: { wert: string }) {
  return <ListenSuche wert={wert} label="Kunden durchsuchen" platzhalter="Name, Nummer, Ort, Telefon …" />;
}

export function HerkunftFilter({ wert, liste }: { wert: string; liste: string[] }) {
  const setze = useListenParameter();
  return (
    <select
      aria-label="Nach Herkunft filtern"
      value={wert}
      onChange={(e) => setze({ herkunft: e.target.value })}
      className="h-[42px] rounded-md border border-line bg-surface px-3 text-sm text-ink"
    >
      <option value="">Alle Herkünfte</option>
      {liste.map((h) => (
        <option key={h} value={h}>{h}</option>
      ))}
    </select>
  );
}

export function KundeLoeschen({ id, name }: { id: string; name: string }) {
  const [fehler, setFehler] = useState<string>();
  const [laeuft, starten] = useTransition();
  return (
    <>
      <Bestaetigen
        titel="Kunde löschen?"
        text={
          <>
            <b className="text-ink">{name}</b> wird als gelöscht markiert und verschwindet aus allen Listen. Die Daten bleiben
            im Protokoll erhalten. Kunden mit Anfragen, Aufträgen, Belegen oder Service-Tickets lassen sich nicht löschen.
          </>
        }
        knopf="Löschen"
        gefahr
        ausfuehren={() => starten(async () => setFehler((await kundeLoeschen(id))?.fehler))}
      >
        <Button variant="danger" disabled={laeuft}>
          <Trash2 className="size-[15px]" />
          Löschen
        </Button>
      </Bestaetigen>
      {fehler && (
        <p role="alert" className="basis-full rounded-md bg-tone-red-bg px-3.5 py-2.5 text-sm text-tone-red-fg">
          {fehler}
        </p>
      )}
    </>
  );
}

export function KonditionenFormular({ kundeId, text }: { kundeId: string; text: string }) {
  const [geaendert, setGeaendert] = useState(false);
  const [z, aktion, laeuft] = useActionState<Ergebnis, FormData>(async (vorher, fd) => {
    const r = await konditionenSpeichern(vorher, fd);
    if (r.ok) setGeaendert(false);
    return r;
  }, {});
  return (
    <form action={aktion} onInput={() => setGeaendert(true)} className="flex flex-col gap-2.5">
      <input type="hidden" name="kunde_id" value={kundeId} />
      <Textarea name="konditionen" aria-label="Konditionen" defaultValue={text} placeholder="z. B. 5 % Objektrabatt, 2 % Skonto 7 Tage, Rahmenvertrag" />
      {z.fehler && <p role="alert" className="text-sm text-tone-red-fg">{z.fehler}</p>}
      <div className="flex items-center justify-between gap-3">
        <small className="text-xs text-muted-2">Nur intern. Geht nicht an Lexware und erscheint auf keinem Beleg.</small>
        <Button type="submit" size="sm" variant="primary" disabled={laeuft || !geaendert}>
          {laeuft ? "Speichern …" : z.ok && !geaendert ? "Gespeichert" : "Speichern"}
        </Button>
      </div>
    </form>
  );
}
