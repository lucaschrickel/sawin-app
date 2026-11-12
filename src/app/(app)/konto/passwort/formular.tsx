"use client";

import { Check, Circle } from "lucide-react";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, PasswortInput } from "@/components/ui/field";
import { Formular } from "@/components/ui/formular";
import { cn } from "@/lib/cn";
import { passwortRegeln } from "@/lib/passwort";
import { passwortAendern, type PasswortZustand } from "../aktionen";

/** Aktuelles Passwort, neues Passwort und Wiederholung (je mit Augen-Symbol); Anforderungen werden beim Tippen geprüft */
export function PasswortAendernFormular() {
  const [z, aktion, laeuft] = useActionState<PasswortZustand, FormData>(passwortAendern, {});
  const [alt, setAlt] = useState("");
  const [neu, setNeu] = useState("");
  const [wdh, setWdh] = useState("");
  const regeln = [...passwortRegeln(neu, alt), { schluessel: "gleich", text: "Wiederholung stimmt überein", erfuellt: neu.length > 0 && neu === wdh }];
  const f = z.felder ?? {};
  return (
    <section className="rounded-lg border border-line-soft bg-surface px-5 py-5">
      <Formular aktion={aktion} className="flex flex-col gap-4" data-passwort-formular>
        {z.ok && (
          <p role="status" className="rounded-md bg-tone-green-bg px-3.5 py-2.5 text-sm text-tone-green-fg" data-passwort-ok>
            Das Passwort ist geändert. Alle anderen Sitzungen wurden abgemeldet.
          </p>
        )}
        {z.fehler && (
          <p role="alert" className="rounded-md bg-tone-red-bg px-3.5 py-2.5 text-sm text-tone-red-fg">
            {z.fehler}
          </p>
        )}
        <Field label="Aktuelles Passwort" error={f.aktuell}>
          {(a) => <PasswortInput {...a} name="aktuell" autoComplete="current-password" required value={alt} onChange={(e) => setAlt(e.target.value)} />}
        </Field>
        <Field label="Neues Passwort" error={f.neu}>
          {(a) => <PasswortInput {...a} name="neu" autoComplete="new-password" required value={neu} onChange={(e) => setNeu(e.target.value)} />}
        </Field>
        <Field label="Neues Passwort wiederholen" error={f.wiederholung}>
          {(a) => <PasswortInput {...a} name="wiederholung" autoComplete="new-password" required value={wdh} onChange={(e) => setWdh(e.target.value)} />}
        </Field>
        <ul className="flex flex-col gap-1 text-sm" aria-label="Anforderungen an das neue Passwort" data-passwort-regeln>
          {regeln.map((r) => (
            <li key={r.schluessel} className={cn("flex items-center gap-2", r.erfuellt ? "text-tone-green-fg" : "text-muted")} data-regel={r.schluessel} data-erfuellt={r.erfuellt ? "ja" : "nein"}>
              {r.erfuellt ? <Check className="size-4" aria-hidden /> : <Circle className="size-3.5" aria-hidden />}
              {r.text}
              <span className="sr-only">{r.erfuellt ? "(erfüllt)" : "(noch nicht erfüllt)"}</span>
            </li>
          ))}
        </ul>
        <Button type="submit" variant="primary" disabled={laeuft || regeln.some((r) => !r.erfuellt) || !alt} className="self-start">
          {laeuft ? "Wird geändert …" : "Passwort ändern"}
        </Button>
      </Formular>
    </section>
  );
}
