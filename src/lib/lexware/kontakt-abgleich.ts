/*
  Keine doppelten Kunden in Lexware (CLAUDE.md „Kunden“, Übergang 13.11.2026): Bevor die App für einen Kunden einen
  Lexware-Kontakt anlegt, sucht sie einen vorhandenen (Kundennummer, E-Mail, Name, Adresse). Reine Rechenlogik
  (Unit-Tests: tests/unit/kontakt-abgleich.test.ts).
    eindeutig – genau ein Kontakt passt sicher: dessen ID wird übernommen
    unsicher  – es gibt mögliche Treffer: das Büro wählt („vorhandenen Kontakt verwenden“ oder „neu anlegen“)
    keiner    – neuer Kontakt
  Sicher heißt: gleiche Kundennummer, oder gleiche E-Mail zusammen mit gleichem Namen bzw. gleicher Adresse, oder
  gleicher Name zusammen mit gleicher Adresse. Erfüllen mehrere Kontakte das, ist es unsicher.
*/

export type LexKontakt = {
  id: string;
  roles?: { customer?: { number?: number } };
  company?: { name?: string };
  person?: { salutation?: string; firstName?: string; lastName?: string };
  emailAddresses?: Record<string, string[] | undefined>;
  addresses?: { billing?: { street?: string; zip?: string; city?: string }[] };
  archived?: boolean;
};

export type KundeVergleich = { nummer: string | null; name: string; email: string | null; strasse: string | null; plz: string | null };

export type Kandidat = { id: string; name: string; nummer: string | null; email: string | null; adresse: string | null; gruende: string[] };

export type Abgleich = { art: "eindeutig"; id: string; kandidat: Kandidat } | { art: "unsicher"; kandidaten: Kandidat[] } | { art: "keiner" };

/** Für Vergleiche: klein, ohne Akzente, ß → ss, Satzzeichen und Leerraum weg, „str.“ = „straße“ */
export const normal = (t: string | null | undefined) =>
  (t ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ß/g, "ss")
    .replace(/strasse\b|str\./g, "str")
    .replace(/[^a-z0-9]/g, "");

export function kontaktName(k: LexKontakt): string {
  if (k.company?.name) return k.company.name;
  return [k.person?.firstName, k.person?.lastName].filter(Boolean).join(" ");
}

const emails = (k: LexKontakt) => Object.values(k.emailAddresses ?? {}).flatMap((x) => x ?? []).map((e) => e.trim().toLowerCase());

/** Kandidaten mit Gründen; Kontakte ohne jeden Bezug fallen weg */
export function kandidaten(kunde: KundeVergleich, kontakte: LexKontakt[]): Kandidat[] {
  const name = normal(kunde.name);
  const email = kunde.email?.trim().toLowerCase() || null;
  const adresse = normal(kunde.plz) + normal(kunde.strasse);
  const gesehen = new Set<string>();
  const ergebnis: Kandidat[] = [];
  for (const k of kontakte) {
    if (gesehen.has(k.id) || k.archived) continue;
    gesehen.add(k.id);
    const b = k.addresses?.billing?.[0];
    const kNummer = k.roles?.customer?.number != null ? String(k.roles.customer.number) : null;
    const gruende: string[] = [];
    if (kunde.nummer && kNummer === kunde.nummer) gruende.push("nummer");
    if (email && emails(k).includes(email)) gruende.push("email");
    if (name && normal(kontaktName(k)) === name) gruende.push("name");
    if (adresse.length > 5 && b && normal(b.zip) + normal(b.street) === adresse) gruende.push("adresse");
    if (!gruende.length) continue;
    ergebnis.push({
      id: k.id,
      name: kontaktName(k) || "(ohne Namen)",
      nummer: kNummer,
      email: emails(k)[0] ?? null,
      adresse: b ? [b.street, [b.zip, b.city].filter(Boolean).join(" ")].filter(Boolean).join(", ") : null,
      gruende,
    });
  }
  return ergebnis;
}

const sicher = (k: Kandidat) =>
  k.gruende.includes("nummer") ||
  (k.gruende.includes("email") && (k.gruende.includes("name") || k.gruende.includes("adresse"))) ||
  (k.gruende.includes("name") && k.gruende.includes("adresse"));

export function kontaktAbgleich(kunde: KundeVergleich, kontakte: LexKontakt[]): Abgleich {
  const alle = kandidaten(kunde, kontakte);
  const sichere = alle.filter(sicher);
  if (sichere.length === 1) return { art: "eindeutig", id: sichere[0].id, kandidat: sichere[0] };
  // Nur ein Name oder nur eine E-Mail allein ist kein Beweis (z. B. zwei Kunden „Familie Müller“)
  const moegliche = alle.filter((k) => sicher(k) || k.gruende.includes("email") || k.gruende.includes("name"));
  if (moegliche.length) return { art: "unsicher", kandidaten: moegliche.slice(0, 8) };
  return { art: "keiner" };
}

export const GRUND_TEXT: Record<string, string> = { nummer: "Kundennummer", email: "E-Mail", name: "Name", adresse: "Adresse" };
