"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Formular } from "@/components/ui/formular";
import { arbeitszeitSpeichern, type Ergebnis } from "./aktionen";

const auswahl = "h-[42px] rounded-md border border-line bg-surface px-3 text-[15px]";

export function ArbeitszeitFormular({ von, bis }: { von: number; bis: number }) {
  const [geaendert, setGeaendert] = useState(false);
  const [z, aktion, laeuft] = useActionState<Ergebnis, FormData>(async (v, fd) => {
    const r = await arbeitszeitSpeichern(v, fd);
    if (r.ok) setGeaendert(false);
    return r;
  }, {});
  return (
    <Formular aktion={aktion} onChange={() => setGeaendert(true)} className="flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1.5 text-sm font-medium text-ink-3">
        Beginn
        <select name="von" defaultValue={von} className={auswahl}>
          {Array.from({ length: 8 }, (_, i) => i + 5).map((h) => <option key={h} value={h}>{h}:00 Uhr</option>)}
        </select>
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium text-ink-3">
        Ende
        <select name="bis" defaultValue={bis} className={auswahl}>
          {Array.from({ length: 11 }, (_, i) => i + 12).map((h) => <option key={h} value={h}>{h}:00 Uhr</option>)}
        </select>
      </label>
      <Button type="submit" variant={geaendert ? "primary" : "secondary"} disabled={laeuft || !geaendert}>Speichern</Button>
      {!geaendert && z.hinweis && <span role="status" className="pb-2.5 text-sm text-tone-green-fg">{z.hinweis}</span>}
      {z.fehler && <p role="alert" className="basis-full rounded-md bg-tone-red-bg px-3.5 py-2.5 text-sm text-tone-red-fg">{z.fehler}</p>}
    </Formular>
  );
}
