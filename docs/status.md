# Stand der App

Stand: 13.11.2026, Produktion aufgebaut (Go-live-Vorbereitung, `docs/golive.md`). Vergleich mit dem Klick-Prototyp
(`docs/demo/sawin-demo.html`) und `CLAUDE.md`. Wird nach jedem größeren Block aktualisiert.

**Entscheidungen 11.11.2026:**
- Der E-Mail-Versand aus der App über Outlook (Microsoft Graph, PDF-Gruppen, BCC, Versandprotokoll) und die Monteur-App
  kommen in **Version 2**. In Version 1 gibt es den vorläufigen Versand: PDF herunterladen und Outlook per `mailto`.
- OneDrive-Ordner entstehen mit dem **ersten Angebot** (`<AG-Nummer>_<Kunde>`) und werden mit der AB in
  `<AB-Nummer>_<Kunde>` umbenannt (derselbe Ordner); Unterordner wie im bisherigen Make-Szenario.

## Go-live-Vorbereitung 13.11.2026 (Produktion aufgebaut)

Ablauf, Befehle, Vercel-Variablen und Checkliste für den Go-live-Tag: `docs/golive.md`.

**Erledigt (Produktion `sawin-produktion`, Ref `zqjrxxrvhbrnhknkmpqh`):**
- Alle 54 Migrationen eingespielt; Schema identisch mit Staging (`npm run golive:schema`); Advisors ohne Warnung.
- Nummernkreise AG1261000, AB2261000, LS1000, Kunden ab 30000; Arbeitszeit 7–16 Uhr; OneDrive-Basisordner „2026“ vorbelegt.
- Kundenimport nur Stammdaten (`--nur-kunden`), geschrieben: 861 Kunden (alle mit Lexware-Kontakt-ID und bisheriger
  Kundennummer, höchste 10874), 143 Lieferadressen; keine Vorgänge oder Belege. Go-live-Datum 13.11.2026.
- Dubletten-Suche mit übernommenen Kunden geprüft (Browser-Test `test:kontakte`, Fälle 4 und 5).
- Werkzeuge: `scripts/prod.mjs` (ein Befehl gegen Produktion, Staging-Zugänge geleert), `benutzer:anlegen` (Startpasswort,
  Pflicht zum Ändern bei der ersten Anmeldung), `golive:geheimnisse`, `golive:vercel`, `golive:schema`,
  `backup:pruefen`; Go-live-Prüfung zeigt Lexware-Konto und organizationId.
- Go-live-Prüfung gegen Produktion nur lesend (ohne Lexware): alle Startwerte ok.

**Offen bzw. von Luca:**
- Ersten Admin anlegen (Befehl vorbereitet, Startpasswort gibt Luca verdeckt ein).
- Auth-Konfiguration in Produktion: Das persönliche Supabase-Token darf die Konfiguration von sawin-produktion nicht
  lesen; im Dashboard setzen oder ein Token mit Rechten geben.
- Dashboard-Schritte, Vercel Production (heute noch auf Staging, `golive:vercel` meldet das), Lexware-Schlüssel,
  Webhook, Branch-Schutz, Wiederherstellungstest: Checkliste in `docs/golive.md`.

## Sicherheitsprüfung 13.11.2026 (OWASP ASVS 5.0, Level 1) und Umsetzung für den Go-live

Bericht mit Status je Fund: `docs/sicherheit.md`.

**Prüfung:** 140 Funde, davon 138 nach unabhängiger Gegenprüfung bestätigt (0 kritisch, 3 hoch, 14 mittel, 75 niedrig,
46 Hinweise). ASVS bei der Prüfung 41 erfüllt, 22 nicht erfüllt, 7 nicht relevant; **nach der Umsetzung 46 erfüllt,
17 nicht erfüllt, 7 nicht relevant**.

**Umgesetzt (jeder Block mit Tests und Build grün, einzeln gepusht):**
- Prüfung (8e836fa): hohe Funde – Admin-Einstellungen nur noch für Admins in der Datenbank, keine Genehmigung über
  „krank“.
- Block A (d04e6b0): Next.js 16.4.6, React 19.3.1; Tests und `staging:leeren` nur gegen `ERLAUBTES_TESTPROJEKT`
  (API- und Datenbank-Adresse); 24 verwaiste Test-Admins entfernt, Tests räumen selbst auf.
- Block B (43aadd0): Belege unveränderbar (GoBD): PDFs nur vom Server mit SHA-256 im Audit-Log, Belegart/Kette/Vorgänger
  fest, Belege, Positionen, Versionen, Versand und Zahlungen nur über die App-Funktionen, Summen aus der Datenbank.
- Block C (c62e274): Sitzungscookies httpOnly, Aktivitäts-Cookie an die Sitzung gebunden, `sicheresZiel` gehärtet,
  Sperre je Konto nach 10 Fehlversuchen, Passwort ohne das bisherige nur nach Link, Abmelden nur von derselben Herkunft,
  Konto-Historie geschützt, Funktionen im Schema `app` gezielt freigegeben.
- Block D: CSP mit Nonce je Anfrage (ohne Partial Prerendering; Seitenwechsel gemessen, nicht spürbar langsamer),
  `Cache-Control: private, no-store`, Sitzungsprüfung am Anfang jeder Route, deutsche Fehlerseiten, `npm run test:csp`.
- Tests am Ende: Unit 140/140, RLS 101/101, alle Browser-Tests einschließlich CSP; Supabase-Advisors nur die bekannte
  Warnung zum Passwortschutz (Dashboard-Schritt).

**Dashboard-Schritte (Luca):** Checkliste in `docs/uebergabe.md` („Checkliste Dashboard-Schritte vor dem Go-live“):
Passwortschutz (HaveIBeenPwned), Sessions 12 h / 60 min, sicherer Passwortwechsel, SMTP, Rate Limits ablesen, Redirect-URLs,
PITR mit Wiederherstellungstest, Realtime, Schlüssel erneuern, Vercel-Variablen.

### Offene Entscheidungen aus der Sicherheitsprüfung

1. **M9 – Staging mit Echtdaten und Sawins Bibliothek:** Staging hängt an Sawins echter SharePoint-Bibliothek (dieselbe
   App-Registrierung wie Produktion) und enthält Echtdaten aus Airtable. Vorschlag: eigene App-Registrierung mit einer
   Test-Bibliothek für Staging. **Bis dahin Staging wie Produktion behandeln** (Dashboard-Checkliste auch für Staging,
   keine Testkonten stehen lassen, kein `staging:leeren` ohne Sicherung des Audit-Logs). Alternativ den Staging-Import
   pseudonymisieren. Entscheidung und Rechtsgrundlage in der AVV festhalten.
2. **Passwortregel:** ASVS 5.0 verlangt keine Pflicht für Zeichenklassen (V6.2.5), dafür eine Prüfung gegen geleakte
   Passwörter (V6.2.4). Die App verlangt Groß/klein und Ziffer. Vorschlag: Zeichenklassen streichen, 12 Zeichen
   behalten, HaveIBeenPwned einschalten (Dashboard).

### Nach dem Go-live (niedrige Funde, Vorschläge in `docs/sicherheit.md`)

- Fehlermeldungen: technische Texte von Postgres, Speicher, Lexware und Graph nicht an den Browser weitergeben
  (F23, F40, F66, F95, F96, F132).
- Datenbank-Härtung: Prüfungen auch in der Datenbank statt nur in der App (HTML, URLs, Foto-Pfade, Längen; F43, F45,
  F128), Benachrichtigungen nur über den Server (F04), `app.loeschen` und Ablage (F42), `app.basis` (F08, F87),
  Standardrechte im Schema public (F09).
- Anmeldung und Protokoll: Zwei-Faktor-Zurücksetzen, Admin-Aktionen und Cron-Aufrufe ohne Secret ins Audit-Log (F22,
  F97, F117); Lesezugriffe als Datenbank-Owner (F99); E-Mail-Kontingent bei „Passwort vergessen“ (F137).
- Webhook und Crons: organizationId gegen das eigene Lexware-Konto prüfen (F32, F63, F113), Body-Grenze vor dem Lesen
  (F33), Laufsperren für Ablage-Cron und „Jetzt nachladen“ (F34, F138), Präfix der Maschinen-Pfade (F35).
- Uploads und Speicher: Mengenbegrenzung und Aufräumen nicht abgeschlossener Uploads (F46, F130), MIME-Typen des
  Zwischenspeichers (F86), Laufzeit der signierten Foto-Adressen (F129), PDF-Vorschau ohne Größengrenze (F135).
- Lexware: serverseitige Sperre gegen parallele Aufrufe (F133), Original-PDF nicht erneut holen (F134).
- Graph: Adressen nicht über Umgebungsvariablen umlenkbar, IDs kodieren (F28, F64, F65).
- Header: Cross-Origin-Opener-Policy (F56).
- Logs ohne Kundennamen (F27, F98).
- Abläufe: Geheimnis-Prüfung und CI (Audit, Lint, Build) für das Repository (F25, F74), Fristen für Sicherheitsupdates
  (F71), moderate Befunde in Entwicklungsabhängigkeiten (F72), `.gitignore` für Schlüsseldateien (F26), Dokumentation
  „nur gegen Staging“ (F122).

## Nachtauftrag 13.11.2026 (autonom, direkt auf main)

**Erledigt** (jeder Block mit Tests und Build grün, einzeln committet und gepusht):
1. Passwort ändern im Benutzermenü (aal2, aktuelles Passwort serverseitig geprüft, andere Sitzungen abgemeldet, Audit-Log).
2. Zwei-Faktor-Code: sendet nach 6 Ziffern selbst, Einfügen, nur Ziffern, kein doppeltes Absenden.
3. Übergang Lexware → App: keine doppelten Kunden (Abgleich über Kundennummer, E-Mail, Name, Adresse; bei Unsicherheit
   wählt das Büro), unbekannte Lexware-Belege im Zahlungsabgleich und Webhook ignoriert (nur Protokoll), Go-live-Datum in
   Einstellungen › Verbindungen mit Hinweis im Dashboard, Kurzanleitung fürs Büro in `docs/uebergabe.md`.
   Die Go-live-Prüfung der Nummernkreise gab es schon (`npm run golive:pruefen`).
4. Dunkles Theme wie in der Demo: gestaffelte warme Grautöne statt Schwarz, alle Text/Fläche-Paare ≥ 4,5:1.
5. Anmeldeseite: Sawin-Logo im Mittelpunkt, dezent „Umgesetzt von“ (Produkt-Einstellung, abschaltbar mit `UMGESETZT_VON=aus`).
6. Gefühlte Ladezeit: Seitenleiste und Kopfzeile im Layout (bleiben stehen), Platzhalter je Bereich im Aufbau der Seite
   ohne Daten, Prefetch der App-Shell, Dashboard-Kennzahlen per Suspense.
7. Volle Breite: Inhaltsbereich ohne Höchstbreite, Formulare in Lesebreite, 1920/768/390 px ohne waagerechtes Scrollen.
- Abschluss: neue Bausteine im Styleguide (Lade-Platzhalter, Umgesetzt von, Lexware-Kontakt wählen), hell und dunkel im
  Browser geprüft; Unit 133/133, RLS 92/92, alle Browser-Tests grün (einzelne Ausreißer bei Wiederholung grün);
  Supabase Advisors unverändert (nur die bekannte Pro-Tarif-Warnung zum Passwortschutz).

**Übersprungen bzw. nicht ausgeführt:**
- `npm run test:onedrive`: Der Test verweigert den Lauf, weil auf Staging 23 Ordner im Zwischenspeicher warten (die am
  12.11. zurückgesetzten Ordner-Links übernommener Aufträge; sie bleiben wartend, solange `ONEDRIVE_ALTBESTAND` aus ist).
  Nach den harten Grenzen nicht angefasst.
- Die Lieferanten-Zuordnung bleibt offen (kein Go-live-Kriterium).

### Offene Entscheidungen für Luca

1. **23 wartende OneDrive-Ordner auf Staging:** so lassen (dann läuft `test:onedrive` nicht), als erledigt markieren oder
   gezielt in `_App-Test` anlegen lassen? Annahme bis dahin: nichts ändern.
2. **Kontaktabgleich, „sicherer“ Treffer:** gleiche Kundennummer, oder gleiche E-Mail mit gleichem Namen bzw. gleicher
   Adresse, oder gleicher Name mit gleicher Adresse. Nur Name oder nur E-Mail → das Büro wählt. Beim Übernehmen eines
   vorhandenen Kontakts gilt danach „App führt“ (Änderungen gehen von der App nach Lexware, leere Felder der App
   überschreiben nichts). Passt das, oder soll der Lexware-Kontakt beim ersten Mal unverändert bleiben?
3. **Hinweis nach dem Stichtag:** gemeldet werden nur Angebote, ABs und Lieferscheine, die direkt in Lexware entstehen.
   Rechnungen oder Gutschriften, die nach dem Stichtag an der App vorbei in Lexware angelegt werden, meldet die App nicht
   (sie stören die App nicht). Sollen sie ebenfalls gemeldet werden?
4. **„Umgesetzt von“** ist standardmäßig sichtbar (Name „Schrickel Digital Consulting“). Mit Sawin abstimmen; abschalten
   per `UMGESETZT_VON=aus`.
5. **Volle Breite auch für Detailseiten** (Kunde, Auftrag, Ticket): angenommen ja (die rechte Spalte bleibt 360 px).
   Auf sehr breiten Bildschirmen (> 2000 px) werden Textzeilen links lang; bei Bedarf dort eine Höchstbreite nur für
   Detailseiten.
6. **Erster Aufruf:** Beim Neuladen steht für etwa eine halbe Sekunde ein leerer Rahmen mit Logo (Sitzung wird geprüft),
   immer ausgeklappt; eine eingeklappte Seitenleiste klappt danach ein. Alternative wäre, den Zustand zusätzlich im
   Browser zu merken.
7. **Beobachtung Montageplan:** Der Hinweis „88 Aufträge haben noch keinen Liefertermin und keinen Montagetermin“ listet
   alle Aufträge im Fließtext und füllt die halbe Seite (Folge der Datenübernahme). Vorschlag: zugeklappt mit Anzahl und
   „Alle zeigen“. Nicht umgesetzt, weil nicht Teil des Auftrags.

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
| Lexware-Übergang | Keine doppelten Kunden (vorhandenen Lexware-Kontakt über Nummer, E-Mail, Name, Adresse finden; bei Unsicherheit wählt das Büro), unbekannte Lexware-Belege im Zahlungsabgleich und Webhook ignoriert (nur Protokoll), Go-live-Datum in Einstellungen › Verbindungen mit Hinweis im Dashboard bei Angeboten/ABs/Lieferscheinen, die nach dem Stichtag direkt in Lexware entstehen; Kurzanleitung fürs Büro in docs/uebergabe.md | fertig | 13.11.2026, test:kontakte 8/8, test:lexware 51/51, test:zahlungen 16/16, test:altbestand 17/17 |
| Darstellung | Dunkles Theme wie in der Demo: gestaffelte warme Grautöne statt Schwarz (Seitenleiste < Seite < Karte < Feld), Statusfarben der Demo, alle Text/Fläche-Paare ≥ 4,5:1 rechnerisch geprüft | fertig | 13.11.2026, test:navigation 35/35 |
| Anmeldung | Sawin-Logo im Mittelpunkt, darunter dezent „Umgesetzt von“ mit Bildmarke (Produkt-Einstellung src/lib/produkt.ts, Logo public/brand/, abschaltbar mit UMGESETZT_VON=aus), im Styleguide hell und dunkel | fertig | 13.11.2026, test:anmeldung 32/32 |
| Seitenwechsel | Seitenleiste und Kopfzeile im Layout (bleiben beim Wechsel stehen), Platzhalter je Bereich im Aufbau der Seite ohne Daten (loading.tsx, 31 Bereiche), Prefetch der App-Shell über die Seitenleiste, Dashboard: Titel sofort, Kennzahlen per Suspense | fertig | 13.11.2026, alle Browser-Tests grün außer onedrive (übersprungen, siehe Offene Entscheidungen) |
| Volle Breite | Inhaltsbereich ohne Höchstbreite (vorher 1360 px): Listen, Tabellen, Pipeline, Plantafel, Dashboard volle Breite; Formulare in Lesebreite; 1920/768/390 px ohne waagerechtes Scrollen geprüft | fertig | 13.11.2026, belege 61/61, auftraege 28/28, plantafel 39/39, dashboard 23/23 |
| Einstellungen | Darstellung (Hell, Dunkel, System; Seitenleiste hell oder dunkel) | fertig | je Benutzer; im Dunkelmodus Seitenleiste immer dunkel; Belege und Formulare bleiben hell (PDF) |
| Designsystem | Styleguide | fertig | auch Zurück-Knopf, Suchtreffer, Farbwahl der Plantafel, Ablage-Upload, Formular-Status, Chat |
| Übernahme | Datenübernahme aus Airtable | teilweise | Skript, Zuordnung, Altbestand-Schalter, Kopfbeleg, Storno und Prüfbericht fertig (`docs/airtable-uebernahme.md`, `npm run test:altbestand` 17/17). Probelauf auf Staging am 12.11.2026: 861 Kunden, 166 Anfragen, 105 Aufträge, 578 Belege, 148 Ordner, 8 Aufgaben, ohne Fehler; wiederholbar geprüft. Startwerte der Nummernkreise gesetzt, Go-live-Prüfung `npm run golive:pruefen`. Seit dem Merge (12.11.2026, Deployment „Ready“) läuft auf Vercel der neue Code. Offen: Lieferantenkürzel von Sawin |
| Vercel | Projekt, Region `fra1`, Crons (Zahlungen, Ablage), Lexware-Webhook | teilweise | läuft unter https://sawin-bauelemente-app.vercel.app (Production und Preview bis zum Go-live auf Staging); beide Crons mit 200 geprüft; Lexware-Webhook im Testkonto registriert; Browser-Tests gegen Vercel grün; Region des Proxys: Vercel › Logs › Seitenaufruf bzw. Header `x-vercel-id` |
| Version 2 | Monteur-App, Outlook-Versand, automatische Anfragen, KI-Agents | verschoben auf V2 | |

## Go-live-Checkliste (offen)

| Punkt | Stand |
|---|---|
| RLS, Policies, Advisors | RLS-Tests 101/101; Advisors: nur „Schutz vor geleakten Passwörtern“ (Pro-Tarif) |
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
| ASVS Level 1, CSP mit Nonce | umgesetzt 13.11.2026 (Blöcke A–D): hohe und mittlere Funde behoben außer M8 (Dashboard) und M9 (Entscheidung); CSP mit Nonce aktiv; ASVS 46 erfüllt, 17 nicht erfüllt (Dashboard-Schritte, M9, niedrige Funde nach Go-live) |
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
