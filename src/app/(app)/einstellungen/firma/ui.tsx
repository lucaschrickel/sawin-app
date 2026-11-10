"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Formular } from "@/components/ui/formular";
import type { Firma } from "@/lib/belege";
import { firmaSpeichern, type Ergebnis } from "./aktionen";

const GRUPPEN: { titel: string; felder: [keyof Firma, string, string?][] }[] = [
  { titel: "Firma", felder: [["firma_name", "Firmenname *"], ["firma_zusatz", "Zusatz"], ["geschaeftsfuehrung", "Inhaber / Geschäftsführung"], ["handelsregister", "Handelsregister"]] },
  { titel: "Anschrift und Kontakt", felder: [["strasse", "Straße"], ["plz", "PLZ"], ["ort", "Ort"], ["land", "Land"], ["telefon", "Telefon"], ["email", "E-Mail", "email"], ["website", "Website"]] },
  { titel: "Steuer und Bank", felder: [["ust_id", "USt-IdNr."], ["steuernummer", "Steuernummer"], ["bank_name", "Bank"], ["iban", "IBAN"], ["bic", "BIC"]] },
];

export function FirmaFormular({ firma }: { firma: Firma }) {
  const [geaendert, setGeaendert] = useState(false);
  const [z, aktion, laeuft] = useActionState<Ergebnis, FormData>(async (v, fd) => {
    const r = await firmaSpeichern(v, fd);
    if (r.ok) setGeaendert(false);
    return r;
  }, {});
  return (
    <Formular aktion={aktion} onInput={() => setGeaendert(true)} className="flex flex-col gap-5" data-firma-formular>
      {GRUPPEN.map((g) => (
        <fieldset key={g.titel} className="grid gap-3 sm:grid-cols-2">
          <legend className="mb-2 text-sm font-semibold">{g.titel}</legend>
          {g.felder.map(([name, label, typ]) => (
            <Field key={name} label={label}>
              {(a) => <Input {...a} name={name} type={typ ?? "text"} defaultValue={(firma[name] as string | null) ?? ""} required={name === "firma_name"} />}
            </Field>
          ))}
        </fieldset>
      ))}
      <div className="flex items-center gap-3">
        <Button type="submit" variant={geaendert ? "primary" : "secondary"} disabled={laeuft || !geaendert}>Speichern</Button>
        {!geaendert && z.hinweis && <span role="status" className="text-sm text-tone-green-fg">{z.hinweis}</span>}
      </div>
      {z.fehler && <p role="alert" className="rounded-md bg-tone-red-bg px-3.5 py-2.5 text-sm text-tone-red-fg">{z.fehler}</p>}
    </Formular>
  );
}
