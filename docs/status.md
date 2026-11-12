# Stand der App

Stand: 12.11.2026, nach Formulare & Protokolle, Chat, erweiterter Suche, Zurück-Verlauf und Darstellung. Vergleich mit dem Klick-Prototyp
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
| Rahmen | Zurück-Verlauf „← vorherige Maske“ | fertig | Verlauf je Tab mit Filter und Reiter; Seitenleiste beginnt neu (nur Name der Maske); direkt geöffnet: fachlicher Pfad; Browser-Zurück verhält sich gleich |
| Rahmen | Globale Suche (Vorschläge je Bereich, Fundstelle, Pfeiltasten, Strg+K, Ergebnisseite) | fertig | Kunden, Anfragen, Aufträge, Belege (auch Positionen, Tags, Kommentar), Tickets, Lieferanten (auch Ansprechpartner), Bestellungen (auch Positionen), Aufgaben, Termine; Datenbankfunktion mit RLS |
| Rahmen | „Neu“-Menü | fertig | Kunde, Anfrage, Angebot, Auftrag, Ticket, Bestellung, Aufgabe; Dialoge öffnen direkt |
| Rahmen | Glocke | fertig | Hinweise wie im Dashboard, dazu überfällige Rechnungen, „in Lexware noch buchen“, Angebote nachfassen, Aufträge ohne Rechnung, Erwähnungen im Chat |
| Rahmen | Lexware-Status und Benutzer im Fuß der Seitenleiste | fertig | |
| Dashboard | Geschäftsführung, Montage, Einkauf | fertig | |
| Aufgaben | Meine/Alle, Gruppen, Abhaken, Bezug | fertig | |
| Kunden | Stammdaten, Lieferadressen (Alt), Konditionen, § 13b | fertig | |
| Anfragen | Liste/Board, Varianten, Archiv, Verloren, Nachtrag, Termine, OneDrive-Ordner | fertig | |
| Anfragen | Aufmaßblatt | fertig | Karte mit Aufmaßen, „In Angebot übernehmen“; nach der AB Verweis auf den Auftrag |
| Belege | Editor, Nummernkreise, Ketten, Versionen, „Als übergeben markieren“, Duplizieren | fertig | Spaltenbreiten der Positionstabelle ziehbar (Maus, Doppelklick, Tastatur), je Benutzer gespeichert, „Spalten zurücksetzen“ (12.11.2026) |
| Belege | Lexware: Rechnung, Abschläge, Schlussrechnung (centgenau), Gutschrift, Ticket-Rechnung | fertig | |
| Belege | Teil-AB, Lieferschein, Teilrechnung | fertig | |
| Belege | Zahlungen, „Als bezahlt markieren“, Zahlungsbestätigung | fertig | Cron und Webhook aktiv erst mit Vercel |
| Belege | Artikelkatalog, Textvorlagen, formatierte Beschreibungen | fertig | |
| Belege | Belegübersichten mit Vorschau-Leiste, Offene Forderungen | fertig | Klick auf die PDF-Kachel öffnet die Bearbeitung, wenn bearbeitbar, sonst Hinweis „Nicht mehr bearbeitbar“ (12.11.2026); Spaltenbreiten der Belegübersichten und der Aufträge-Liste ziehbar, je Benutzer gespeichert (13.11.2026) |
| Belege | Vorläufiger Versand: Download `<Nummer>_<Belegart>_<Kunde>.pdf`, „Versenden“ per `mailto` mit BCC | fertig | Angebot/AB eingefroren, Protokoll; Lexware-Belege nur mit Original |
| Belege | Versand per Outlook aus der App, PDF-Gruppen, Versandprotokoll mit Anhängen | verschoben auf V2 | Entscheidung 11.11.2026 |
| Aufträge | Liste mit AB-Vorschau, Board, Phasen, Prüfhinweis, Reklamation, Ware eingetroffen | fertig | |
| Aufträge | Karte „OneDrive-Ordner“ (Link, Dateien, Upload) | fertig | |
| Aufträge | Reiter Formulare & Protokolle | fertig | auch am Ticket |
| Service | Tickets, Board, Service-Plan „Terminierbar“, Rechnung am Ticket, OneDrive-Ordner | fertig | |
| Montageplan | Plantafel komplett, Wochenplan-PDF | fertig | |
| Team | Kalender, Mitarbeiter, Fahrzeuge, Zeiterfassung, Abwesenheiten | fertig | |
| Einkauf | Lieferanten (Konditionen), Bestellungen | fertig | Bestellung direkt in der Maske bearbeitbar (kein Dialog), Neue Bestellung unter /bestellungen/neu, Abfrage beim Verlassen (12.11.2026) |
| Ablage | OneDrive über Microsoft Graph: Ordner ab Angebot, Umbenennen mit der AB, Beleg-PDFs, Upload, Zwischenspeicher, Nachladen | fertig | mit Sawins Bibliothek „Kundenprojekte“ im Ordner `_App-Test` getestet (11.11.2026, localhost); auf Vercel mit dem Deployment |
| Kommunikation | Chat je Auftrag und Ticket (Erwähnungen, Fotos mit Kopie in OneDrive, ungelesen an Reiter, Liste und Board, löschen) | fertig | neue Nachrichten über Abfrage alle 10 s; Supabase Realtime mit der Monteur-App (V2) |
| Formulare | Aufmaßblatt digital (automatisch speichern, Abschließen/Wieder öffnen, PDF nach „03 Aufmaß - Freigabe“, Nachtragsangebot am Auftrag), Montageprotokoll, Servicebericht, Übergabeprotokoll (Vorlage drucken, Scan hochladen) | fertig | Checklisten je Produkt aus der Konfiguration (Startwerte aus der Demo, mit Sawin abstimmen) |
| Einstellungen | Firma, Benutzer, Montageplan, Belege & Artikel | fertig | |
| Einstellungen | Verbindungen (Lexware, OneDrive, E-Mail mit BCC je Belegart) | fertig | |
| Einstellungen | Versand (Standard-PDF-Gruppen) | verschoben auf V2 | hängt am Outlook-Versand |
| Anmeldung | Zwei-Faktor-Code: sendet nach 6 Ziffern selbst, Einfügen (auch mit Leerzeichen), nur Ziffern, one-time-code, kein doppeltes Absenden, falscher Code leert das Feld | fertig | 13.11.2026, test:anmeldung 31/31 |
| Konto | Passwort ändern (aktuelles Passwort serverseitig geprüft, aal2, andere Sitzungen abgemeldet, Audit-Log) | fertig | 13.11.2026, npm run test:konto 10/10 |
| Einstellungen | Darstellung (Hell, Dunkel, System; Seitenleiste hell oder dunkel) | fertig | je Benutzer; im Dunkelmodus Seitenleiste immer dunkel; Belege und Formulare bleiben hell (PDF) |
| Designsystem | Styleguide | fertig | auch Zurück-Knopf, Suchtreffer, Farbwahl der Plantafel, Ablage-Upload, Formular-Status, Chat |
| Übernahme | Datenübernahme aus Airtable | teilweise | Skript, Zuordnung, Altbestand-Schalter, Kopfbeleg, Storno und Prüfbericht fertig (`docs/airtable-uebernahme.md`, `npm run test:altbestand` 17/17). Probelauf auf Staging am 12.11.2026: 861 Kunden, 166 Anfragen, 105 Aufträge, 578 Belege, 148 Ordner, 8 Aufgaben, ohne Fehler; wiederholbar geprüft. Startwerte der Nummernkreise gesetzt, Go-live-Prüfung `npm run golive:pruefen`. Seit dem Merge (12.11.2026, Deployment „Ready“) läuft auf Vercel der neue Code. Offen: Lieferantenkürzel von Sawin |
| Vercel | Projekt, Region `fra1`, Crons (Zahlungen, Ablage), Lexware-Webhook | teilweise | läuft unter https://sawin-bauelemente-app.vercel.app (Production und Preview bis zum Go-live auf Staging); beide Crons mit 200 geprüft; Lexware-Webhook im Testkonto registriert; Browser-Tests gegen Vercel grün; Region des Proxys: Vercel › Logs › Seitenaufruf bzw. Header `x-vercel-id` |
| Version 2 | Monteur-App, Outlook-Versand, automatische Anfragen, KI-Agents | verschoben auf V2 | |

## Go-live-Checkliste (offen)

| Punkt | Stand |
|---|---|
| RLS, Policies, Advisors | RLS-Tests 92/92; Advisors: nur „Schutz vor geleakten Passwörtern“ (Pro-Tarif) |
| MFA | in der App erzwungen |
| SMTP, Sitzungsgrenze 60 Minuten, Passwortschutz | offen (Pro-Tarif, eigener SMTP) |
| Backups (PITR) und Wiederherstellungstest | offen |
| Lexware-Testpunkte | erledigt bis auf `vatfree` und das Zahlungs-Event (Webhook gebaut) |
| Belegerstellung gegen das Testkonto | erledigt bis auf eine echte Bankzahlung |
| Nummernkreise mit Sawin | festgelegt 12.11.2026: AG1261000, AB2261000, LS1000 (ohne Jahr), Kunden ab 30000 (`nummernkreis.start`); `npm run golive:pruefen` auf Staging ok; am Go-live gegen Sawins Lexware wiederholen |
| Testordner in `_App-Test` | Nach dem Go-live beim letzten Leeren von Staging mit entfernen (`npm run staging:leeren`). Vorerst bleiben sie stehen: Testordner der Browser-Tests und rund 20 Ordner, die der alte Ablage-Cron am 12.11.2026 vor dem Merge für übernommene Aufträge angelegt hat. Deren Verknüpfungen sind in Staging auf den Importstand zurückgesetzt. |
| OneDrive mit Sawins Bibliothek | erledigt in `_App-Test` (App-Registrierung „Sawin App Ablage“, Freigabe nur „Kundenprojekte“); Variablen in Vercel gesetzt, dort „verbunden“; offen: Basisordner `2026` in Produktion |
| Vorläufiger Versand mit Sawins Outlook | offen (mailto mit BCC prüfen) |
| Steuerberater | offen |
| Airtable-Übernahme | Probelauf auf Staging erledigt (12.11.2026); Go-live-Schritte in `docs/uebergabe.md` |
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
- **Erledigt 12.11.2026:**
  - Supabase-Auth (Staging): Site-URL ist die Vercel-Adresse, erlaubte Weiterleitungen `localhost:3000/**` und
    `sawin-bauelemente-app.vercel.app/**` (geprüft über die Management-API). Achtung: `.env.local` hat noch
    `SUPABASE_AUTH_SITE_URL=http://localhost:3000` und `config.toml` keine weiteren Weiterleitungen; vor dem nächsten
    `npm run auth:push` beides angleichen, sonst wird die Einstellung zurückgedreht.
  - Lexware-Webhook im Testkonto „Musterfirma“ für `https://sawin-bauelemente-app.vercel.app/api/lexware/webhook`
    registriert (`payment.changed`, `invoice.status.changed`, `credit-note.status.changed`); Adresse antwortet,
    unsignierte Aufrufe werden mit 401 abgelehnt.
  - Browser-Tests gegen Vercel: anmeldung 28/28, navigation 35/35, kopfzeile 24/24, dashboard 23/23, kunden 28/28,
    anfragen 28/28, aufgaben 19/19, auftraege 28/28, service 26/26, einkauf 30/30, team 26/26, seitenleiste 11/11,
    belege 46/46, plantafel 39/39, montageplan 33/33, katalog 14/14, oberflaeche 14/14, formulare 40/40, chat 26/26,
    zahlungen 16/16, lexware 51/51 (lexware und anmeldung je im zweiten Lauf; erster Lauf scheiterte an Wartezeiten bzw.
    an einem Testfehler beim sicheren Cookie, behoben). Formulare und Chat legen dabei echte Testordner in `_App-Test` an.
  - Antwort-Header eines Aufrufs aus Deutschland: `x-vercel-id: fra1::fra1::…`.

## Build, Tests, Next.js

- `npm run lint`, `npx tsc --noEmit`, `npm run build`: ohne Fehler. `npm audit --omit=dev`: 0 Befunde.
- Next.js-Fehlerliste des Dev-Servers: leer (geprüft nach Block 3).
- Unit 111/111, RLS 92/92. Browser-Tests 12.11.2026 (nach Suche, Zurück-Verlauf, Darstellung): navigation 35/35,
  kopfzeile 24/24, dashboard 23/23, seitenleiste 11/11, oberflaeche 14/14, kunden 28/28, anfragen 28/28, aufgaben 19/19,
  auftraege 28/28, service 26/26, belege 46/46, einkauf 30/30, team 26/26, plantafel 39/39, montageplan 33/33,
  katalog 14/14, chat 26/26, formulare 40/40, zahlungen 16/16, lexware 51/51, onedrive 24/24.
- Briefkopf der App-Belege (12.11.2026): DIN 5008 Form B (Anschrift ab 62,7 mm im Fenster, Belegdaten ab 50 mm, Text ab
  100 mm, Ränder 25/20 mm), keine Absenderzeile, Telefon nur oben rechts, Produktzeile unter dem Logo aus der
  Kundenkonfiguration (Schrift 5,9 pt, logobreit). Vorher/Nachher-Muster von Angebot, AB und Lieferschein geprüft.
- Staging: Die Firmendaten in Einstellungen › Firma sind Testwerte ("Testfirma …", Bank 999999) aus einem Browser-Test;
  vor dem Probelauf mit Sawin echte Firmendaten eintragen.
- PDFs (12.11.2026): Seitenzahl „Seite n von m“ auf Belegen, Formularen und Wochenplan (Schriftbild unverändert,
  Vorher/Nachher geprüft). Behoben: Im Server fehlten nach einem Wochenplan in folgenden PDFs Buchstaben (eigene
  Schriftfamilie je PDF). Der Beleg-Editor hat keinen eigenen Zurück-Pfeil mehr (Zurück nur oben links).
- Bekannt: Steht die Grußformel allein auf der letzten Seite, bekommt sie eine eigene Seite (Gruß und Firma bleiben
  zusammen); kein Fehler, aber bei vielen Positionen möglich.
- Ältere Läufe: Unit 86/86, RLS 85/85. Browser-Tests zuletzt grün: onedrive 24/24 (nachgebauter Graph-Server), kopfzeile 24/24,
  plantafel 39/39, montageplan 33/33, belege 46/46, lexware 51/51, zahlungen 16/16, katalog 14/14, kunden 28/28,
  anfragen 28/28, aufgaben 19/19, service 26/26, einkauf 30/30, dashboard 23/23, auftraege 28/28, team 26/26.
- Bekannt: Vercel-Crons laufen nur für Production und öfter als täglich erst ab dem Pro-Tarif. Serverfunktionen auf
  Vercel nehmen nur kleine Anfragen an; Uploads gehen deshalb direkt vom Browser in den Zwischenspeicher.
- `npm run test:onedrive` läuft nur mit leerem Zwischenspeicher auf Staging (Schutz vor Übertragung echter Dateien an
  den Test-Server).
