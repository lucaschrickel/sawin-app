@AGENTS.md

# Sawin Bauelemente App – Regeln für die Entwicklung

Browserbasierte Büro-App für Handwerksbetriebe. Pilotkunde ist Sawin Bauelemente.
Eine Codebasis, je Kunde eine eigene Instanz. Diese Datei gilt für jede Arbeit an diesem Repository.

## Grundsätze

- **Übergabefähig bauen.** Am Ende wird alles an den Kunden übergeben: Vercel, Supabase und GitHub.
  Keine fest eingetragenen Konten, Projekt-IDs, URLs oder E-Mail-Adressen im Code. Alle Zugänge über
  Umgebungsvariablen. Eine Übergabe-Anleitung liegt im Repository (`docs/uebergabe.md`) und wird bei jeder neuen
  Umgebungsvariable, jedem neuen Dienst und jedem neuen manuellen Schritt aktualisiert.
  Luca behält das Recht, den Code weiterzuverwenden.
- **PDFs erzeugt die App selbst.**
  - Angebote, Auftragsbestätigungen und Lieferscheine: Das App-PDF ist das Original.
  - Rechnungen und Gutschriften: Sofort eine App-Vorschau mit Wasserzeichen „Entwurf“. Sobald Lexware das
    Original-PDF liefert, ersetzt die App die Vorschau automatisch. **Nur das Lexware-PDF darf versendet werden.**

## Architektur (festgelegt am 17.10.2026)

- **Frontend:** Next.js (App Router, TypeScript, Tailwind v4), gehostet auf Vercel, ein Projekt je Kunde.
  Bis zur Übergabe im Team von Luca. Funktionen laufen in der Region `fra1`, nie in der Standardregion `iad1`.
- **Backend:** Supabase im Konto des Kunden, Region Frankfurt, je Kunde zwei Projekte: Staging und Produktion.
  Supabase liefert Anmeldung (Auth), Datenbank (Postgres mit RLS), Dateien (Storage) und Edge Functions.
- **Belege:** Lexware Office ist führend. Die App legt Angebote, Auftragsbestätigungen, Lieferscheine, Rechnungen
  und Gutschriften über die Lexware-API an. Abschlagsrechnungen legt das Büro in Lexware an, die App übernimmt sie
  über Lexware-Event-Subscriptions. Belegnummern kommen immer von Lexware, die App vergibt keine eigenen.
  PDFs siehe Grundsätze. Den Status Angenommen/Abgelehnt eines Angebots führt die App selbst, weil die API ihn
  nicht ändern kann.
- **OneDrive:** Auftragsordner (sechs Unterordner) über Microsoft Graph, Umbenennung bei erster AB.
- **KI-Agents (Version 2)** laufen als eigener Hintergrunddienst an einer Warteschlange in Supabase, nicht im Frontend.

## Anforderungen Version 1

Ein Klick-Prototyp liegt in `docs/demo/sawin-demo.html` (im Browser öffnen). Er ist Vorlage für Aufbau, Optik und
Abläufe. Wo er von dieser Datei abweicht, gilt diese Datei. Abweichungen sind zum Beispiel: Artikelkatalog,
andere Auftragsphasen, tagesgenaue Plantafel, Zeiten ohne Auftrag, „Direkt genehmigen“ durch das Büro,
Zeitfreigabe und Monteur-App.

### Kunden (Endkunden des Betriebs)

- Kunden werden nur in der App angelegt und geändert.
- Übertragung an Lexware erst beim ersten Beleg für diesen Kunden. Danach laufen Änderungen nur in Richtung
  App → Lexware, nie zurück.
- Die Kundenseite zeigt alle Anfragen, Aufträge und Belege des Kunden.

### Anfragen

- Werden händisch erfasst, nichts automatisch.
- Ablauf: Anfrage → Aufmaß/Besichtigung → Angebot → bei Annahme per Knopf Auftrag.

### Aufträge (Pipeline)

- Phasen: Bestellt, Ware eingetroffen, Montage geplant, Montiert, Abgerechnet, Abgeschlossen.
- Im Auftrag steht die komplette Belegkette als Historie.

### Belege

- Positionen werden frei eingetippt, es gibt keinen Artikelstamm.
- Belege bauen aufeinander auf: Angebot → AB → Lieferschein → Rechnung. Positionen werden übernommen.
- Von jedem Beleg führt ein Sprung zum Auftrag und zu den anderen Belegen der Kette.

### Aufgaben

- Zuweisung an eine Person, Fälligkeitsdatum, optional verknüpft mit Kunde oder Auftrag.

### Montageplan (Plantafel)

- Zeilen sind Monteure, waagerecht läuft die Zeit, stundengenau.
- Einsätze per Maus verlängern und verkürzen sowie senkrecht zu einem anderen Monteur verschieben.
- Ein Einsatz kann mehrere Monteure haben und erscheint dann in jeder beteiligten Zeile.
- Arbeitszeit standardmäßig 7 bis 16 Uhr, in den Einstellungen änderbar.
- Abwesenheiten werden in der Tafel angezeigt, beantragte anders als genehmigte. Abgelehnte nicht.
- **Ungeplant-Spalte:** Aufträge ohne Montagetermin stehen neben der Tafel und werden auf einen Monteur oder eine
  Kolonne gezogen. Ein Einsatz, der zurück in die Spalte gezogen wird, verliert seinen Termin.
- **Konfliktwarnung:** Ist ein eingeplanter Monteur im Zeitraum abwesend (genehmigt oder beantragt), wird der
  Einsatz markiert und beim Einplanen gewarnt. Die Warnung blockiert nicht.
- **Kolonnen:** feste Teams mit Stammfahrzeug. Die Kolonne ist eine Gruppenzeile über ihren Monteuren.
  Ziehen auf die Kolonne bucht alle Mitglieder und das Fahrzeug.
- **Fahrzeuge:** eigene Zeilen in der Tafel. Ein Einsatz hat höchstens ein Fahrzeug.
- Kolonnen und Fahrzeuge werden in der App gepflegt.

### Team

- Mitarbeiterverwaltung: Name, Kürzel (eindeutig), Rolle, Telefon, Kennzeichen „Monteur“ (erscheint in der Plantafel).
- Zeiterfassung: Das Büro trägt Zeiten ein, jede Buchung ist immer einem Auftrag zugeordnet.
  - Felder: Mitarbeiter, Auftrag, Datum, Beginn, Ende, Pause in Minuten, Art, Tätigkeit (Freitext).
    Die Stunden werden berechnet, Ende muss nach Beginn liegen.
  - Arten: Montage, Aufmaß, Service, Lager / Werkstatt, Fahrt, Büro.
  - Oben die Wochensumme je Mitarbeiter für die laufende Kalenderwoche.
  - Keine Freigabe-Stufe in Version 1.
- Abwesenheiten: Anträge trägt in Version 1 das Büro ein.
  - Arten: Urlaub, Krank, Schulung, Überstundenabbau, Sonstiges.
  - Status: Beantragt, Genehmigt, Abgelehnt. Genehmigen und Ablehnen nur durch `admin`.
    Ausnahme: Eine Krankmeldung gilt sofort als genehmigt.
  - Genehmigungsübersicht: offene Anträge mit Person, Art, Zeitraum, Arbeitstagen, Resturlaub danach und Hinweis,
    wenn die Person in dem Zeitraum eingeplant ist.
  - Kennzahlen oben: zur Genehmigung, heute abwesend, Personen mit Abwesenheit in der laufenden Woche.
  - Urlaubskonto je Mitarbeiter und Jahr: Anspruch (Standard 30 Tage, in den Einstellungen änderbar), genehmigt,
    beantragt, Rest. Gezählt werden Arbeitstage (Montag bis Freitag).

### Version 2 (nicht in Version 1)

Monteur-App (Zeiten und Anträge selbst erfassen), Artikelstamm, automatische Anfragen, KI-Agents.

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
6. **Rollen in Version 1:** Alle Nutzer haben gleiche Rechte. Nur `admin` verwaltet Benutzer und genehmigt
   Abwesenheiten (Krankmeldungen gelten ohne Genehmigung). Die Prüfung liegt in der RLS-Policy. Rolle `monteur` ist im Datenmodell vorgesehen, aber noch ungenutzt.
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

## Instanzen und Sonderkomponenten

„Kunde“ meint in diesem Abschnitt den Betrieb, für den eine Instanz läuft (z. B. Sawin), nicht dessen Endkunden.

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
- [ ] Belegerstellung vollständig gegen das Lexware-Testkonto durchgespielt, inklusive Austausch der
      Entwurfs-Vorschau durch das Lexware-PDF
- [ ] Datenübernahme aus Airtable als Probelauf auf Staging durchgeführt und geprüft
- [ ] ASVS-Level-1-Checkliste abgehakt
- [ ] AVV mit Sawin angepasst (Supabase direkt mit Sawin, Vercel bis zur Übergabe als Unterauftragsverarbeiter von Luca)
- [ ] Übergabe-Anleitung vollständig: alle Umgebungsvariablen, Dienste und manuellen Schritte beschrieben

Airtable und Make bleiben nach dem Start 2 bis 4 Wochen eingefroren als Rückfallebene.

## Arbeitsweise

- Erst auf Staging, nach Abnahme auf Produktion. Updates gebündelt einmal pro Woche.
- Vor jedem Commit: `npm run lint`, `npx tsc --noEmit`, `npm run build`.
- Next.js 16: vor neuem Code die Doku in `node_modules/next/dist/docs/` prüfen (siehe AGENTS.md).
