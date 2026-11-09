"use server";

import { refresh } from "next/cache";
import { pruefeAdmin } from "@/lib/auth/sitzung";
import { createAdminClient } from "@/lib/supabase/admin";

export type Ergebnis = { fehler?: string; hinweis?: string };

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const DAUERHAFT = "876000h"; // Sperre in Supabase Auth (100 Jahre)

/**
 * Lädt einen neuen Benutzer per E-Mail ein. Die Einladung verschickt Supabase Auth; die Zeile in `benutzer` legt
 * die Sitzung des Admins an (RLS: nur Admins), damit das Audit-Log den einladenden Admin festhält.
 */
export async function einladen(_: Ergebnis, fd: FormData): Promise<Ergebnis> {
  const { supabase } = await pruefeAdmin();
  const name = String(fd.get("name") ?? "").trim();
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  if (!name) return { fehler: "Bitte den Namen eingeben." };
  if (!EMAIL.test(email)) return { fehler: "Bitte eine gültige E-Mail-Adresse eingeben." };

  const adm = createAdminClient();
  const { data, error } = await adm.auth.admin.inviteUserByEmail(email);
  if (error || !data.user) {
    return {
      fehler: error?.code === "email_exists" ? "Zu dieser E-Mail-Adresse gibt es schon einen Zugang."
        : error?.status === 429 ? "Zu viele E-Mails in kurzer Zeit. Bitte später erneut versuchen."
        : "Die Einladung konnte nicht verschickt werden.",
    };
  }
  const { error: dbFehler } = await supabase.from("benutzer").insert({
    id: data.user.id,
    name,
    email,
    admin: fd.get("admin") === "on",
    konditionen: fd.get("konditionen") === "on",
  });
  if (dbFehler) {
    await adm.auth.admin.deleteUser(data.user.id);
    return { fehler: "Der Benutzer konnte nicht angelegt werden. Die Einladung wurde zurückgenommen." };
  }
  refresh();
  return { hinweis: `Einladung an ${email} ist verschickt.` };
}

/** Rechte und Start-Ansicht (Admin, Konditionen, Dashboard). „Mindestens ein Admin“ prüft die Datenbank. */
export async function aendern(id: string, feld: "admin" | "konditionen" | "dashboard_start", wert: boolean | string): Promise<Ergebnis> {
  const { supabase } = await pruefeAdmin();
  if (feld === "dashboard_start" ? !["gf", "montage", "einkauf"].includes(String(wert)) : typeof wert !== "boolean") {
    return { fehler: "Ungültiger Wert." };
  }
  if (!["admin", "konditionen", "dashboard_start"].includes(feld)) return { fehler: "Ungültiges Feld." };
  const { error } = await supabase.from("benutzer").update({ [feld]: wert }).eq("id", id);
  if (error) return { fehler: error.message.includes("Admin") ? error.message : "Die Änderung konnte nicht gespeichert werden." };
  refresh();
  return {};
}

/** Aktivieren oder deaktivieren. Deaktiviert: keine Daten (RLS) und keine Anmeldung (Sperre in Supabase Auth). */
export async function aktivSetzen(id: string, aktiv: boolean): Promise<Ergebnis> {
  const { supabase, benutzer } = await pruefeAdmin();
  if (id === benutzer.id) return { fehler: "Du kannst dich nicht selbst deaktivieren." };
  const { error } = await supabase.from("benutzer").update({ aktiv }).eq("id", id);
  if (error) return { fehler: error.message.includes("Admin") ? error.message : "Die Änderung konnte nicht gespeichert werden." };
  const { error: authFehler } = await createAdminClient().auth.admin.updateUserById(id, { ban_duration: aktiv ? "none" : DAUERHAFT });
  if (authFehler) return { fehler: "Gespeichert, aber die Anmeldesperre konnte nicht gesetzt werden. Bitte erneut versuchen." };
  refresh();
  return {};
}

/** Zwei-Faktor-Anmeldung zurücksetzen (z. B. Handy verloren). Bei der nächsten Anmeldung richtet der Benutzer neu ein. */
export async function zweiFaktorZuruecksetzen(id: string): Promise<Ergebnis> {
  const { benutzer } = await pruefeAdmin();
  if (id === benutzer.id) return { fehler: "Die eigene Zwei-Faktor-Anmeldung kann nur ein anderer Admin zurücksetzen." };
  const adm = createAdminClient();
  const { data, error } = await adm.auth.admin.mfa.listFactors({ userId: id });
  if (error) return { fehler: "Die Faktoren konnten nicht gelesen werden." };
  for (const f of data.factors) {
    const { error: e } = await adm.auth.admin.mfa.deleteFactor({ id: f.id, userId: id });
    if (e) return { fehler: "Zurücksetzen fehlgeschlagen. Bitte erneut versuchen." };
  }
  refresh();
  return { hinweis: "Zwei-Faktor-Anmeldung zurückgesetzt. Bei der nächsten Anmeldung wird sie neu eingerichtet." };
}

/** Einladung erneut senden (nur solange sich der Benutzer noch nie angemeldet hat). */
export async function erneutEinladen(id: string): Promise<Ergebnis> {
  const { supabase } = await pruefeAdmin();
  const { data: b } = await supabase.from("benutzer").select("email").eq("id", id).maybeSingle();
  if (!b) return { fehler: "Benutzer nicht gefunden." };
  const { error } = await createAdminClient().auth.admin.inviteUserByEmail(b.email);
  if (error) return { fehler: error.status === 429 ? "Zu viele E-Mails in kurzer Zeit. Bitte später erneut versuchen." : "Die Einladung konnte nicht erneut verschickt werden." };
  return { hinweis: `Einladung an ${b.email} ist erneut verschickt.` };
}
