"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, PasswortInput } from "@/components/ui/field";
import { Formular } from "@/components/ui/formular";
import {
  anmelden,
  codePruefen,
  faktorAnlegen,
  faktorBestaetigen,
  passwortSetzen,
  passwortVergessen,
  type Einrichtung,
  type Zustand,
} from "@/lib/auth/aktionen";
import { cn } from "@/lib/cn";

const leer: Zustand = {};

export function Kopf({ titel, text }: { titel: string; text?: ReactNode }) {
  return (
    <div className="mb-5">
      <h1 className="text-xl font-semibold">{titel}</h1>
      {text && <p className="mt-1.5 text-sm text-muted">{text}</p>}
    </div>
  );
}

export function Meldung({ art = "info", children }: { art?: "info" | "fehler" | "ok"; children: ReactNode }) {
  return (
    <p
      role={art === "fehler" ? "alert" : "status"}
      className={cn(
        "rounded-md px-3.5 py-2.5 text-sm",
        art === "fehler" && "bg-tone-red-bg text-tone-red-fg",
        art === "ok" && "bg-tone-green-bg text-tone-green-fg",
        art === "info" && "bg-tone-brand-bg text-tone-brand-fg",
      )}
    >
      {children}
    </p>
  );
}

function CodeFeld() {
  return (
    <Field label="Code aus der Authenticator-App">
      {(a) => (
        <Input
          {...a}
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9 ]{6,7}"
          maxLength={7}
          required
          autoFocus
          placeholder="123 456"
          className="font-mono text-lg tracking-[0.3em]"
        />
      )}
    </Field>
  );
}

export function AnmeldeFormular({ hinweis }: { hinweis?: string }) {
  const [z, aktion, laeuft] = useActionState(anmelden, leer);
  return (
    <Formular aktion={aktion} className="flex flex-col gap-4">
      {z.fehler ? <Meldung art="fehler">{z.fehler}</Meldung> : hinweis && <Meldung>{hinweis}</Meldung>}
      <Field label="E-Mail">
        {(a) => <Input {...a} name="email" type="email" autoComplete="username" defaultValue={z.email} required autoFocus />}
      </Field>
      <Field label="Passwort">
        {(a) => <PasswortInput {...a} name="passwort" autoComplete="current-password" required />}
      </Field>
      <Button type="submit" variant="accent" disabled={laeuft} className="mt-1">
        {laeuft ? "Anmelden …" : "Weiter"}
      </Button>
      <Link href="/passwort-vergessen" className="self-center text-sm text-accent-text hover:underline">
        Passwort vergessen?
      </Link>
    </Formular>
  );
}

export function CodeFormular({ weiter }: { weiter: string }) {
  const [z, aktion, laeuft] = useActionState(codePruefen, leer);
  return (
    <Formular aktion={aktion} className="flex flex-col gap-4">
      {z.fehler && <Meldung art="fehler">{z.fehler}</Meldung>}
      <input type="hidden" name="weiter" value={weiter} />
      <CodeFeld />
      <Button type="submit" variant="accent" disabled={laeuft}>
        {laeuft ? "Prüfen …" : "Anmelden"}
      </Button>
      <p className="text-center text-xs text-muted">
        Handy verloren oder neu? Ein Admin kann die Zwei-Faktor-Anmeldung zurücksetzen.{" "}
        {/* bewusst kein next/link: Vorabladen würde abmelden */}
        <a href="/abmelden" className="text-accent-text hover:underline">Abbrechen</a>
      </p>
    </Formular>
  );
}

export function EinrichtenFormular() {
  const router = useRouter();
  const [daten, setDaten] = useState<Einrichtung | null>(null);
  const gestartet = useRef(false);
  const [z, aktion, laeuft] = useActionState(faktorBestaetigen, leer);

  useEffect(() => {
    if (gestartet.current) return; // nur einmal, auch im Entwicklungsmodus (StrictMode)
    gestartet.current = true;
    faktorAnlegen().then((d) => {
      if ("fertig" in d) router.replace("/anmelden/code");
      else setDaten(d);
    });
  }, [router]);

  if (!daten) return <p className="text-sm text-muted">Einrichtung wird vorbereitet …</p>;
  if ("fehler" in daten) return <Meldung art="fehler">{daten.fehler}</Meldung>;
  if (!("id" in daten)) return null;

  return (
    <Formular aktion={aktion} className="flex flex-col gap-4">
      {z.fehler && <Meldung art="fehler">{z.fehler}</Meldung>}
      <ol className="list-decimal space-y-1 pl-5 text-sm text-ink-2">
        <li>Authenticator-App öffnen (z. B. Microsoft oder Google Authenticator).</li>
        <li>QR-Code scannen.</li>
        <li>Den angezeigten 6-stelligen Code eingeben.</li>
      </ol>
      {/* QR-Codes brauchen einen hellen Untergrund zum Scannen */}
      <div className="mx-auto rounded-md bg-frame-ink p-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={daten.qr} alt="QR-Code für die Authenticator-App" width={176} height={176} />
      </div>
      <details className="text-sm text-muted">
        <summary className="cursor-pointer">QR-Code lässt sich nicht scannen?</summary>
        <p className="mt-2">Diesen Schlüssel in der App von Hand eingeben:</p>
        <code className="mt-1 block font-mono text-[13px] break-all text-ink">{daten.secret.match(/.{1,4}/g)?.join(" ")}</code>
      </details>
      <input type="hidden" name="faktor" value={daten.id} />
      <CodeFeld />
      <Button type="submit" variant="accent" disabled={laeuft}>
        {laeuft ? "Prüfen …" : "Einrichtung abschließen"}
      </Button>
    </Formular>
  );
}

export function VergessenFormular() {
  const [z, aktion, laeuft] = useActionState(passwortVergessen, leer);
  if (z.hinweis) {
    return (
      <div className="flex flex-col gap-4">
        <Meldung art="ok">{z.hinweis}</Meldung>
        <Link href="/anmelden" className="self-center text-sm text-accent-text hover:underline">Zur Anmeldung</Link>
      </div>
    );
  }
  return (
    <Formular aktion={aktion} className="flex flex-col gap-4">
      {z.fehler && <Meldung art="fehler">{z.fehler}</Meldung>}
      <Field label="E-Mail">
        {(a) => <Input {...a} name="email" type="email" autoComplete="username" defaultValue={z.email} required autoFocus />}
      </Field>
      <Button type="submit" variant="accent" disabled={laeuft}>
        {laeuft ? "Senden …" : "Link senden"}
      </Button>
      <Link href="/anmelden" className="self-center text-sm text-accent-text hover:underline">Zurück zur Anmeldung</Link>
    </Formular>
  );
}

export function PasswortFormular() {
  const [z, aktion, laeuft] = useActionState(passwortSetzen, leer);
  return (
    <Formular aktion={aktion} className="flex flex-col gap-4">
      {z.fehler && <Meldung art="fehler">{z.fehler}</Meldung>}
      <Field label="Neues Passwort" hint="Mindestens 12 Zeichen, Groß- und Kleinbuchstaben und eine Ziffer">
        {(a) => <PasswortInput {...a} name="passwort" autoComplete="new-password" minLength={12} required autoFocus />}
      </Field>
      <Field label="Passwort wiederholen">
        {(a) => <PasswortInput {...a} name="passwort2" autoComplete="new-password" minLength={12} required />}
      </Field>
      <Button type="submit" variant="accent" disabled={laeuft}>
        {laeuft ? "Speichern …" : "Passwort speichern"}
      </Button>
    </Formular>
  );
}
