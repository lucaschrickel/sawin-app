@AGENTS.md

# Sawin Bauelemente App – Regeln für die Entwicklung

Browserbasierte Büro-App für Handwerksbetriebe. Pilotkunde ist Sawin Bauelemente.
Eine Codebasis, je Kunde eine eigene Instanz. Diese Datei gilt für jede Arbeit an diesem Repository.

## Architektur (festgelegt am 17.10.2026)

- **Frontend:** Next.js (App Router, TypeScript, Tailwind v4), gehostet auf Vercel im Team von Luca, ein Projekt je Kunde.
  Funktionen laufen in der Region `fra1`, nie in der Standardregion `iad1`.
- **Backend:** Supabase im Konto des Kunden, Region Frankfurt, je Kunde zwei Projekte: Staging und Produktion.
  Supabase liefert Anmeldung (Auth), Datenbank (Postgres mit RLS), Dateien (Storage) und Edge Functions.
- **Belege:** Lexware Office ist führend. Die App legt Angebote, Auftragsbestätigungen, Lieferscheine, Rechnungen
  und Gutschriften über die Lexware-API an. Abschlagsrechnungen legt das Büro in Lexware an, die App übernimmt sie
  über Lexware-Event-Subscriptions. Belegnummern und PDFs kommen immer von Lexware, die App vergibt keine eigenen.
  Den Status Angenommen/Abgelehnt eines Angebots führt die App selbst, weil die API ihn nicht ändern kann.
- **OneDrive:** Auftragsordner (sechs Unterordner) über Microsoft Graph, Umbenennung bei erster AB.
- **Später, nicht in Version 1:** Monteur-App, Zeiterfassung, Abwesenheiten, Plantafel, KI-Agents.
  KI-Agents laufen als eigener Hintergrunddienst an einer Warteschlange in Supabase, nicht im Frontend.

## Sicherheit (nicht verhandelbar)

Maßstab ist OWASP ASVS Level 1. Vor dem Start mit Echtdaten müssen alle Mindestkriterien unten erfüllt sein.

1. **Rechte werden in der Datenbank geprüft.** Jede Tabelle hat RLS aktiviert und Policies. Nie nur in der
   Next.js-Middleware oder im Frontend prüfen. Nach jeder Migration die Supabase Advisors ausführen, null Warnungen.
2. **Geheimnisse nur serverseitig.** Lexware-, Microsoft- und Supabase-Service-Schlüssel nur in
   Server-Umgebungsvariablen. Nie in `NEXT_PUBLIC_*`, nie im Repository, nie in Logs.
   Der Supabase `service_role`-Schlüssel wird nur in klar abgegrenzten Serverfunktionen verwendet.
3. **Anmeldung nur per Einladung,** keine offene Registrierung. MFA ist Pflicht für alle Nutzer.
4. **Löschen nur als Markierung** (`deleted_at`), nie hartes Löschen von Fachdaten.
5. **Audit-Log für jede Änderung** an Fachdaten, besonders an Belegen: wer, wann, was, vorher/nachher.
   Auch Zugriffe von Luca als Admin werden protokolliert.
6. **Rollen in Version 1:** Alle Nutzer haben gleiche Rechte, nur `admin` verwaltet Benutzer.
   Rolle `monteur` ist im Datenmodell vorgesehen, aber noch ungenutzt.
   Vor dem Finalisieren einer Rechnung oder Gutschrift immer ein Bestätigungsdialog.
7. **Sicherheits-Header** stehen in `next.config.ts`. Offen: vollständige CSP mit Nonce, sobald die Supabase-URL feststeht.
8. **Abhängigkeiten:** Dependabot aktiv, `npm audit --omit=dev` ohne hohe Befunde.
9. **Datenbankänderungen nur als Migration** über die Supabase CLI (`supabase/migrations`), nie per Klick im Dashboard.

## Lexware-Regeln

- Es gibt keine Lexware-Sandbox. Entwicklung und Staging arbeiten **nur gegen ein eigenes Lexware-Testkonto (Tarif XL)**.
  Der API-Schlüssel von Sawins echtem Lexware wird erst beim Go-live in Produktion gesetzt.
- Finalisierte Rechnungen und Gutschriften sind endgültig und nicht löschbar.
- Rate-Limit: höchstens 2 Anfragen pro Sekunde. Alle Aufrufe über eine zentrale Funktion mit Drosselung und
  Wiederholung bei HTTP 429 (exponentielles Backoff).
- API-Gateway: `https://api.lexware.io`.

## Designsystem

- **Nur Tokens verwenden.** Farben, Radien und Schatten kommen aus `src/styles/tokens.css` und dem Kunden-Theme.
  Keine festen Farbwerte in Komponenten (Ausnahmen nur im App-Rahmen, wo Weißtöne auf Anthrazit nötig sind).
- **Akzentfarbe nur als Fläche.** Text auf Akzent nutzt `text-accent-ink`. Akzent als Textfarbe nur über `text-accent-text`.
  Kontrast mindestens 4,5:1 für Text.
- **Schrift:** Inter, lokal über `@fontsource-variable/inter`. Kein Google-Fonts-CDN (DSGVO).
- **Bausteine** liegen in `src/components/ui` (allgemein) und `src/components/app` (App-spezifisch).
  Vor dem Bau einer neuen Komponente prüfen, ob es sie schon gibt. Alle Bausteine sind unter `/styleguide` sichtbar;
  neue Bausteine dort ergänzen.
- Sprache der Oberfläche: Deutsch, Beträge und Daten über `src/lib/format.ts` (de-DE).

## Kunden und Sonderkomponenten

- Kundeneigener Code liegt **ausschließlich** in `src/customers/<kunde>/`: `index.ts` (Konfiguration), `theme.css`, Logo,
  Sonderkomponenten. Es gibt kein eigenes Repository je Kunde.
- Ein Kunde ersetzt einen Basis-Baustein nur über einen Slot: Slot-Namen in `src/customers/types.ts`,
  Einbindung im Basiscode über `resolveSlot("Name", Basiskomponente)`, Zuordnung in `overrides` des Kunden.
  Der Basiscode wird für einen einzelnen Kunden nie geändert.
- Die aktive Instanz wird über `NEXT_PUBLIC_CUSTOMER_ID` gewählt. Neue Kunden in `src/customers/index.ts` registrieren
  und ihr `theme.css` in `src/app/globals.css` importieren (Selektor `[data-customer="<id>"]`).

## Go-live-Mindestkriterien (vor Echtdaten)

- [ ] RLS auf allen Tabellen, Policies getestet, Supabase Advisors ohne Warnung
- [ ] MFA für alle Nutzer aktiv
- [ ] Backups aktiv (Pro-Tarif, PITR) und eine Wiederherstellung einmal getestet
- [ ] Belegerstellung vollständig gegen das Lexware-Testkonto durchgespielt
- [ ] Datenübernahme aus Airtable als Probelauf auf Staging durchgeführt und geprüft
- [ ] ASVS-Level-1-Checkliste abgehakt
- [ ] AVV mit Sawin angepasst (Supabase direkt mit Sawin, Vercel als Unterauftragsverarbeiter von Luca)

Airtable und Make bleiben nach dem Start 2 bis 4 Wochen eingefroren als Rückfallebene.

## Arbeitsweise

- Erst auf Staging, nach Abnahme auf Produktion. Updates gebündelt einmal pro Woche.
- Vor jedem Commit: `npm run lint`, `npx tsc --noEmit`, `npm run build`.
- Next.js 16: vor neuem Code die Doku in `node_modules/next/dist/docs/` prüfen (siehe AGENTS.md).
