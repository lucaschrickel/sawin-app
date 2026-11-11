# Stand der App

Stand: 11.11.2026, nach Versand (vorläufig), Kopfzeile und OneDrive-Ablage. Vergleich mit dem Klick-Prototyp
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
| Anfragen | Aufmaßblatt | fehlt | Karte ist Platzhalter (Formulare) |
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
| Aufträge | Reiter Chat, Formulare & Protokolle | fehlt | nur Übersicht und Historie |
| Service | Tickets, Board, Service-Plan „Terminierbar“, Rechnung am Ticket, OneDrive-Ordner | fertig | |
| Montageplan | Plantafel komplett, Wochenplan-PDF | fertig | |
| Team | Kalender, Mitarbeiter, Fahrzeuge, Zeiterfassung, Abwesenheiten | fertig | |
| Einkauf | Lieferanten (Konditionen), Bestellungen | fertig | |
| Ablage | OneDrive über Microsoft Graph: Ordner ab Angebot, Umbenennen mit der AB, Beleg-PDFs, Upload, Zwischenspeicher, Nachladen | teilweise | gebaut und gegen einen nachgebauten Graph-Server getestet; die echte Verbindung zu Sawins Bibliothek (App-Registrierung, Test in `_App-Test`) steht aus |
| Kommunikation | Chat je Auftrag und Ticket | fehlt | Tabellen vorhanden |
| Formulare | Aufmaßblatt digital, Protokolle (PDF, Scan) | fehlt | Ablage für Scans steht bereit (Upload in den Unterordner) |
| Einstellungen | Firma, Benutzer, Montageplan, Belege & Artikel | fertig | |
| Einstellungen | Verbindungen (Lexware, OneDrive, E-Mail mit BCC je Belegart) | fertig | |
| Einstellungen | Versand (Standard-PDF-Gruppen) | verschoben auf V2 | hängt am Outlook-Versand |
| Einstellungen | Darstellung (Hell, Dunkel, System) | fehlt | Tokens für Dunkel vorhanden |
| Designsystem | Styleguide | teilweise | Farbwahl der Plantafel, Kopfzeile und Ablage-Karte noch nicht unter `/styleguide` |
| Übernahme | Datenübernahme aus Airtable | fehlt | |
| Vercel | Region `fra1`, Crons (Zahlungen, Ablage), Lexware-Webhook | teilweise | gebaut; Projekt auf Vercel noch nicht angelegt |
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
| OneDrive mit Sawins Bibliothek | offen: App-Registrierung (docs/uebergabe.md „OneDrive“), Test in `_App-Test` |
| Vorläufiger Versand mit Sawins Outlook | offen (mailto mit BCC prüfen) |
| Steuerberater | offen |
| Airtable-Übernahme | offen |
| ASVS Level 1, CSP mit Nonce | offen |
| AVV | offen |
| Übergabe-Anleitung | Vercel, Cron, Webhook, OneDrive (Entra) beschrieben |

## Build, Tests, Next.js

- `npm run lint`, `npx tsc --noEmit`, `npm run build`: ohne Fehler. `npm audit --omit=dev`: 0 Befunde.
- Next.js-Fehlerliste des Dev-Servers: leer (geprüft nach Block 3).
- Unit 86/86, RLS 85/85. Browser-Tests zuletzt grün: onedrive 24/24 (nachgebauter Graph-Server), kopfzeile 24/24,
  plantafel 39/39, montageplan 33/33, belege 46/46, lexware 51/51, zahlungen 16/16, katalog 14/14, kunden 28/28,
  anfragen 28/28, aufgaben 19/19, service 26/26, einkauf 30/30, dashboard 23/23, auftraege 28/28, team 26/26.
- Bekannt: Vercel-Crons laufen nur für Production und öfter als täglich erst ab dem Pro-Tarif. Serverfunktionen auf
  Vercel nehmen nur kleine Anfragen an; Uploads gehen deshalb direkt vom Browser in den Zwischenspeicher.
- `npm run test:onedrive` läuft nur mit leerem Zwischenspeicher auf Staging (Schutz vor Übertragung echter Dateien an
  den Test-Server).
