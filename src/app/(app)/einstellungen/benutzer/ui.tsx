"use client";

import { Plus } from "lucide-react";
import { useActionState, useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Bestaetigen } from "@/components/ui/bestaetigen";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/field";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import type { Benutzer } from "@/lib/auth/sitzung";
import { cn } from "@/lib/cn";
import { aendern, aktivSetzen, einladen, erneutEinladen, zweiFaktorZuruecksetzen, type Ergebnis } from "./aktionen";

export type Zeile = Benutzer & { angemeldet: boolean; zweiFaktor: boolean };

const ANSICHTEN = [
  ["gf", "Geschäftsführung"],
  ["montage", "Montage"],
  ["einkauf", "Einkauf"],
] as const;

function Meldung({ e }: { e: Ergebnis }) {
  if (!e.fehler && !e.hinweis) return null;
  return (
    <p
      role={e.fehler ? "alert" : "status"}
      className={cn("rounded-md px-3.5 py-2.5 text-sm", e.fehler ? "bg-tone-red-bg text-tone-red-fg" : "bg-tone-green-bg text-tone-green-fg")}
    >
      {e.fehler ?? e.hinweis}
    </p>
  );
}

export function EinladenDialog() {
  const [offen, setOffen] = useState(false);
  const [z, aktion, laeuft] = useActionState(einladen, {});
  return (
    <Dialog open={offen} onOpenChange={setOffen}>
      <DialogTrigger asChild>
        <Button variant="accent">
          <Plus className="size-[15px]" strokeWidth={2.2} />
          Benutzer einladen
        </Button>
      </DialogTrigger>
      <DialogContent
        title="Benutzer einladen"
        description="Die Person bekommt eine E-Mail, setzt ihr Passwort selbst und richtet die Zwei-Faktor-Anmeldung ein."
      >
        {z.hinweis ? (
          <div className="flex flex-col gap-4">
            <Meldung e={z} />
            <div className="flex justify-end">
              <DialogClose asChild>
                <Button variant="primary">Schließen</Button>
              </DialogClose>
            </div>
          </div>
        ) : (
          <form action={aktion} className="flex flex-col gap-4">
            <Meldung e={z} />
            <Field label="Name">{(a) => <Input {...a} name="name" required autoFocus />}</Field>
            <Field label="E-Mail">{(a) => <Input {...a} name="email" type="email" required />}</Field>
            <label className="flex items-center gap-2.5 text-sm">
              <input type="checkbox" name="admin" className="size-[18px] [accent-color:var(--ink)]" />
              Admin (verwaltet Benutzer, genehmigt Abwesenheiten)
            </label>
            <label className="flex items-center gap-2.5 text-sm">
              <input type="checkbox" name="konditionen" className="size-[18px] [accent-color:var(--ink)]" />
              Konditionen sehen (Kunden- und Lieferanten-Konditionen)
            </label>
            <div className="flex justify-end gap-2.5 pt-1">
              <DialogClose asChild>
                <Button>Abbrechen</Button>
              </DialogClose>
              <Button type="submit" variant="primary" disabled={laeuft}>
                {laeuft ? "Einladen …" : "Einladung senden"}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function BenutzerTabelle({ zeilen, ichId }: { zeilen: Zeile[]; ichId: string }) {
  const [ergebnis, setErgebnis] = useState<Ergebnis>({});
  const [laeuft, starten] = useTransition();
  const tun = (f: () => Promise<Ergebnis>) => starten(async () => setErgebnis(await f()));

  return (
    <div className="flex flex-col gap-3">
      <Meldung e={ergebnis} />
      <div className="overflow-x-auto rounded-lg border border-line bg-surface">
        <Table className={cn("min-w-[860px]", laeuft && "opacity-70")}>
          <thead>
            <tr>
              <Th>Name</Th>
              <Th>Status</Th>
              <Th>2FA</Th>
              <Th>Admin</Th>
              <Th>Konditionen</Th>
              <Th>Dashboard</Th>
              <Th className="text-right">Aktionen</Th>
            </tr>
          </thead>
          <tbody>
            {zeilen.map((b) => {
              const ich = b.id === ichId;
              return (
                <Tr key={b.id}>
                  <Td>
                    <b className="font-medium">{b.name}</b>
                    {ich && <span className="ml-2 text-xs text-muted">(du)</span>}
                    <div className="text-sm text-muted">{b.email}</div>
                  </Td>
                  <Td>
                    {!b.aktiv ? <Badge tone="gray">Deaktiviert</Badge> : b.angemeldet ? <Badge tone="green">Aktiv</Badge> : <Badge tone="blue">Eingeladen</Badge>}
                  </Td>
                  <Td>{b.zweiFaktor ? <Badge tone="green">eingerichtet</Badge> : <Badge tone="amber">ausstehend</Badge>}</Td>
                  <Td>
                    <input
                      type="checkbox"
                      aria-label={`${b.name} ist Admin`}
                      checked={b.admin}
                      disabled={laeuft}
                      onChange={(e) => tun(() => aendern(b.id, "admin", e.target.checked))}
                      className="size-[18px] [accent-color:var(--ink)]"
                    />
                  </Td>
                  <Td>
                    <input
                      type="checkbox"
                      aria-label={`${b.name} sieht Konditionen`}
                      checked={b.konditionen}
                      disabled={laeuft}
                      onChange={(e) => tun(() => aendern(b.id, "konditionen", e.target.checked))}
                      className="size-[18px] [accent-color:var(--ink)]"
                    />
                  </Td>
                  <Td>
                    <select
                      aria-label={`Start-Ansicht von ${b.name}`}
                      value={b.dashboard_start}
                      disabled={laeuft}
                      onChange={(e) => tun(() => aendern(b.id, "dashboard_start", e.target.value))}
                      className="h-9 rounded-sm border border-line bg-surface px-2 text-sm"
                    >
                      {ANSICHTEN.map(([k, l]) => (
                        <option key={k} value={k}>{l}</option>
                      ))}
                    </select>
                  </Td>
                  <Td className="text-right whitespace-nowrap">
                    <div className="flex justify-end gap-1.5">
                      {b.aktiv && !b.angemeldet && (
                        <Button size="xs" disabled={laeuft} onClick={() => tun(() => erneutEinladen(b.id))}>
                          Erneut einladen
                        </Button>
                      )}
                      {!ich && b.zweiFaktor && (
                        <Bestaetigen
                          titel="Zwei-Faktor-Anmeldung zurücksetzen?"
                          text={`${b.name} richtet die Authenticator-App bei der nächsten Anmeldung neu ein. Nur tun, wenn die Person sich ausgewiesen hat (z. B. Handy verloren).`}
                          knopf="Zurücksetzen"
                          ausfuehren={() => tun(() => zweiFaktorZuruecksetzen(b.id))}
                        >
                          <Button size="xs" disabled={laeuft}>2FA zurücksetzen</Button>
                        </Bestaetigen>
                      )}
                      {!ich &&
                        (b.aktiv ? (
                          <Bestaetigen
                            titel="Benutzer deaktivieren?"
                            text={`${b.name} kann sich nicht mehr anmelden und sieht keine Daten. Die Daten bleiben erhalten, aktivieren ist jederzeit möglich.`}
                            knopf="Deaktivieren"
                            gefahr
                            ausfuehren={() => tun(() => aktivSetzen(b.id, false))}
                          >
                            <Button size="xs" variant="danger" disabled={laeuft}>Deaktivieren</Button>
                          </Bestaetigen>
                        ) : (
                          <Button size="xs" disabled={laeuft} onClick={() => tun(() => aktivSetzen(b.id, true))}>
                            Aktivieren
                          </Button>
                        ))}
                    </div>
                  </Td>
                </Tr>
              );
            })}
          </tbody>
        </Table>
      </div>
    </div>
  );
}
