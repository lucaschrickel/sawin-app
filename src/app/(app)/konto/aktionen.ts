"use server";

import { createClient as createSupabase } from "@supabase/supabase-js";
import { pruefeSitzung } from "@/lib/auth/sitzung";
import { createAdminClient } from "@/lib/supabase/admin";
import { supabaseEnv } from "@/lib/supabase/env";
import { passwortRegeln } from "@/lib/passwort";
import { fehlversuch, gesperrtBis, sperrText } from "@/lib/auth/sperre";

export type PasswortZustand = { fehler?: string; felder?: Record<string, string>; ok?: boolean };

/**
 * Passwort ändern (Konto): nur mit vollständiger Anmeldung inkl. zweitem Faktor (pruefeSitzung verlangt aal2).
 * Das aktuelle Passwort prüft der Server mit einer eigenen, kurzlebigen Anmeldung (danach sofort wieder abgemeldet).
 * Danach werden alle anderen Sitzungen des Benutzers abgemeldet; Eintrag im Audit-Log. Ohne E-Mail-Versand.
 */
export async function passwortAendern(_: PasswortZustand, fd: FormData): Promise<PasswortZustand> {
  const { supabase, benutzer } = await pruefeSitzung();
  const aktuell = String(fd.get("aktuell") ?? "");
  const neu = String(fd.get("neu") ?? "");
  const wiederholung = String(fd.get("wiederholung") ?? "");
  const felder: Record<string, string> = {};
  if (!aktuell) felder.aktuell = "Bitte das aktuelle Passwort eingeben.";
  const offen = passwortRegeln(neu, aktuell).filter((r) => !r.erfuellt);
  if (offen.length) felder.neu = `Das neue Passwort braucht: ${offen.map((r) => r.text).join(", ")}.`;
  if (neu !== wiederholung) felder.wiederholung = "Die Wiederholung stimmt nicht mit dem neuen Passwort überein.";
  if (Object.keys(felder).length) return { fehler: Object.values(felder)[0], felder };

  // Sperre nach zu vielen Fehlversuchen (gemeinsam mit der Anmeldung)
  const bis = await gesperrtBis(benutzer.email).catch(() => null);
  if (bis) return { fehler: sperrText(bis) };

  // Aktuelles Passwort prüfen, ohne die Sitzung des Benutzers anzufassen
  const { url, key } = supabaseEnv();
  const pruefer = createSupabase(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const { error: falsch } = await pruefer.auth.signInWithPassword({ email: benutzer.email, password: aktuell });
  if (falsch) {
    if (falsch.status === 429) return { fehler: "Zu viele Versuche. Bitte in einigen Minuten erneut versuchen." };
    const gesperrt = await fehlversuch(benutzer.email, "passwort_aendern");
    if (gesperrt) return { fehler: sperrText(gesperrt) };
    return { fehler: "Das aktuelle Passwort stimmt nicht.", felder: { aktuell: "Das aktuelle Passwort stimmt nicht." } };
  }
  await pruefer.auth.signOut({ scope: "local" });

  const { error } = await supabase.auth.updateUser({ password: neu });
  if (error) {
    return {
      fehler:
        error.code === "same_password" ? "Das neue Passwort muss sich vom bisherigen unterscheiden."
        : error.code === "weak_password" ? "Das Passwort ist zu schwach oder bekannt unsicher. Bitte ein anderes wählen."
        : "Das Passwort konnte nicht gespeichert werden. Bitte erneut versuchen.",
    };
  }
  // Alle anderen Sitzungen (andere Geräte, Browser) abmelden; diese bleibt angemeldet
  await supabase.auth.signOut({ scope: "others" });
  await createAdminClient().rpc("konto_ereignis", { p_benutzer: benutzer.id, p_art: "passwort_geaendert", p_daten: { andere_sitzungen_abgemeldet: true } });
  return { ok: true };
}
