"use server";

import { refresh } from "next/cache";
import { pruefeSitzung } from "@/lib/auth/sitzung";

export type Ergebnis = { fehler?: string; ok?: boolean; hinweis?: string };

const FELDER = ["firma_name", "firma_zusatz", "strasse", "plz", "ort", "land", "telefon", "email", "website", "ust_id", "steuernummer", "handelsregister", "geschaeftsfuehrung", "bank_name", "iban", "bic"] as const;

/** Firmendaten für Belege (Kopf, Absenderzeile, Fuß) */
export async function firmaSpeichern(_: Ergebnis, fd: FormData): Promise<Ergebnis> {
  const { supabase } = await pruefeSitzung();
  const daten = Object.fromEntries(FELDER.map((f) => [f, String(fd.get(f) ?? "").trim().slice(0, 200) || null]));
  if (!daten.firma_name) return { fehler: "Bitte den Firmennamen eingeben." };
  if (daten.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(daten.email)) return { fehler: "Bitte eine gültige E-Mail-Adresse eingeben." };
  if (daten.iban) daten.iban = daten.iban.replace(/\s+/g, " ").toUpperCase();
  daten.land = daten.land ?? "Deutschland";
  const { error } = await supabase.from("einstellung").update(daten).eq("einzig", true);
  if (error) return { fehler: "Die Firmendaten konnten nicht gespeichert werden." };
  refresh();
  return { ok: true, hinweis: "Gespeichert." };
}
