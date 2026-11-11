# Stand der App

Stand: 12.11.2026, nach Formulare & Protokolle. Vergleich mit dem Klick-Prototyp
(`docs/demo/sawin-demo.html`) und `CLAUDE.md`. Wird nach jedem größeren Block aktualisiert.

**Entscheidungen 11.11.2026:**
- Der E-Mail-Versand aus der App über Outlook (Microsoft Graph, PDF-Gruppen, BCC, Versandprotokoll) und die Monteur-App
  kommen in **Version 2**. In Version 1 gibt es den vorläufigen Versand: PDF herunterladen und Outlook per `mailto`.
- OneDrive-Ordner entstehen mit dem **ersten Angebot** (`<AG-Nummer>_<Kunde>`) und werden mit der AB in
  `<AB-Nummer>_<Kunde>` umbenannt (derselbe Ordner); Unterordner wie im bisherigen Make-Szenario.

## Module und Funktionen

| Bereich | Funktion | Stand | Begründung |
|---|---|---|---|
| Rahmen | Seitenleiste (Gruppen, einklappbar, Zähler, „folgt“) | fertig | wie Demo |
| Rahmen | Zurück-Verlauf „← vorherige Maske“ | teilweise | Brotkrumen und Zurück im Editor; Verlauf je Tab mit Filter und Ansicht fehlt |
| Rahmen | Globale Suche (Vorschläge je Bereich, Fundstelle, Pfeiltasten, Strg+K, Ergebnisseite) | fertig | Kunden, Anfragen, Aufträge, Belege (auch Positionen, Tags, Kommentar), Tickets; Datenbankfunktion mit RLS. Lieferanten, Bestellungen, Aufgaben, Termine aus der Demo noch nicht |
| Rahmen | „Neu“-Menü | fertig | Kunde, Anfrage, Angebot, Auftrag, Ticket, Bestellung, Aufgabe; Dialoge öffnen direkt |
| Rahmen | Glocke | fertig | Hinweise wie im Dashboard, dazu überfällige Rechnungen, „in Lexware noch buchen“, Angebote nachfassen, Aufträge ohne Rechnung; Chat-Erwähnungen folgen mit dem Chat |
| Rahmen | Lexware-Status und Benutzer im Fuß der Seitenleiste | fertig | |
| Dashboard | Geschäftsführung, Montage, Einkauf | fertig | |
| Aufgaben | Meine/Alle, Gruppen, Abhaken, Bezug | fertig | |
| Kunden | Stammdaten, Lieferadressen (Alt), Konditionen, § 13b | fertig | |
| Anfragen | Liste/Board, Varianten, Archiv, Verloren, Nachtrag, Termine, OneDrive-Ordner | fertig | |
| Anfragen | Aufmaßblatt | fertig | Karte mit Aufmaßen, „In Angebot übernehmen“; nach der AB Verweis auf den Auftrag |
| Belege | Editor, Nummernkreise, Ketten, Versionen, „Als übergeben markieren“, Duplizieren | fertig | |
| Belege | Lexware: Rechnung, Abschläge, Schlussrechnung (centgenau), Gutschrift, Ticket-Rechnung | fertig | |
| Belege | Teil-AB, Lieferschein, Teilrechnung | fertig | |
| Belege | Zahlungen, „Als bezahlt markieren“, Zahlungsbestätigung | fertig | Cron und Webhook aktiv erst mit Vercel |
| Belege | Artikelkatalog, Textvorlagen, formatierte Beschreibungen | fertig | |
| Belege | Belegübersichten mit Vorschau-Leiste, Offene Forderungen | fertig | |
| Belege | Vorläufiger Versand: Download `<Nummer>_<Belegart>_<Kunde>.pdf`, „Versenden“ per `mailto` mit BCC | fertig | Angebot/AB eingefroren, Protokoll; Lexware-Belege nur mit Original |
| Belege | Versand per Outlook aus der App, PDF-Gruppen, Versandprotokoll mit Anhängen | verschoben auf V2 | Entscheidung 11.11.2026 |
| Aufträge | Liste mit AB-Vorschau, Board, Phasen, Prüfhinweis, Reklamation, Ware eingetroffen | fertig | |
| Aufträge | Karte „OneDrive-Ordner“ (Link, Dateien, Upload) | fertig | |
| Aufträge | Reiter Formulare & Protokolle | fertig | auch am Ticket |
| Aufträge | Reiter Chat | fehlt | Tabellen vorhanden |
| Service | Tickets, Board, Service-Plan „Terminierbar“, Rechnung am Ticket, OneDrive-Ordner | fertig | |
| Montageplan | Plantafel komplett, Wochenplan-PDF | fertig | |
| Team | Kalender, Mitarbeiter, Fahrzeuge, Zeiterfassung, Abwesenheiten | fertig | |
| Einkauf | Lieferanten (Konditionen), Bestellungen | fertig | |
| Ablage | OneDrive über Microsoft Graph: Ordner ab Angebot, Umbenennen mit der AB, Beleg-PDFs, Upload, Zwischenspeicher, Nachladen | fertig | mit Sawins Bibliothek „Kundenprojekte“ im Ordner `_App-Test` getestet (11.11.2026, localhost); auf Vercel mit dem Deployment |
| Kommunikation | Chat je Auftrag und Ticket | fehlt | Tabellen vorhanden |
| Formulare | Aufmaßblatt digital (automatisch speichern, Abschließen/Wieder öffnen, PDF nach „03 Aufmaß - Freigabe“, Nachtragsangebot am Auftrag), Montageprotokoll, Servicebericht, Übergabeprotokoll (Vorlage drucken, Scan hochladen) | fertig | Checklisten je Produkt aus der Konfiguration (Startwerte aus der Demo, mit Sawin abstimmen) |
| Einstellungen | Firma, Benutzer, Montageplan, Belege & Artikel | fertig | |
| Einstellungen | Verbindungen (Lexware, OneDrive, E-Mail mit BCC je Belegart) | fertig | |
| Einstellungen | Versand (Standard-PDF-Gruppen) | verschoben auf V2 | hängt am Outlook-Versand |
| Einstellungen | Darstellung (Hell, Dunkel, System) | fehlt | Tokens für Dunkel vorhanden |
| Designsystem | Styleguide | teilweise | Farbwahl der Plantafel, Kopfzeile und Ablage-Karte noch nicht unter `/styleguide` |
| Übernahme | Datenübernahme aus Airtable | fehlt | |
| Vercel | Projekt, Region `fra1`, Crons (Zahlungen, Ablage), Lexware-Webhook | teilweise | läuft unter https://sawin-bauelemente-app.vercel.app (Production und Preview bis zum Go-live auf Staging); beide Crons mit 200 geprüft; offen siehe „Vercel“ unten |
| Version 2 | Monteur-App, Outlook-Versand, automatische Anfragen, KI-Agents | verschoben auf V2 | |

## Go-live-Checkliste (offen)

| Punkt | Stand |
|---|---|
| RLS, Policies, Advisors | RLS-Tests 85/85; Advisors: nur „Schutz vor geleakten Passwörtern“ (Pro-Tarif) |
| MFA | in der App erzwungen |
| SMTP, Sitzungsgrenze 60 Minuten, Passwortschutz | offen (Pro-Tarif, eigener SMTP) |
| Backups (PITR) und Wiederherstellungstest | offen |
| Lexware-Testpunkte | erledigt bis auf `vatfree` und das Zahlungs-Event (Webhook gebaut) |
| Belegerstellung gegen das Testkonto | erledigt bis auf eine echte Bankzahlung |
| Nummernkreise mit Sawin | offen |
| OneDrive mit Sawins Bibliothek | erledigt in `_App-Test` (App-Registrierung „Sawin App Ablage“, Freigabe nur „Kundenprojekte“); offen: Variablen in Vercel, Basisordner `2026` in Produktion |
| Vorläufiger Versand mit Sawins Outlook | offen (mailto mit BCC prüfen) |
| Steuerberater | offen |
| Airtable-Übernahme | offen |
| ASVS Level 1, CSP mit Nonce | offen |
| AVV | offen |
| Übergabe-Anleitung | Vercel, Cron, Webhook, OneDrive (Entra) beschrieben |

## Vercel (Stand 11.11.2026)

- Ein Projekt „sawin-app“ (Team Luca, Pro). Production = Branch `main` unter https://sawin-bauelemente-app.vercel.app,
  Preview = übrige Branches. **Bis zum Go-live zeigen beide auf Staging** (Supabase sawin-staging, Lexware-Testkonto,
  OneDrive-Basisordner `_App-Test`). Zum Go-live nur die Production-Variablen auf Produktion umstellen.
- Umgebungsvariablen für Production und Preview gesetzt; `CRON_SECRET` und `MS_TOKEN_SCHLUESSEL` je Umgebung eigen.
  Lexware (Konto „Musterfirma“) und OneDrive auf der Vercel-Adresse „verbunden“.
- Crons `/api/cron/zahlungsabgleich` und `/api/cron/ablage` von Hand ausgelöst: Status 200. Deployment-Schutz für
  Production aus (Webhook muss erreichbar sein; die App verlangt selbst Anmeldung mit MFA).
- **Offen – Region des Proxys:** Beim Cron-Aufruf lief der Proxy (`src/proxy.ts`, Sitzungsprüfung) in **iad1**
  (Washington), die Funktion selbst in fra1. Vermutung: Vercel führt den Proxy im Rechenzentrum aus, das dem Aufrufer
  am nächsten ist (Crons starten in den USA); `regions` in `vercel.json` gilt nur für Serverfunktionen. Für Cron
  und Webhook unkritisch (der Proxy lässt `/api/cron/` und `/api/lexware/` ohne Sitzung durch). **Zu prüfen:** Region
  des Proxys bei einem Seitenaufruf aus Deutschland (Vercel › Logs › Request Logs › Execution › Region). fra1 → in
  Ordnung, festhalten; andere Region → Entscheidung nötig (z. B. Sitzungsprüfung aus dem Proxy in die Serverfunktionen
  verlagern), weil CLAUDE.md iad1 bzw. Regionen außerhalb Frankfurts ausschließt.
- **Offen – nächste Schritte:** Supabase-Auth (Staging) auf die Vercel-Adresse umstellen (`SUPABASE_AUTH_SITE_URL`,
  `localhost:3000` als weitere Weiterleitung, `npm run auth:push`), Lexware-Webhook im Testkonto für
  `https://sawin-bauelemente-app.vercel.app/api/lexware/webhook` registrieren, Browser-Tests gegen die Vercel-Adresse.

## Build, Tests, Next.js

- `npm run lint`, `npx tsc --noEmit`, `npm run build`: ohne Fehler. `npm audit --omit=dev`: 0 Befunde.
- Next.js-Fehlerliste des Dev-Servers: leer (geprüft nach Block 3).
- Unit 96/96, RLS 89/89. Browser-Tests 12.11.2026: formulare 40/40, anfragen 28/28, auftraege 28/28, service 26/26,
  belege 46/46, plantafel 39/39, onedrive 24/24.
- Bekannt: Beleg-PDFs zeigen keine Seitenzahl („Seite n von m“). react-pdf 4 rendert render-Texte nicht, solange die
  Seite eine lineHeight hat; Umbau (lineHeight je Block statt an der Seite) ändert das geprüfte Schriftbild, deshalb
  noch offen. Fußzeilen von Wochenplan und Formularen waren aus demselben Grund leer und sind behoben.
- Ältere Läufe: Unit 86/86, RLS 85/85. Browser-Tests zuletzt grün: onedrive 24/24 (nachgebauter Graph-Server), kopfzeile 24/24,
  plantafel 39/39, montageplan 33/33, belege 46/46, lexware 51/51, zahlungen 16/16, katalog 14/14, kunden 28/28,
  anfragen 28/28, aufgaben 19/19, service 26/26, einkauf 30/30, dashboard 23/23, auftraege 28/28, team 26/26.
- Bekannt: Vercel-Crons laufen nur für Production und öfter als täglich erst ab dem Pro-Tarif. Serverfunktionen auf
  Vercel nehmen nur kleine Anfragen an; Uploads gehen deshalb direkt vom Browser in den Zwischenspeicher.
- `npm run test:onedrive` läuft nur mit leerem Zwischenspeicher auf Staging (Schutz vor Übertragung echter Dateien an
  den Test-Server).
