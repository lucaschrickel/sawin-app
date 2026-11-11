# Stand der App

Stand: 11.11.2026, nach Block 2 (Plantafel). Vergleich mit dem Klick-Prototyp (`docs/demo/sawin-demo.html`) und
`CLAUDE.md`. Wird nach jedem größeren Block aktualisiert.

**Entscheidung 11.11.2026:** Der E-Mail-Versand aus der App über Outlook (Microsoft Graph, PDF-Gruppen, BCC je
Belegart, Versandprotokoll) und die Monteur-App kommen in **Version 2**. In Version 1 gibt es einen vorläufigen Versand:
PDF herunterladen und Outlook per `mailto` öffnen; den Anhang fügt das Büro selbst hinzu.

## Module und Funktionen

| Bereich | Funktion | Stand | Begründung |
|---|---|---|---|
| Rahmen | Seitenleiste (Gruppen, einklappbar, Zähler, „folgt“) | fertig | wie Demo |
| Rahmen | Zurück-Verlauf „← vorherige Maske“ | teilweise | Brotkrumen und Zurück im Editor; Verlauf je Tab mit Filter und Ansicht fehlt |
| Rahmen | Globale Suche (Vorschläge, Ergebnisseite) | fehlt | Feld ist Platzhalter (Block 4) |
| Rahmen | „Neu“-Menü | fehlt | Platzhalter (Block 4) |
| Rahmen | Glocke | fehlt | Platzhalter; Hinweise rechnet das Dashboard schon (Block 4) |
| Rahmen | Lexware-Status und Benutzer im Fuß der Seitenleiste | fertig | |
| Dashboard | Geschäftsführung, Montage, Einkauf | fertig | echte Kennzahlen, Ansicht je Benutzer gemerkt |
| Aufgaben | Meine/Alle, Gruppen, Abhaken, Bezug | fertig | |
| Kunden | Stammdaten, Lieferadressen (Alt), Konditionen, § 13b | fertig | |
| Anfragen | Liste/Board, Varianten, Archiv, Verloren, Nachtrag, Termine | fertig | |
| Anfragen | Aufmaßblatt | fehlt | Karte ist Platzhalter (Formulare) |
| Belege | Editor, Nummernkreise, Ketten, Versionen, „Als übergeben markieren“, Duplizieren | fertig | |
| Belege | Lexware: Rechnung, Abschläge, Schlussrechnung (centgenau), Gutschrift, Ticket-Rechnung | fertig | e2e gegen das Testkonto |
| Belege | Teil-AB, Lieferschein, Teilrechnung | fertig | |
| Belege | Zahlungen, „Als bezahlt markieren“, Zahlungsbestätigung | fertig | Cron und Webhook gebaut, aktiv erst mit Vercel |
| Belege | Artikelkatalog, Textvorlagen, formatierte Beschreibungen | fertig | |
| Belege | Belegübersichten mit Vorschau-Leiste, Offene Forderungen | fertig | |
| Belege | Vorläufiger Versand: Download mit Dateinamen, `mailto` | fehlt | geplant (Versand vorläufig) |
| Belege | Versand per Outlook aus der App, PDF-Gruppen, BCC, Protokoll | verschoben auf V2 | Entscheidung 11.11.2026 |
| Aufträge | Liste mit AB-Vorschau, Board, Phasen, Prüfhinweis, Reklamation, Ware eingetroffen | fertig | |
| Aufträge | Reiter Chat, Formulare & Protokolle | fehlt | nur Übersicht und Historie |
| Aufträge | OneDrive-Ordner-Karte | fehlt | Block 3 |
| Service | Tickets, Board, Service-Plan „Terminierbar“, Rechnung am Ticket | fertig | |
| Montageplan | Plantafel: Kolonnen, Ressourcen, Pipeline, 1/4 Wochen, Duplizieren, Farbe, Reihenfolge, Sammelfreigabe, Konflikte | fertig | Block 2 |
| Montageplan | Wochenplan-PDF je Monteur oder Kolonne | fertig | Block 2 |
| Team | Kalender, Mitarbeiter, Fahrzeuge, Zeiterfassung, Abwesenheiten | fertig | |
| Einkauf | Lieferanten (Konditionen), Bestellungen (Sammelbestellung, geliefert) | fertig | |
| Kommunikation | Chat je Auftrag und Ticket (Realtime, @Erwähnung, Fotos) | fehlt | Tabellen vorhanden |
| Formulare | Aufmaßblatt digital, „In Angebot übernehmen“ | fehlt | Tabellen vorhanden |
| Formulare | Montageprotokoll, Servicebericht, Übergabeprotokoll (PDF, Scan) | fehlt | |
| Ablage | OneDrive (Ordner, Ablage der PDFs, Scans) | fehlt | Block 3 |
| Einstellungen | Firma, Benutzer, Montageplan, Belege & Artikel | fertig | |
| Einstellungen | Verbindungen (Lexware, OneDrive) | fehlt | Block 3 |
| Einstellungen | Versand (Standard-PDF-Gruppen, BCC je Belegart) | verschoben auf V2 | hängt am Outlook-Versand |
| Einstellungen | Darstellung (Hell, Dunkel, System) | fehlt | Tokens für Dunkel vorhanden |
| Designsystem | Styleguide | teilweise | Farbwahl der Plantafel noch nicht unter `/styleguide` |
| Übernahme | Datenübernahme aus Airtable | fehlt | |
| Vercel | Region `fra1`, Cron, Lexware-Webhook | teilweise | gebaut; Projekt auf Vercel noch nicht angelegt |
| Version 2 | Monteur-App | verschoben auf V2 | laut CLAUDE.md |
| Version 2 | Automatische Anfragen, KI-Agents | verschoben auf V2 | laut CLAUDE.md |

## Go-live-Checkliste (offen)

| Punkt | Stand |
|---|---|
| RLS, Policies, Advisors | RLS-Tests 82/82; einzige Advisor-Warnung: Schutz vor geleakten Passwörtern (Pro-Tarif) |
| MFA | in der App erzwungen; für alle echten Nutzer beim Einladen prüfen |
| SMTP, Sitzungsgrenze 60 Minuten, Passwortschutz | offen (Pro-Tarif, eigener SMTP) |
| Backups (PITR) und Wiederherstellungstest | offen |
| Lexware-Testpunkte | erledigt bis auf `vatfree` und das Zahlungs-Event (Webhook gebaut, Test mit Vercel) |
| Belegerstellung gegen das Testkonto | erledigt bis auf eine echte Bankzahlung |
| Nummernkreise mit Sawin | offen (nach Airtable-Übernahme) |
| E-Mail-Versand über Microsoft Graph | entfällt für Version 1 (V2); vorläufiger Versand per `mailto` |
| Steuerberater (Steuerarten, Pflichtangaben, Zahlungsbestätigung) | offen |
| Airtable-Übernahme als Probelauf | offen |
| ASVS-Level-1-Checkliste, CSP mit Nonce | offen |
| AVV | offen |
| Übergabe-Anleitung | Vercel, Cron, Webhook beschrieben; OneDrive folgt mit Block 3 |

## Build, Tests, Next.js

- `npm run lint`, `npx tsc --noEmit`, `npm run build`: ohne Fehler. `npm audit --omit=dev`: 0 Befunde.
- Next.js-Fehlerliste des Dev-Servers (`get_errors`): leer.
- Unit 72/72, RLS 82/82. Browser-Tests zuletzt grün: plantafel 39/39, montageplan 33/33, service 26/26, team 26/26,
  auftraege 28/28, zahlungen 16/16, lexware 51/51, katalog 14/14, übrige Module grün.
- Bekannt: Vercel-Crons laufen nur für Production und öfter als täglich erst ab dem Pro-Tarif.
