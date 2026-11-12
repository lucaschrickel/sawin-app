/*
  Passwortregeln (wie in Supabase-Auth eingestellt: mindestens 12 Zeichen, Groß- und Kleinbuchstaben und Ziffern).
  Für die Anzeige der Anforderungen beim Eingeben und für die Prüfung auf dem Server (Unit-Tests: tests/unit/passwort.test.ts).
*/

export type Regel = { schluessel: string; text: string; erfuellt: boolean };

export function passwortRegeln(neu: string, alt?: string): Regel[] {
  const regeln: Regel[] = [
    { schluessel: "laenge", text: "mindestens 12 Zeichen", erfuellt: neu.length >= 12 },
    { schluessel: "gross_klein", text: "Groß- und Kleinbuchstaben", erfuellt: /[a-zäöüß]/.test(neu) && /[A-ZÄÖÜ]/.test(neu) },
    { schluessel: "ziffer", text: "mindestens eine Ziffer", erfuellt: /\d/.test(neu) },
  ];
  if (alt !== undefined) regeln.push({ schluessel: "anders", text: "nicht gleich dem bisherigen Passwort", erfuellt: neu.length > 0 && neu !== alt });
  return regeln;
}
