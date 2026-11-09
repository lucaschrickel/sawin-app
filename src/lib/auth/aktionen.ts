"use server";

import { redirect } from "next/navigation";
import { getCustomer } from "@/customers";
import { createClient } from "@/lib/supabase/server";
import { sicheresZiel } from "./konstanten";
import { anmeldeStand } from "./sitzung";

export type Zustand = { fehler?: string; hinweis?: string; email?: string };

const text = (fd: FormData, name: string) => String(fd.get(name) ?? "").trim();
const CODE = /^\d{6}$/;

/** Schritt 1: E-Mail und Passwort. Danach immer der zweite Faktor (Code oder Einrichtung). */
export async function anmelden(_: Zustand, fd: FormData): Promise<Zustand> {
  const email = text(fd, "email").toLowerCase();
  const passwort = String(fd.get("passwort") ?? "");
  if (!email || !passwort) return { fehler: "Bitte E-Mail und Passwort eingeben.", email };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password: passwort });
  if (error) {
    // Keine Unterscheidung zwischen unbekannter Adresse, falschem Passwort und gesperrtem Zugang
    return {
      fehler: error.status === 429 ? "Zu viele Versuche. Bitte in einigen Minuten erneut versuchen." : "E-Mail oder Passwort ist falsch.",
      email,
    };
  }
  const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  redirect(data?.nextLevel === "aal2" ? "/anmelden/code" : "/anmelden/einrichten");
}

/** Schritt 2: Code aus der Authenticator-App. */
export async function codePruefen(_: Zustand, fd: FormData): Promise<Zustand> {
  const code = text(fd, "code").replace(/\s/g, "");
  if (!CODE.test(code)) return { fehler: "Bitte den 6-stelligen Code aus der App eingeben." };
  const stand = await anmeldeStand();
  if (!stand.angemeldet) redirect("/anmelden");
  if (!stand.faktor) redirect("/anmelden/einrichten");
  const { error } = await stand.supabase.auth.mfa.challengeAndVerify({ factorId: stand.faktor.id, code });
  if (error) return { fehler: "Der Code stimmt nicht. Bitte den aktuellen Code aus der App eingeben." };
  redirect(sicheresZiel(fd.get("weiter")));
}

export type Einrichtung = { id: string; qr: string; secret: string } | { fehler: string } | { fertig: true };

/** Ersteinrichtung: legt einen neuen TOTP-Faktor an (unbestätigte alte werden entfernt). */
export async function faktorAnlegen(): Promise<Einrichtung> {
  const stand = await anmeldeStand();
  if (!stand.angemeldet) return { fehler: "Die Sitzung ist abgelaufen. Bitte erneut anmelden." };
  if (stand.faktor) return { fertig: true };
  for (const f of stand.offeneFaktoren) await stand.supabase.auth.mfa.unenroll({ factorId: f.id });
  const { data, error } = await stand.supabase.auth.mfa.enroll({
    factorType: "totp",
    issuer: getCustomer().name,
    friendlyName: `Authenticator ${new Date().toISOString().slice(0, 16)}`,
  });
  if (error || !data) return { fehler: "Die Einrichtung konnte nicht gestartet werden. Bitte Seite neu laden." };
  return { id: data.id, qr: data.totp.qr_code, secret: data.totp.secret };
}

export async function faktorBestaetigen(_: Zustand, fd: FormData): Promise<Zustand> {
  const code = text(fd, "code").replace(/\s/g, "");
  const factorId = text(fd, "faktor");
  if (!CODE.test(code)) return { fehler: "Bitte den 6-stelligen Code aus der App eingeben." };
  const stand = await anmeldeStand();
  if (!stand.angemeldet) redirect("/anmelden");
  if (!stand.offeneFaktoren.some((f) => f.id === factorId)) {
    return { fehler: "Die Einrichtung ist abgelaufen. Bitte Seite neu laden." };
  }
  const { error } = await stand.supabase.auth.mfa.challengeAndVerify({ factorId, code });
  if (error) return { fehler: "Der Code stimmt nicht. Bitte den aktuellen Code aus der App eingeben." };
  redirect("/");
}

/** Passwort vergessen: Antwort ist immer gleich, damit sich nicht prüfen lässt, ob es eine Adresse gibt. */
export async function passwortVergessen(_: Zustand, fd: FormData): Promise<Zustand> {
  const email = text(fd, "email").toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { fehler: "Bitte eine gültige E-Mail-Adresse eingeben.", email };
  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(email);
  return {
    hinweis: "Wenn es zu dieser Adresse einen Zugang gibt, ist eine E-Mail mit einem Link unterwegs. Der Link gilt 24 Stunden.",
  };
}

/** Link aus Einladung oder Passwort-E-Mail einlösen (per Knopf, damit Link-Scanner ihn nicht vorab verbrauchen). */
export async function linkEinloesen(fd: FormData) {
  const tokenHash = text(fd, "token_hash");
  const typ = text(fd, "type");
  if (!tokenHash || (typ !== "invite" && typ !== "recovery")) redirect("/anmelden?grund=link");
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });
  const { error } = await supabase.auth.verifyOtp({ type: typ, token_hash: tokenHash });
  if (error) redirect("/anmelden?grund=link");
  redirect("/passwort-setzen");
}

function passwortRegelVerletzt(pw: string): string | null {
  if (pw.length < 12) return "Mindestens 12 Zeichen.";
  if (!/[a-zäöüß]/.test(pw) || !/[A-ZÄÖÜ]/.test(pw) || !/\d/.test(pw)) return "Groß- und Kleinbuchstaben und mindestens eine Ziffer.";
  return null;
}

/** Neues Passwort nach Einladung oder „Passwort vergessen“. Mit Faktor erst nach Code-Eingabe. */
export async function passwortSetzen(_: Zustand, fd: FormData): Promise<Zustand> {
  const pw = String(fd.get("passwort") ?? "");
  const pw2 = String(fd.get("passwort2") ?? "");
  const regel = passwortRegelVerletzt(pw);
  if (regel) return { fehler: `Das Passwort braucht: ${regel}` };
  if (pw !== pw2) return { fehler: "Die beiden Passwörter stimmen nicht überein." };

  const stand = await anmeldeStand();
  if (!stand.angemeldet) redirect("/anmelden?grund=link");
  if (stand.faktor && stand.aal !== "aal2") redirect("/anmelden/code?weiter=/passwort-setzen");
  const { error } = await stand.supabase.auth.updateUser({ password: pw });
  if (error) {
    return {
      fehler:
        error.code === "same_password" ? "Das neue Passwort muss sich vom bisherigen unterscheiden."
        : error.code === "weak_password" ? "Das Passwort ist zu schwach oder bekannt unsicher. Bitte ein anderes wählen."
        : "Das Passwort konnte nicht gespeichert werden. Bitte erneut versuchen.",
    };
  }
  redirect(stand.faktor ? "/" : "/anmelden/einrichten");
}
