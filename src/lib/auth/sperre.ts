import "server-only";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { aktivCookie, aktivWert, LINK_COOKIE, linkCookie, linkGueltig, linkWert } from "./aktivitaet";

/*
  Sperre je Konto (docs/sicherheit.md M7): 10 Fehlversuche (Passwort, Zwei-Faktor-Code, Passwort ändern) in 15 Minuten
  sperren die Anmeldung für 15 Minuten. Zähler und Ereignisse führt die Datenbank (anmeldung_* mit der Service-Rolle,
  Einträge im Audit-Log als Konto-Ereignis). Gilt auch für unbekannte Adressen, damit sich nicht prüfen lässt, ob es
  ein Konto gibt.
*/

export type FehlArt = "passwort" | "code" | "passwort_aendern";

const uhrzeit = (iso: string) =>
  new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

export const sperrText = (bis: string) => `Zu viele Fehlversuche. Die Anmeldung ist bis ${uhrzeit(bis)} Uhr gesperrt.`;

/** Gesperrt bis (ISO) oder null */
export async function gesperrtBis(email: string): Promise<string | null> {
  const { data, error } = await createAdminClient().rpc("anmeldung_gesperrt", { p_email: email });
  if (error) throw new Error("Die Anmeldung ist gerade nicht möglich. Bitte gleich noch einmal versuchen.");
  return (data as string | null) ?? null;
}

/** Fehlversuch zählen; liefert „gesperrt bis“, sobald die Grenze erreicht ist */
export async function fehlversuch(email: string, art: FehlArt): Promise<string | null> {
  const { data } = await createAdminClient().rpc("anmeldung_fehlversuch", { p_email: email, p_art: art });
  return (data as string | null) ?? null;
}

/** Anmeldung mit zweitem Faktor abgeschlossen: Zähler zurücksetzen, Ereignis protokollieren, Aktivität beginnen */
export async function anmeldungAbgeschlossen(email: string, sitzung: string | undefined) {
  await createAdminClient().rpc("anmeldung_erfolgreich", { p_email: email });
  if (sitzung) await aktivitaetBeginnen(sitzung);
}

/** Aktivitäts-Cookie nach dem zweiten Faktor setzen (danach erneuert es der Proxy) */
export async function aktivitaetBeginnen(sitzung: string) {
  (await cookies()).set({ ...aktivCookie(process.env.NODE_ENV === "production"), value: await aktivWert(sitzung) });
}

/** Nach dem Einlösen eines Einladungs- oder Passwort-Links: Passwort setzen ist 60 Minuten erlaubt */
export async function linkMerken(sitzung: string) {
  (await cookies()).set({ ...linkCookie(process.env.NODE_ENV === "production"), value: await linkWert(sitzung) });
}

export async function linkPruefen(sitzung: string | undefined): Promise<boolean> {
  return linkGueltig((await cookies()).get(LINK_COOKIE)?.value, sitzung);
}

export async function linkVergessen() {
  (await cookies()).delete(LINK_COOKIE);
}
