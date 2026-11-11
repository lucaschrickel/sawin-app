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
  - Angebote, Auftragsbestätigungen, Teil-Auftragsbestätigungen, Lieferscheine und Zahlungsbestätigungen: Das App-PDF
    ist das Original.
  - Rechnungen, Abschlagsrechnungen und Gutschriften: Sofort eine App-Vorschau mit Wasserzeichen „Entwurf“. Sobald
    Lexware das Original-PDF liefert, ersetzt die App die Vorschau automatisch. **Nur das Lexware-PDF darf versendet
    werden.**
  - Formulare (Aufmaßblatt, Montageprotokoll, Servicebericht, Übergabeprotokoll) und der Wochenplan je Monteur
    sind App-PDFs.
- **Minimalistisch bauen.** Jede Seite zeigt nur, was für den nächsten Arbeitsschritt nötig ist. Keine doppelten
  Anzeigen derselben Information (z. B. Belegkette nicht zusätzlich als Chips, wenn die Belegliste daneben steht),
  keine Bestätigungsdialoge außer bei endgültigen oder destruktiven Schritten. **Keine Kennzahlen-Kacheln oben in den
  Masken** (Listen, Detailseiten, Einstellungen); Kennzahlen gibt es nur im Dashboard. Zählwerte stehen höchstens als
  Zahl an Filtern, Reitern oder Menüpunkten.

## Architektur (festgelegt am 17.10.2026, ergänzt am 20.10., 25.10., 29.10., 31.10., 09.11. und 10.11.2026)

- **Frontend:** Next.js (App Router, TypeScript, Tailwind v4), gehostet auf Vercel, ein Projekt je Kunde.
  Bis zur Übergabe im Team von Luca. Funktionen laufen in der Region `fra1`, nie in der Standardregion `iad1`.
- **Backend:** Supabase im Konto des Kunden, Region Frankfurt, je Kunde zwei Projekte: Staging und Produktion.
  Supabase liefert Anmeldung (Auth), Datenbank (Postgres mit RLS), Dateien (Storage), Realtime (Chat) und
  Edge Functions.
- **Belege und Nummern (Stand 10.11.2026, nach dem Lexware-Test):**
  - **App-Belege:** Angebot, Auftragsbestätigung (AB), Teil-Auftragsbestätigung (Teil-AB), Lieferschein und
    Zahlungsbestätigung führt die App selbst, mit eigener Nummer und eigenem PDF. Sie gehen **nicht** an Lexware.
  - **Lexware-Belege:** Rechnung, Abschlagsrechnung und Gutschrift. Erst „Fertigstellen“ legt sie über die
    Lexware-API an, Lexware vergibt die Nummer und liefert das PDF. Entwürfe davon liegen nur in der App (ohne Nummer).
  - **Nummernkreise der App** je Belegart über eine Postgres-Funktion mit Sequenz (transaktionssicher, kein
    `max()+1`). Format wie bisher bei Sawin: Präfix, Ziffer, Jahr, laufende Nummer (z. B. `AG1260432`,
    `AB2260227`, `LS1260070`, `ZB1260001`). Das Angebot erhält seine Nummer **beim ersten Speichern des Entwurfs**, AB
    und Lieferschein beim Fertigstellen, die Zahlungsbestätigung beim Erstellen (sie hat keinen Entwurf). Verworfene Angebots-Entwürfe hinterlassen eine Lücke; die Nummer wird nie
    wiederverwendet (für App-Belege zulässig, die GoBD-relevanten Rechnungsnummern vergibt Lexware).
  - **Teil-AB:** Nummer = AB-Nummer mit Zusatz `-01`, `-02` … (z. B. `AB2260227-01`). Enthält ausgewählte Positionen
    der AB und einen Liefertermin (Pflicht). Die zuletzt fertiggestellte Teil-AB setzt den Liefertermin des Auftrags.
    Umsetzung (10.11.2026): Der Editor übernimmt alle Positionen der AB; nicht gelieferte entfernt man, Mengen sind
    änderbar. Die Teil-AB ist nach dem Fertigstellen gesperrt (keine Versionen).
  - **Angebot und AB bearbeiten, Versionen:** Ein fertiggestelltes Angebot bleibt änderbar, bis die AB dazu existiert;
    eine fertiggestellte AB bleibt änderbar, bis ein Folgebeleg existiert (Teil-AB, Lieferschein, Abschlags- oder
    Schlussrechnung). Beim Bearbeiten wird das Belegdatum auf heute gesetzt (beim Angebot verschiebt sich „Gültig bis“
    um dieselbe Gültigkeitsdauer). **Die Nummer bleibt immer gleich.** Der Versand per E-Mail oder der Knopf
    „Als übergeben markieren“ (Post, persönlich) **friert die aktuelle Version ein** (Tabelle `beleg_version`: Beleg,
    Versionsnummer, Kopie aller Druckfelder und Positionen, PDF-Pfad, Versandprotokoll). Wird eine eingefrorene
    Version bearbeitet, entsteht beim Speichern Version n+1 mit derselben Nummer; Änderungen vor dem Versand bleiben
    in der laufenden Version. Das PDF trägt ab Version 2 die Zeile „Version: n“, der Dateiname `<Nummer>_V<n>`.
    Jede Version liegt als PDF in `01 Angebot`, jede Änderung geht ins Audit-Log (vorher/nachher). Ältere Versionen
    sind auf der Belegseite unter „Versionen“ ansehbar. „Ersetzen“ mit neuer Nummer und der Status „Ersetzt“
    entfallen.
  - **Ein Angebot = ein Auftrag.** Mehrere Angebote an einer Anfrage sind **Varianten**. Die AB zum angenommenen
    Angebot legt beim Fertigstellen den Auftrag an; die übrigen offenen Varianten werden „Nicht beauftragt“.
    Ein weiteres Angebot zu einem bestehenden Auftrag ist ein **Nachtrag**: Es hängt an einer eigenen Anfrage mit
    Verweis `nachtrag_zu` und wird nach Annahme ein eigener Auftrag mit Verweis auf den Ursprungsauftrag.
  - **Auftragsnummer = AB-Nummer.** Der Auftrag entsteht ausschließlich beim Fertigstellen der AB und übernimmt
    deren Nummer. Es gibt keine eigenen Auftragsnummern mehr. Ein Auftrag hat genau eine AB.
    **Übergang beendet (10.11.2026):** Der frühere Knopf „Gewonnen – Auftrag anlegen“ ist mit dem Beleg-Modul entfallen.
    Aufträge aus dieser Zeit haben schon eine Nummer aus dem AB-Nummernkreis, aber noch keine AB; ihre AB entsteht am
    Auftrag („Auftragsbestätigung erstellen“) und übernimmt genau diese Nummer. Die Datenbank lässt Aufträge nur noch
    beim Fertigstellen einer AB entstehen.
  - **Belegketten:** Jedes Angebot beginnt eine Kette (`kette_id` = ID des ersten Belegs). Folgebelege übernehmen
    die `kette_id` ihres Vorgängers (`vorgaenger_id` in der App). Belege ohne Angebot (z. B. Rechnung am Ticket)
    bilden eine eigene Kette. Zwischen Lexware-Belegen (Rechnung → Gutschrift) setzt die App zusätzlich
    `precedingSalesVoucherId`.
  - **Abschlagsrechnungen (Entscheidung 10.11.2026, ersetzt die Übernahme aus Lexware):** Die App legt jeden
    Abschlag selbst als **normale Lexware-Rechnung** an, Titel „1. Abschlagsrechnung“, „2. Abschlagsrechnung“ … (Lexware
    erlaubt 25 Zeichen; der Bezug auf die AB steht in der Einleitung). Keine Lexware-Abschlagsrechnungen, keine
    Event-Subscription. Eingabe als **Prozent vom Auftragswert (brutto) oder als Bruttobetrag**; bei mehreren
    Steuersätzen wird der Abschlag im Verhältnis der Bruttobeträge je Satz aufgeteilt (eine Position je Satz, richtiger
    Steuersatz; bei § 13b netto). Netto/Brutto und Steuerart wie in der AB. Die App merkt sich jeden Abschlag am
    Auftrag mit den Beträgen **laut Lexware** (netto, Steuer und brutto je Satz in `beleg.steuern`, Lexware-Nummer,
    Datum, `abschlag_nr`). **Beliebig viele Abschläge je Auftrag**, nummeriert in der Reihenfolge der Übertragung.
    Übersteigt die Summe der Abschläge den Auftragswert, warnt der Editor und der Bestätigungsdialog (kein Verbot).
  - **Schlussrechnung:** volle Leistung (Positionen der AB bzw. des Lieferscheins), darunter **jeder Abschlag als
    Minusposition** mit Nummer, Datum, Nettobetrag und Steuer (je Satz eine Position, `beleg_position.abzug_beleg_id`,
    vom Server bei jedem Speichern neu gesetzt, nicht abwählbar). Ein Gesamtrabatt wirkt nicht auf die Abzüge (an
    Lexware als Minusposition je Satz statt als Belegrabatt). **Centgenau:** Lexware rechnet die Steuer je Satz auf die
    Summe des Belegs. Damit Netto, Steuer und Restbetrag der Schlussrechnung exakt „AB − Abschläge“ ergeben, wählt die App
    beim Anlegen eines Abschlags den Betrag je Satz so, dass Steuer(Rest) = Steuer(AB) − Σ Steuer(Abschläge) gilt –
    möglichst nah am gewünschten Betrag. Meist ist er exakt (19 %: rund 60 % netto, 70 % brutto), sonst weicht er um
    1–2 Cent ab (7 %: bis etwa 5 Cent); der Editor zeigt die Anpassung an. Rechenmodul `src/lib/abschlag.ts` mit
    Unit-Tests (`tests/unit/abschlag.test.ts`, 3.000 Zufallsfälle). Weichen die Positionen der Schlussrechnung von der
    AB ab, kann ein Rundungscent entstehen; der Editor weist darauf hin.
  - **Zahlungen:** Zahlungseingänge kommen aus Lexware und setzen „Bezahlt“ bzw. verringern den offenen Betrag
    (Teilzahlungen). Zusätzlich kann das Büro in der App **„Als bezahlt markieren“** (Datum, Betrag, Zahlungsart;
    Teilzahlung möglich), z. B. bei Bar- oder Kartenzahlung. Weil Lexware Zahlungen über die Schnittstelle nicht
    annimmt, trägt eine App-Buchung das Kennzeichen `lex_abgleich` = offen: Belegseite und Glocke zeigen „in Lexware
    noch buchen“, bis Lexware die Zahlung meldet und die App sie abgleicht. Tabelle `zahlung` (Beleg, Datum, Betrag,
    Zahlungsart, Quelle App/Lexware, abgeglichen, Zahlungsbestätigung).
    **Umsetzung (10.11.2026):** Offener Betrag = offener Betrag laut Lexware (`lexware_offen`) − App-Buchungen, die
    Lexware noch nicht kennt; 0 → „Bezahlt“. Abgleich: Die App liest die Lexware-Belegliste (offener Betrag, Status) ab
    der ältesten offenen Forderung und holt nur für geänderte Belege die Zahlungsposten (`/v1/payments/{id}`).
    Ausgelöst beim Öffnen von Belegseite, Belegliste, Auftrag und Dashboard (im Hintergrund nach der Antwort, höchstens
    alle 5 Minuten), über „Zahlungsstand abrufen“, alle 30 Minuten per Vercel-Cron (`/api/cron/zahlungsabgleich`, nur
    mit `CRON_SECRET`) und sofort über den Lexware-Webhook (`/api/lexware/webhook`: `payment.changed`,
    `invoice.status.changed`, `credit-note.status.changed`; RSA-Signatur geprüft, Doppelzustellungen erkannt, Eingang
    und Fehler in `lexware_ereignis`, 11.11.2026). Gutschriften haben bei Lexware keine Zahlungsposten; ihren Stand liest
    die App aus der Belegliste bzw. der Gutschrift. Nur Geldeingänge werden Zahlungen; Gutschriften, Skonto und Ausbuchungen verringern nur den
    offenen Betrag. **Abgleich App-Buchung ↔ Lexware-Zahlung:** gleicher Beleg und gleicher Betrag, bei mehreren das
    nächstliegende Datum; ohne genaue Übereinstimmung (z. B. Skonto) bleibt „in Lexware noch buchen“ stehen. Eine eigene,
    noch nicht abgeglichene Zahlung ohne Bestätigung lässt sich entfernen (Markierung). Steht der Auftrag in „Abnahme“
    oder „Baustelle fertig“, ist die Schlussrechnung fertig und nichts mehr offen, wird er „Abgeschlossen“ (Historie:
    System). Die Glocke („in Lexware noch buchen“) folgt mit der Glocke; die Pipeline-Zeilen des Montageplans
    (Lieferung, Abschlag bezahlt, Warten auf Kunde) sind noch nicht gebaut.
  - **Zahlungsbestätigung:** App-Beleg zu einer Rechnung oder Abschlagsrechnung, je Zahlung höchstens eine. Inhalt:
    Bezug auf die Rechnung (Nummer, Datum, Betrag), Zahlungseingang, Zahlungsart, gezahlter Betrag, Restbetrag und der
    Satz „Diese Zahlungsbestätigung ist keine Rechnung“. **Keine Positionen und keine ausgewiesene Umsatzsteuer**, damit
    sie nicht als zweite Rechnung gilt (§ 14c UStG). Sie hängt in der Belegkette hinter der Rechnung, wird gedruckt und
    gesendet wie die anderen Belege; die Rechnung geht dabei als eigenes, unverändertes Lexware-PDF mit.
  - Den Status Angenommen/Abgelehnt/Nicht beauftragt eines Angebots führt die App selbst.
  - **AG/AB bleiben in der App (Lexware-Test 10.11.2026):** Lexware verlangt für Rechnungen keinen Lexware-Vorgänger;
    Rechnung, Abschläge und Schlussrechnung mit Abzug funktionieren ohne AB in Lexware. Angebote und ABs gehen deshalb
    nicht an Lexware. Möchte Sawin sie trotzdem in Lexware sehen, wäre das eine neue Entscheidung (App-Nummer führend,
    „AB bearbeiten“ nur bis zur Übertragung).
- **Einsätze** sind eine eigene Tabelle `einsatz` (Beginn, Ende, Fahrzeug, Ressource, `fest`, `farbe`, Team über
  `einsatz_monteur`) mit `auftrag_id` oder `ticket_id`. Ein Auftrag oder Ticket kann beliebig viele Einsätze haben
  (z. B. Montage über zwei getrennte Tage, zweiter Trupp).
- **Pipeline-Stufen** je Auftrag ohne Montagetermin: `stufe_datum` je Stufe (Lieferung, Abschlag bezahlt, Warten auf
  Kunde) und `warten_auf_kunde` (Boolean, von Hand). Die aktuelle Stufe wird abgeleitet, nicht gespeichert.
- **Versand in Version 1 (Entscheidung 11.11.2026):** Der Versand aus der App über Outlook (unten) kommt in
  **Version 2**. In Version 1 hat jeder Beleg „PDF herunterladen“ (Dateiname `<Nummer>[_V<n>]_<Belegart>_<Kunde>.pdf`)
  und „Versenden“: ein kurzer Dialog (Empfänger aus dem Kunden, interne Kopie aus `belegart_einstellung`, Betreff,
  Text), danach lädt die App das PDF herunter und öffnet Outlook per `mailto`; den Anhang fügt das Büro selbst hinzu.
  Bei Angebot und AB friert „Versenden“ die Version ein (wie „Als übergeben markieren“), jeder Versand steht in der
  Historie. Rechnung, Abschlag und Gutschrift nur mit dem Lexware-Original-PDF.
- **E-Mail-Versand (Version 2)** über Microsoft Graph (`sendMail`) aus dem Postfach des Betriebs. Anhänge kommen aus OneDrive
  oder vom Computer und werden zu frei gewählten **PDF-Gruppen** zusammengefasst (jede Gruppe ein PDF, serverseitig,
  z. B. `pdf-lib`). Lexware-PDFs (Rechnung, Abschlag, Gutschrift) bleiben immer ein eigenes, unverändertes PDF.
  Jeder Versand geht zusätzlich als **BCC an eine interne Adresse je Belegart** (Einstellung, Standard bei Sawin:
  Angebot → `angebot@sawin-be.de`, AB und Teil-AB → `auftrag@sawin-be.de`; Daten, kein fester Wert im Code).
  Jeder Versand wird in der Historie protokolliert (Empfänger, BCC, Betreff, PDFs mit Inhalt).
- **OneDrive (Ablage, nur Dateien; Entscheidung 11.11.2026, Schema wie das bisherige Make-Szenario):** über
  Microsoft Graph als Anwendung (Client-Credentials, keine Benutzeranmeldung, keine Mailrechte), Zugriff nur auf die
  eine SharePoint-Bibliothek (`Lists.SelectedOperations.Selected`, sonst `Sites.Selected` für die eine Website).
  Basisordner in den Einstellungen (Verbindungen) wählbar; Tests nur im Ordner `_App-Test`. Die App speichert nur die
  Verknüpfung (Drive-ID, Item-ID), keine Kopie. Ist Microsoft nicht erreichbar, liegt die Datei im privaten
  Supabase-Speicher als Zwischenspeicher und wird automatisch nachgeladen.
  - Der Ordner entsteht mit dem **ersten Angebot** einer Anfrage: `<AG-Nummer>_<Kunde>`. Mit der AB wird **derselbe
    Ordner** in `<AB-Nummer>_<Kunde>` umbenannt (Inhalt und ID bleiben). Ein AB ohne Angebot legt den Ordner als
    `<AB-Nummer>_<Kunde>` an.
  - Unterordner: `01 Anfrage`, `02 Angebot` (Angebots-PDFs, jede Version), `03 Aufmaß - Freigabe` (Aufmaßblatt),
    `04 Auftrag` (Lieferscheine, Bestellungen, Montageprotokoll), `05 ABs` (AB, Teil-AB),
    `06 Abnahme - Rechnung - Sonstiges` (Rechnungen, Abschläge, Gutschriften, Zahlungsbestätigungen,
    Übergabeprotokoll). Scans und Dateien ordnet man beim Hochladen einem Unterordner zu.
  - Service-Tickets: mit Ursprungsauftrag als `07 Service/<Ticketnummer>` im Auftragsordner, sonst unter
    `Service/<Ticketnummer>_<Kunde>`.
- **Bezug Auftrag oder Ticket:** Einsätze, Zeitbuchungen, Formulare, Chat, Aufgaben, Ordner und Rechnungen hängen
  entweder an einem Auftrag oder an einem Service-Ticket. Im Datenmodell zwei Fremdschlüssel (`auftrag_id`,
  `ticket_id`) mit CHECK-Constraint „genau einer gesetzt“, keine polymorphen Textverweise. RLS-Policies gelten für
  beide Wege.
  - **Ausnahme Belege:** Angebote und AB-Entwürfe hängen vor dem Auftrag an einer Anfrage. Belege haben deshalb drei
    Fremdschlüssel (`anfrage_id`, `auftrag_id`, `ticket_id`), CHECK „genau einer gesetzt“. Beim Fertigstellen der AB
    wechseln die Belege der Kette auf `auftrag_id`; die Anfrage behält den Verweis auf den Auftrag.
- **Formatierte Texte:** Positionsbeschreibungen und Artikelbeschreibungen sind formatierbar (fett, kursiv,
  Aufzählung, Nummerierung, Schriftfarbe). Gespeichert wird bereinigtes HTML nach Whitelist (`b`, `strong`, `i`,
  `em`, `u`, `ul`, `ol`, `li`, `p`, `br`, `span` mit nur `color` und `font-weight`), serverseitig erneut bereinigt.
  Editor-Baustein: TipTap (oder gleichwertig), kein `execCommand` wie im Prototyp. An Lexware geht reiner Text
  (Aufzählungen als „• “ bzw. „1. “, Absätze als Zeilenumbrüche).
  **Umsetzung (10.11.2026):** Baustein `RichText` (`src/components/ui/rich-text.tsx`, TipTap 3) mit schwebender
  Format-Leiste; Schriftfarbe aus einer kleinen Auswahl oder frei (TipTap speichert sie als `rgb(…)`, beides erlaubt).
  Serverseitige Bereinigung `htmlBereinigen` (`src/lib/html.ts`, Paket `sanitize-html`) vor jedem Speichern von
  Positionen und Artikeln; reiner Text älterer Belege wird dabei in Absätze umgewandelt. Ausgegeben wird HTML nie direkt:
  der Editor liest es über TipTap, das PDF über einen eigenen Umsetzer (`src/lib/pdf/rich-text.tsx`, Inter auch
  kursiv), Listen und Lexware über `htmlZuText` (Aufzählung „• “, Nummerierung „1. “).
- **KI-Agents (Version 2)** laufen als eigener Hintergrunddienst an einer Warteschlange in Supabase, nicht im Frontend.

## Anforderungen Version 1

Der Klick-Prototyp in `docs/demo/sawin-demo.html` (Stand 09.11.2026, im Browser öffnen) zeigt den **vollständigen
Umfang von Version 1**. Er ist mit Sawin abgestimmt und gilt als Spezifikation für Aufbau, Optik und Abläufe.
Wo Demo und diese Datei bei fachlichen Abläufen abweichen, gilt die Demo. Ausnahmen, in denen diese Datei
vorgeht: Architektur, Sicherheit, Lexware-Regeln und Designsystem gelten immer, und offensichtliche Fehler der Demo
sind keine Spezifikation (z. B. hartes Löschen, fehlende Rechteprüfung, Speichern ohne Knopf, Status, die nie
wechseln). Abgleich Demo ↔ diese Datei zuletzt am 09.11.2026. Lexware, OneDrive und E-Mail sind im Prototyp simuliert.

In Version 1 hat **nur das Büro Zugang**. Monteure arbeiten mit ausgedruckten Wochenplänen und Formularen.
Die Monteur-App kommt in Version 2.

### Rahmen und Navigation

- Seitenleiste einklappbar auf eine Symbolleiste, über den Knopf oben in der Seitenleiste neben dem Logo.
  Der Zustand wird je Benutzer gemerkt.
- Noch nicht gebaute Module stehen ausgegraut mit „folgt“ in der Seitenleiste und sind nicht anklickbar
  (Entscheidung 10.11.2026). Das Designsystem (`/styleguide`) steht nicht in der Seitenleiste.
- **Zurück oben links:** Oben links steht als Knopf „← <vorherige Maske>“ immer die Maske, aus der man gekommen ist,
  nicht die fachliche Elternseite (Beispiel: Angebot aus der Liste „Angebote“ geöffnet → „← Angebote“, nicht die
  Anfrage). Ein Klick führt genau dorthin zurück, mit Filter und Ansicht von vorher. Technisch ein Verlauf je
  Browser-Tab: Wechsel innerhalb derselben Maske (Reiter, Filter, Entwurf → gespeicherter Beleg, Bearbeiten → Ansicht)
  ersetzen den letzten Eintrag statt einen neuen anzulegen; der Browser-Zurück-Knopf verhält sich gleich. Ein Klick
  in die Seitenleiste beginnt den Verlauf neu, dann steht oben links nur der Name der Maske. Beim direkten Öffnen
  per Link ohne Verlauf zeigt die Leiste den fachlichen Pfad.
- Gruppen und Reihenfolge:
  - **Übersicht:** Dashboard, Aufgaben
  - **Kunden & Anfragen:** Kunden, Anfragen
  - **Belege:** Alle Belege, Angebote, **Aufträge** (führende Ansicht der Auftragsbestätigungen, siehe Aufträge),
    Lieferscheine, Abschlagsrechnungen, Rechnungen (mit Zahlungsbestätigungen), Gutschriften – jede Belegart ist ein
    eigener Menüpunkt; Abschlagsrechnungen und Rechnungen sind getrennt
  - **Montage & Service:** Montageplan, Service-Tickets, Service-Plan (in dieser Reihenfolge)
  - **Einkauf:** Lieferanten, Bestellungen
  - **Team und Ressourcen:** Kalender, Mitarbeiter, Fahrzeuge, Zeiterfassung, Abwesenheiten
  - Einstellungen
- **Belegübersichten** (Alle Belege und jede Belegart): Schnellfilter nach Belegart mit Anzahl
  (nur bei „Alle Belege“), Statusfilter je Belegart (Angebote: Alle/Entwürfe/Offen/Abgelaufen/Angenommen/Abgelehnt;
  Rechnungen, Abschläge und Gutschriften: Alle/Entwürfe/Offen/Überfällig/Bezahlt; übrige: Alle/Entwürfe/Fertiggestellt),
  Tag-Filter, Suche. Dazu die Liste **„Offene Forderungen“** (Rechnungen und Abschläge mit offenem Betrag) ohne
  eigenen Menüpunkt, Ziel der Verweise aus Dashboard und Glocke. Liste links, rechts eine
  **Vorschau-Leiste** wie in Lexware: Symbole (Bearbeiten bzw. Senden, Drucken, Duplizieren, Verwerfen, Öffnen),
  verkleinerte PDF-Vorschau (Klick vergrößert), Belegdaten (Nummer, Datum, Kontakt, Gültig bis bzw. Fällig,
  Betrag, Bezug, Status), **Zugehörige Belege** (Belegkette), Tags und interner Kommentar. Klick auf eine Zeile
  wählt den Beleg, Doppelklick öffnet ihn. Die Liste passt ohne waagerechtes Scrollen neben die Vorschau
  (bei schmalen Fenstern entfällt die Datumsspalte).
- **Eingeklappte Seitenleiste:** zeigt Logo, Ausklapp-Knopf und Symbole mit Zähler-Badges. CSS-Klassen der Seitenleiste
  (z. B. `.mini`) dürfen nicht mit Klassen anderer Bausteine kollidieren; Bausteine verwenden eigene Präfixe
  (z. B. `.cal-mini` für den Mini-Monatskalender, `.es-sw` für Farbstreifen von Einsätzen).
- **Liste ist Standard.** Übersichten mit Board (Anfragen, Aufträge, Service-Tickets) öffnen als Liste. Das Board
  ist per Umschalter wählbar, die Wahl wird je Benutzer und Seite gemerkt.
- **Suche** oben: Beim Tippen (ab zwei Zeichen) klappt eine Vorschlagsliste auf, nach Bereich gruppiert (Kunden,
  Anfragen, Aufträge, Belege, Service-Tickets, Lieferanten, Bestellungen, Aufgaben, Termine), höchstens drei je
  Bereich, mit Pfeiltasten bedienbar. Jeder Treffer zeigt Nummer, Name/Titel, Details (Belegart, Bauvorhaben,
  Objekt, Adresse), Betrag, Status und die **Fundstelle** mit hervorgehobenem Suchbegriff (z. B. „Position: … RC2 …“,
  „Tag“, „Kommentar“, „Lieferadresse“). Enter oder „Alle Ergebnisse“ öffnet die Ergebnisseite mit Schnellfiltern je
  Bereich (mit Anzahl) und einer Tabelle je Bereich. Durchsucht werden Namen, Nummern, Adressen, Lieferadressen,
  Telefon, E-Mail, Belegpositionen, Bauvorhaben, Tags, Kommentare und Notizen. Im echten Betrieb serverseitig
  (Postgres-Volltext, RLS gilt; Konditionen werden nie durchsucht).
- „Neu“-Menü oben: Kunde, Anfrage, Angebot, Auftrag, Service-Ticket, Bestellung, Aufgabe. „Angebot“ und „Auftrag“
  öffnen direkt den Beleg-Editor (Angebot bzw. AB), ohne Zwischendialog.
- Glocke: Hinweise wie Erwähnungen im Chat, Abwesenheiten zur Genehmigung, nicht freigegebene Vorplanung,
  Konflikte, Rechnungen überfällig, Zahlungen „in Lexware noch buchen“, Angebote nachfassen (offen seit mindestens
  5 Tagen), Aufträge ohne Rechnung (ab Phase Abnahme), Fahrzeugtermine, neue Tickets, Prüfhinweise, Wiedervorlagen,
  fällige Aufgaben.
- Fuß der Seitenleiste: Status der Lexware-Verbindung und angemeldeter Benutzer.

### Dashboard

- Drei Ansichten, frei umschaltbar und je Benutzer gemerkt: **Geschäftsführung**, **Montage**, **Einkauf**.
  Die Ansicht ist keine Rolle und gibt keine Rechte.
  - Geschäftsführung: Anfragen, Auftragsbestand, Forderungen, Montagen der nächsten 14 Tage, Angebotsquote
    (angenommen ÷ (angenommen + abgelehnt)), Herkunft (mit Anteil online), Auftragswert je Monat, heutige Termine,
    Einsätze und Abwesenheiten heute, „Braucht Aufmerksamkeit“, Aufträge je Status.
  - Montage: Einsätze der Woche (freigegeben/vorgeplant), zur Freigabe, Konflikte, Ungeplantes, heute und als
    Nächstes, Abwesenheiten der nächsten zwei Wochen, Ware für anstehende Montagen, Fahrzeugtermine.
  - Einkauf: offene Bestellungen, Lieferungen je Kalenderwoche, überschrittene Liefertermine, noch nicht bestellte
    Positionen, fehlende AB vom Lieferanten, Lieferanten-Schnellzugriff.
  - Das Dashboard ist die Startseite (`/`). Welche Herkunftsarten als „online“ zählen, steht in der Konfiguration
    der Instanz (`herkunftOnline`). Bis zum Beleg-Modul stehen Auftragsbestand, Forderungen, Angebotsquote und
    Auftragswert je Monat als Platzhalter „Folgt mit dem Beleg-Modul“ (Entscheidung 10.11.2026).

### Kunden (Endkunden des Betriebs)

- Kunden werden in der App angelegt und geändert, auch direkt aus dem Beleg-Editor (siehe Belege).
- **Adressen:** eine **Rechnungsadresse** (Hauptadresse des Kunden, geht an Lexware) und **beliebig viele
  Lieferadressen** (Bezeichnung, Straße, PLZ, Ort; z. B. Objekte einer Hausverwaltung). Ohne Lieferadresse gilt die
  Rechnungsadresse. Lieferadressen sind eine eigene Tabelle `kunde_lieferadresse`. Sie belegen das Feld
  „Objekt / Lieferanschrift“ in Anfrage, Auftrag und Beleg vor (Auswahlliste, freie Eingabe bleibt möglich).
  Nicht mehr genutzte Lieferadressen markiert man in der Kundenmaske als **„Alt“** (Feld `alt_seit`, wieder
  „Reaktivieren“ möglich). Alte Adressen stehen zugeklappt und grau in der Kundenmaske, werden nicht mehr
  vorgeschlagen oder vorbelegt; bestehende Belege behalten ihren Text. Gelöscht wird nichts.
- Übertragung an Lexware erst beim ersten **fertiggestellten Lexware-Beleg** (Abschlag, Rechnung, Gutschrift) für
  diesen Kunden; die App speichert die Lexware-Kontakt-ID. Danach laufen Änderungen nur in Richtung App → Lexware, nie
  zurück (beim Speichern des Kunden und vor jedem Lexware-Beleg, erkannt über eine Prüfsumme `lexware_hash`).
  Lexware-Kontakt: Firma (mit Ansprechpartner; § 13b-Kunden mit `allowTaxFreeInvoices`) bzw. Person, nur die
  Rechnungsadresse (Lexware erlaubt nur eine Lieferadresse am Kontakt; das Objekt steht auf dem Beleg). Die
  Kundennummer vergibt Lexware selbst (über die API nicht setzbar); auf dem Lexware-PDF steht deshalb die
  Lexware-Kundennummer.
- Die Kundenseite zeigt alle Anfragen, Aufträge, Service-Tickets und Belege des Kunden.
- **Konditionen:** Freitextfeld je Kunde (z. B. aktuelle Rabatte). Sehen und ändern dürfen es nur Benutzer mit dem
  Recht „Konditionen sehen“. Die Konditionen liegen in einer eigenen Tabelle mit eigener RLS-Policy, nicht als Spalte
  der Kundentabelle. Sie gehen nicht an Lexware und erscheinen auf keinem Beleg.
- Steuer-Vorbelegung je Kunde: Typ Privat oder Firma, bei Firmen zusätzlich Kennzeichen „Bauleister (§ 13b UStG)“.
  Daraus wird die Steuerart neuer Belege vorbelegt (siehe Belege).

### Anfragen

- Werden händisch erfasst, nichts automatisch.
- Felder: Kurzbezeichnung (Pflicht), **Kunde (Pflicht)**, Objekt / Lieferadresse (Auswahl aus den Adressen des Kunden,
  freie Eingabe möglich), Beschreibung, Herkunft (aus dem Kunden vorbelegt), Produkte, geschätzter Wert, Zuständig
  (Benutzer, vorbelegt mit dem Erfassenden), Wiedervorlage, Aufmaß-Termin, interne Notiz, Status.
  Ein gesetzter Aufmaß-Termin stellt eine neue Anfrage auf „Aufmaß“ und erscheint im Kalender als Termin der Art
  Aufmaß (Dauer 90 Minuten). Die Anfrageseite zeigt die Termine der Anfrage.
- Jede Anfrage gehört zu einem Kunden (Entscheidung 10.11.2026). Ein neuer Interessent wird direkt im Anfrage-Dialog
  über „Neuer Kunde“ angelegt (Kundenmaske als Dialog).
- „Zuständig“ ist in Anfragen, Aufgaben, Aufträgen und Service-Tickets ein Benutzer (Büro), kein Mitarbeiter.
- Eine Anfrage mit Auftrag oder Belegen lässt sich nicht löschen; eine gewonnene Anfrage mit Auftrag nicht zurücksetzen.
- Ablauf: Anfrage → Aufmaß/Besichtigung → ein oder mehrere Angebote (Varianten) → Kunde nimmt an →
  „Auftragsbestätigung erstellen“ → AB fertigstellen → **Auftrag entsteht** (Nummer = AB-Nummer).
  Ein Angebot fertigzustellen legt nie einen Auftrag an.
- Liste (Standard) und Kanban mit den Spalten Neu, In Klärung, Aufmaß, Angebot erstellen, Angebot versendet.
  „Angebot versendet“ setzt die App, sobald ein Angebot der Anfrage fertiggestellt ist.
  Archiv für gewonnen und verloren (mit Grund).
- Anfrage hat eine eigene Seite: Übersicht, Angebote (je Variante mit „Nächster Schritt“), Aufmaßblatt, Historie.
  Oben ein Knopf „Neues Angebot“ bzw. „Weitere Variante“, nach Annahme „Auftragsbestätigung erstellen“.
- An einer Anfrage kann bereits ein Aufmaßblatt erfasst werden.
- Mit dem Auftrag wandern die Kette des angenommenen Angebots und das Aufmaßblatt in den Auftrag, die Anfrage wird
  „Gewonnen“, die übrigen Varianten „Nicht beauftragt“; noch offene Entwürfe anderer Varianten werden verworfen.
  Sind alle Angebote abgelehnt, schlägt die App vor, die
  Anfrage als verloren zu archivieren.
- Nachtragsanfragen tragen den Verweis auf den Ursprungsauftrag und erscheinen dort unter „Nachträge“.

### Aufträge (Pipeline)

- **Maske „Aufträge“ unter Belege** ist zugleich die Übersicht der Auftragsbestätigungen (ein Auftrag = genau eine AB);
  eine eigene AB-Liste gibt es nicht mehr, alte Links darauf leiten um. Aufbau wie die anderen Belegübersichten:
  Liste links, rechts die **Vorschau-Leiste** der Auftragsbestätigung (Symbole, verkleinerte PDF-Vorschau,
  Belegdaten, Zugehörige Belege, Tags, Kommentar). Spalten: Auftrag, Kunde (mit Titel), **Status** (Phase, darunter
  der Bestellstatus), Produkte (entfällt unter 1380 px), Termin (Montage oder Lieferung), Wert (darunter offen).
  Bedienung wie bei allen Belegübersichten: **Klick auf eine Zeile wählt sie und zeigt ihre Auftragsbestätigung in der
  Vorschau, Doppelklick öffnet die Auftragsdetails; ein Klick auf die Vorschau öffnet die Auftragsbestätigung.** Teil-ABs stehen als Hinweis
  „+n Teil-AB“ in der Zeile, am Auftrag und in „Alle Belege“. AB-Entwürfe (noch ohne Auftrag) zeigt der Umschalter
  „AB-Entwürfe“ mit Anzahl. Das Board bleibt ohne Vorschau.
- Phasen: Bestellung, Montage, Abnahme, Baustelle fertig, Reklamation, Abgeschlossen. Pipeline als Liste (Standard)
  und als Kanban (Drag & Drop). Listenfilter Produkt, Mitarbeiter und „Abgeschlossene zeigen“.
- Felder neben Kunde, Titel und Objekt: Montagestatus (Nicht begonnen, Bereit, In Arbeit, Teilweise abgeschlossen,
  Abgeschlossen), Herkunft, Zuständig, Produkte, Bemerkung.
- **Prüfhinweis:** Freitext am Auftrag, den nicht das Büro schreibt, sondern z. B. die Datenübernahme oder eine
  Plausibilitätsprüfung setzt (Beispiel: „Aufmaß und Bestellung weichen ab“). Er steht als Banner oben auf der
  Auftragsseite und in der Glocke, bis jemand „Geprüft, Hinweis entfernen“ klickt (Eintrag in der Historie).
- „Neuer Auftrag“ öffnet den Editor für eine AB (Kunde dort wählen oder neu anlegen); der Auftrag entsteht mit dem
  Fertigstellen der AB.
- **Reklamation:** Vor dem Abschluss läuft eine Reklamation über die Phase „Reklamation“ im Auftrag.
  Nach dem Abschluss wird ein Service-Ticket mit Bezug zum Auftrag angelegt, der Auftrag bleibt abgeschlossen und
  zeigt „offenes Ticket“. Wird ein Reklamations-Ticket zu einem nicht abgeschlossenen Auftrag angelegt, bietet die
  App an, stattdessen den Auftrag auf „Reklamation“ zu setzen.
- Auftragsseite mit Reitern: **Übersicht**, **Chat**, **Formulare & Protokolle**, **Historie**.
- **Übersicht schlank:** Kopf mit Nummer, Kunde, Titel, Objekt und Telefon; Phasenleiste. Links: **Montage**
  (alle Einsätze mit Freigabe-Status, „Termin ändern“, „Weiterer Einsatz“, „Freigeben“, Route; ohne Termin die
  aktuelle Pipeline-Stufe mit Datum und Schalter „Warten auf Kunde“), **Bestellung & Lieferung** (Liefertermin,
  Bestellzeilen, „Noch nicht bestellt“), **Aufgaben**. Rechts klein: **Belege** (kompakte Liste in Kettenfolge mit
  Status-Punkt und „Nächster Schritt“), **Finanzen** (Auftragswert, offen, Abschläge), OneDrive-Ordner,
  Service-Tickets und Nachträge (nur wenn vorhanden).
- Auftragswert = Summe der AB. Nachträge sind eigene Aufträge. „Auftragsbestand“ (Dashboard, Aufträge) ist der
  **noch nicht berechnete** Wert: AB abzüglich Abschläge und Rechnungen, zuzüglich Gutschriften.
- Die Phasenleiste zeigt „Reklamation“, solange der Auftrag in dieser Phase ist. „Abgeschlossen“ ohne fertiggestellte
  Schluss-/Rechnung ist möglich, die App warnt aber und der Auftrag bleibt in der Glocke unter „ohne Rechnung“.
  Steht der Auftrag in „Abnahme“ oder „Baustelle fertig“, ist die Schluss- bzw. Rechnung fertiggestellt und nichts
  mehr offen, setzt die App ihn beim Zahlungseingang selbst auf „Abgeschlossen“ (Historie: System).
- **Liefertermin:** Datumsfeld am Auftrag, vom Büro gepflegt oder aus der jüngsten Teil-AB übernommen. Die Liefer-KW
  aus den Bestellzeilen steht daneben als Hinweis; weicht sie ab, zeigt die App einen Hinweis. Ein Auftrag ohne
  Montagetermin steht in der Pipeline des Montageplans, wenn er einen Liefertermin oder ein Stufen-Datum hat (z. B.
  „Warten auf Kunde“). Aufträge ohne beides und ohne Montagetermin zeigt der Montageplan oben als Hinweis.
- Bestellstatus und Liefer-KW werden aus den Bestellzeilen abgeleitet (siehe Einkauf). Zusätzlich ein Freitextfeld
  „Noch nicht bestellt“.

### Service-Tickets

- Eigener Datensatz mit eigener Nummer (`ST-JJ-NNNN`), nicht als Auftragsart.
- Felder: Kunde, optional Ursprungsauftrag, Thema, Art (Reklamation, Wartung, Reparatur, Einstellung / Justage,
  Sonstiges), Abrechnung (Garantie, Kulanz, Kostenpflichtig), Priorität, Problem, Wunschtermin, Zuständig.
- Status: Neu → Eingeplant → In Arbeit → Erledigt → Abgerechnet. Liste (Standard, mit Spalte Priorität) und Board
  (Drag & Drop). Schnellfilter nach Art und Status in beiden Ansichten.
- **Geplant wird im Service-Plan** (siehe Montagepläne). Jedes offene Ticket ohne Termin steht automatisch in dessen
  Zeile „Terminierbar“, und zwar in der kommenden Woche: am Wunschtermin, wenn er in der kommenden Woche oder später
  liegt, sonst am Montag der kommenden Woche. Das Datum (`vorab_datum`) wird beim Anlegen gesetzt und bei Änderung
  des Wunschtermins neu berechnet, solange kein Termin besteht.
- Beim Einplanen wird „Neu“ zu „Eingeplant“, beim Herausnehmen des letzten Einsatzes wieder „Neu“.
- Rechnung direkt am Ticket, ohne Angebot und AB. Bei Garantie oder Kulanz weist der Editor darauf hin. Als
  hervorgehobener nächster Schritt erscheint sie erst, wenn das Ticket „Erledigt“ ist.
  Fertiggestellte Rechnung setzt das Ticket auf „Abgerechnet“; von Hand (Board, Auswahlfeld) lässt sich
  „Abgerechnet“ nicht setzen.
- Ticketseite mit denselben Reitern wie der Auftrag.

### Belege

- **Belegarten:** Angebot, Auftragsbestätigung, Teil-Auftragsbestätigung, Lieferschein, Zahlungsbestätigung
  (App-Belege); Rechnung, Abschlagsrechnung, Gutschrift (Lexware-Belege). Nummern und Zuständigkeit siehe Architektur.
- **Status je Belegart** (außer Entwurf). „Offen“ gibt es nur, wo auf eine Reaktion von außen gewartet wird.
  - Angebot: Offen → Angenommen / Abgelehnt / Nicht beauftragt; abgelaufen wird markiert. Versionen siehe Architektur.
  - Zahlungsbestätigung: Erstellt.
  - Auftragsbestätigung: wird aus der Kette **berechnet, nicht gespeichert**: Bestätigt (noch kein Folgebeleg,
    bearbeitbar) → In Abwicklung (Teil-AB, Lieferschein oder Abschlag vorhanden, gesperrt) → Abgerechnet
    (Schluss- bzw. Rechnung fertiggestellt; Teilrechnungen zählen nicht).
  - Teil-AB: Bestätigt. Lieferschein: Erstellt.
  - Rechnung, Abschlag, Gutschrift: Offen → Bezahlt bzw. Überfällig (Zahlungen aus Lexware).
- **Felder wie in Lexware, für alle Belegarten:** Empfängeradresse (aus dem Kunden vorbelegt, je Beleg änderbar:
  Name, Adresszusatz, Straße, PLZ, Ort, Land), Kundennummer, Belegnummer, Belegdatum, Belegtitel, **Bauvorhaben** und
  **Objekt / Lieferanschrift** (beide immer als Feld im Editor, vorbelegt aus Anfrage bzw. Auftrag oder aus der ersten
  Lieferadresse des Kunden, je Beleg änderbar und gedruckt; im Lieferschein als „Lieferanschrift“), Einleitungstext,
  Positionen, Summen, Zahlungsbedingung (außer Lieferschein), Nachbemerkung. Je Belegart zusätzlich:
  - Angebot: „Gültig bis“ und Gültigkeitsdauer in Tagen (beide Felder rechnen sich gegenseitig um).
  - Auftragsbestätigung: geplanter Liefer- bzw. Montagezeitraum und Freitext **Lieferbedingungen**.
  - Teil-AB: Liefertermin (Pflicht), Positionen aus der AB auswählbar, Freitext **Lieferbedingungen** (aus der AB
    übernommen, änderbar).
  - Lieferschein: Lieferdatum, keine Preise.
  - Rechnung und Gutschrift: Liefer- bzw. Leistungsdatum oder -zeitraum (Pflicht).
- **Kein Dialog vor dem Editor.** „Beleg erstellen“, „Neues Angebot“, „Neuer Auftrag“ und „Nächster Schritt“
  öffnen direkt den Vollbild-Editor. Kunde und Bezug werden im Editor gewählt.
- **Kunde im Editor:** Auswahl aus dem Kundenstamm; daneben zwei Knöpfe, die die **Kundenmaske als Dialog** öffnen:
  „Kunde bearbeiten“ (Stammdaten, Rechnungs- und Lieferadressen) und „Neuer Kunde“. Nach dem Speichern ist der
  Kunde im Beleg gewählt, Adresse, Steuerart und Objekt werden übernommen; die übrigen Eingaben im Beleg bleiben
  erhalten. Adressänderungen direkt im Beleg gelten nur für den Beleg. Wechsel des Kunden setzt Adresse, Steuerart
  und Objekt neu und löst einen nicht passenden Bezug.
- **Bezug im Editor:** Auswahlfeld je nach Belegart (Anfrage, offenes oder angenommenes Angebot, Auftrag oder
  Ticket). Ein Angebot ohne Bezug legt beim ersten Speichern im Hintergrund eine Anfrage an (Status „Angebot
  erstellen“). Eine AB entsteht aus einem offenen oder angenommenen Angebot oder frei (dann ohne Anfrage); das
  Fertigstellen der AB setzt ein noch offenes Angebot auf „Angenommen“.
- **Textvorlagen** für Einleitung, Lieferbedingungen und Nachbemerkung **für alle Belegarten** (inkl. Teil-AB und
  Abschlag), in den Einstellungen anlegen, bearbeiten, löschen und als Standard markieren. Im Editor über ein Symbol
  neben dem Feld auswählbar; die Standard-Vorlage wird bei neuen Belegen vorbelegt. Die Vorlage wird in den Beleg
  kopiert und bleibt dort änderbar.
- **Zahlungsbedingungen wie in Lexware:** eigene Stammdaten (Tabelle `zahlungsbedingung`: Name, Text mit
  Platzhaltern, Zahlungsziel in Tagen, Skontoziel in Tagen, Skonto in %, Belegarten, Standard je Belegart).
  Platzhalter: `{Zahlungsziel}`, `{Fälligkeitsdatum}`, `{Skonto}`, `{Skontoziel}`, `{Skontodatum}`, `{Skontobetrag}`,
  `{Betrag}`, `{Betrag nach Skonto}`; Einfügen über den Knopf „{ }“ neben dem Textfeld. Im Beleg wählbar; Text, Ziel
  und Skonto werden in den Beleg kopiert und bleiben änderbar. Gedruckt wird der mit Belegdatum und Betrag gefüllte
  Text; der Editor zeigt die gefüllte Fassung als Vorschau. Fälligkeit der Rechnung = Belegdatum + Zahlungsziel.
  Ein globales Zahlungsziel in den Einstellungen gibt es nicht mehr.
- **Positionen:**
  - Jede Position hat eine **Titelzeile** (fett gedruckt, Lexware `name`) und darunter eine **formatierbare
    Beschreibung** über die ganze Breite (fett, kursiv, Aufzählung, Nummerierung, Schriftfarbe; Lexware
    `description` als reiner Text). Die Format-Leiste erscheint schwebend über dem Feld, solange es den Fokus hat,
    und verschiebt das Layout nicht.
  - **Schnellauswahl:** Artikel mit Stern im Katalog erscheinen als Knöpfe über der Positionstabelle; ein Klick fügt
    die Position mit Titel, Beschreibung, Einheit und Preis an. Zusätzlich „+ aus dem Katalog …“ für alle Artikel,
    freie Positionen jederzeit.
  - Positionsarten wie in Lexware: Artikel, Freitext (Textzeile ohne Preis), Optional und Gesamtrabatt. **Optional**
    setzt man im Angebot über die Checkbox „optional“ an jeder Position (zählt nicht zur Summe, Betrag in Klammern,
    Kennzeichen „Optional“ auf dem PDF). Je Position Menge, Einheit, Einzelpreis, Rabatt in Prozent und Steuersatz.
  - **Reihenfolge per Drag & Drop** am Griff links; Löschen über das Symbol rechts.
  - Die Positionstabelle passt ab 1280 px Fensterbreite ohne waagerechtes Scrollen in die Editor-Spalte (feste
    Spaltenbreiten, Titel nimmt den Rest); die Aktionen je Zeile liegen nie unter der rechten Seitenleiste.
- **Brutto/Netto:** Eingabe und Anzeige der Preise je Beleg umschaltbar, Brutto nur bei Steuerart Standard
  (§ 13b und steuerfrei immer netto).
- **Steuerart** je Beleg: Standard (mit Umsatzsteuer), § 13b UStG (Bauleistung an einen Bauleister,
  Steuerschuldnerschaft des Leistungsempfängers) oder steuerfrei. Vorbelegung aus dem Kunden. Bei § 13b druckt
  die App den Pflichthinweis auf den Beleg. Ein Firmenkunde allein ist kein Grund für einen Beleg ohne
  Umsatzsteuer.
- **Vollbild-Editor:** Aufbau wie in Lexware: Kopf mit Adresse links und Belegdaten rechts, darunter Titel und
  Einleitung, Positionen mit dunkler Summenleiste, dann Zahlungsbedingung und Nachbemerkung. Die Aktionen
  (Fertigstellen, Entwurf speichern, Vorschau, Duplizieren, Verwerfen) stehen in einer festen Seitenleiste rechts,
  dazu Status, Summe, Tags und interner Kommentar.
- **Entwurf:** Ein neuer Beleg ist zuerst Entwurf. Die Vorschau trägt das Wasserzeichen „ENTWURF“, er bleibt frei
  bearbeitbar. Angebote tragen schon als Entwurf ihre Nummer, alle anderen Belegarten erst nach dem Fertigstellen.
  Entwürfe erscheinen in den Belegübersichten (Filter „Entwürfe“). Verwerfen markiert den Entwurf als gelöscht.
- **Speichern:** nur per Knopf, **kein automatisches Zwischenspeichern** (sonst entstünden ungewollt neue Versionen).
  Die Seitenleiste zeigt „ungespeicherte Änderungen“. Wer den Editor mit ungespeicherten Änderungen verlässt
  (Seitenleiste, Zurück, Browser-Zurück, anderer Beleg), bekommt die Abfrage **Speichern | Verwerfen | Abbrechen**;
  beim Schließen oder Neuladen des Tabs warnt der Browser. Dasselbe gilt für Dialoge mit Eingaben (Kunde, Aufgabe
  usw.): Schließen per ×, Escape oder Klick daneben fragt nach, wenn etwas geändert wurde.
- **Fertigstellen:** App-Belege werden gesperrt und als PDF abgelegt; Lexware-Belege werden über die API angelegt,
  Lexware vergibt die Nummer. Bei Rechnung und Gutschrift vorher immer ein Bestätigungsdialog („endgültig, nicht
  löschbar, versendet wird nur das Lexware-PDF“). Ausnahme vom Sperren: Angebot bis zur AB und AB bis zum ersten
  Folgebeleg, jeweils mit Versionen (siehe Architektur). Das Fertigstellen einer AB legt den Auftrag an; kein anderer Beleg legt einen Auftrag an.
- **Gültigkeit:** Angebote haben „Gültig bis“ (Standard aus den Einstellungen, 30 Tage, im Beleg änderbar).
  Steht auf dem PDF. Abgelaufene offene Angebote werden markiert.
- **Interner Kommentar:** je Beleg, auch nach dem Fertigstellen änderbar. Nicht auf dem PDF, nicht an Lexware.
- **Tags:** freie Schlagworte je Beleg mit Vorschlägen aus bereits vergebenen Tags. Nur intern, auch nach dem
  Fertigstellen änderbar, in den Beleglisten filterbar. Nicht auf dem PDF, nicht an Lexware.
- **Duplizieren** (nicht bei Abschlagsrechnungen, Rechnungen und Gutschriften): erzeugt einen neuen Entwurf mit allen Positionen und Texten. Belegart, Kunde und Bezug sind im
  Editor änderbar, Kommentar und Tags werden übernommen. Eine Kopie beginnt eine neue Kette.
- **Belegkette:** Angebot → AB → (Teil-AB) → Lieferschein → Abschläge → Schlussrechnung → Gutschrift. Positionen und
  Texte werden übernommen. Die Kette ist überall nachvollziehbar, aber klein dargestellt: als kompakte Liste in
  Kettenfolge an Auftrag, Anfrage und Ticket, als Sprungleiste auf der Belegseite und unter „Zugehörige Belege“ in
  der Vorschau-Leiste.
- **Nächster Schritt** zeigt nur Schritte, die zur Lage passen. Am Auftrag: vor der Schlussrechnung Lieferschein (solange
  keiner existiert), Rechnung bzw. „Schlussrechnung“ (sobald Abschläge existieren, Abzug vorbelegt), Teil-AB und
  Abschlag (höchstens zwei), dazu „Teilrechnung zu LS…“ für jeden Lieferschein einer Teil-AB ohne Teilrechnung;
  nach der Schlussrechnung nur noch „Gutschrift zu …“. Auf der Belegseite nur Schritte, die von genau diesem
  Beleg ausgehen: Angebot → angenommen/abgelehnt bzw. AB erstellen; AB → wie am Auftrag, aber ohne Gutschrift;
  Teil-AB → Lieferschein → Teilrechnung; Lieferschein der AB → Rechnung bzw. Schlussrechnung; Rechnung → Gutschrift;
  Rechnung und Abschlag mit einer Zahlung ohne Bestätigung → „Zahlungsbestätigung erstellen“; Gutschrift und
  Zahlungsbestätigung → nichts. Gibt es schon einen Entwurf als Folgebeleg, steht nur „… weiter bearbeiten“ da.
- **Belegseite (fertiggestellt):** Kette als Sprungleiste, PDF-Ansicht, „Nächster Schritt“; rechts Aktionen
  (Bearbeiten bei Angebot und AB, Senden, Vorschau, Duplizieren, Angenommen/Abgelehnt, **Als bezahlt markieren** bei
  Rechnung und Abschlag mit offenem Betrag), Daten (bei Rechnungen mit allen Zahlungen), **Versionen** (bei
  Angebot und AB, mit „Als übergeben markieren“), Lexware- bzw. Ablage-Status, Tags, Kommentar. Von jedem Beleg führt ein Sprung zu Kunde, Anfrage, Auftrag bzw.
  Ticket und zu den anderen Belegen.
- **Senden:** In Version 1 vorläufig per Download und `mailto` (siehe Architektur „Versand in Version 1“). Der folgende
  Ablauf mit PDF-Gruppen kommt in **Version 2**: E-Mail-Dialog mit Empfänger (aus dem Kunden), interner Kopie (BCC, vorbelegt je Belegart, im Dialog
  änderbar oder leer), Betreff und Text. Bei Angebot und AB nennt der Dialog die Version und friert sie beim Senden
  ein. **Versand vorbereiten:** Auf der Belegseite steht direkt unter „Senden“ (oben rechts) die Vorauswahl der
  Anhänge als **PDF-Gruppen**: Jede Gruppe wird ein PDF (z. B. PDF 1 Angebot allein, PDF 2 AGB und
  Widerrufsbelehrung zusammen, PDF 3 Pflegehinweis allein); Anzahl der Gruppen und Dokumente je Gruppe sind frei.
  Die Vorauswahl ist beim Öffnen des Belegs schon gesetzt (Standard-Gruppen je Belegart aus den Einstellungen) und
  wird je Beleg gespeichert. Bedienung per **Drag & Drop**: Dokumente aus „Aus OneDrive“ (Belege, Formulare, Fotos des
  Auftrags- bzw. Ticketordners und allgemeine Vorlagen wie AGB oder Widerrufsbelehrung; Klick legt ein eigenes PDF
  an) oder Dateien vom Computer in eine Gruppe oder auf „weiteres PDF“ ziehen, Dokumente zwischen Gruppen
  verschieben, Gruppen an ihrem Kopf umsortieren, „×“ entfernt ein Dokument, leere Gruppen verschwinden. Der
  Dateiname je PDF ist vorbelegt (Beleg-PDF `<Nummer>[_V<n>]_<Belegart>.pdf`) und änderbar. Der Sendedialog zeigt
  dieselben Gruppen, dort sind sie noch änderbar. **Rechnungen, Abschläge und Gutschriften werden nie mit anderen
  Dokumenten zusammengefasst** (Lexware-PDF bzw. E-Rechnung bleibt unverändert); das gilt auch, wenn sie als Anhang
  an einem anderen Beleg hängen. Im Datenmodell Tabellen `beleg_versand_gruppe` (Beleg, Reihenfolge, Dateiname) und
  `beleg_anhang` (Gruppe, Quelle, Reihenfolge); Uploads landen im Auftrags- bzw. Ticketordner.
- **Rechnungen am Auftrag:**
  - **Teilrechnung:** Rechnung aus dem Lieferschein einer Teil-AB (oder aus der Teil-AB), nur über deren Positionen,
    ohne Abzug. Kennzeichen `teil` am Beleg (setzt nur die Datenbank aus dem Vorgänger). Der Auftrag bleibt offen.
    Titel in Lexware „Teilrechnung“. Ihre Beträge ergeben sich aus den Positionen; ein folgender Abschlag gleicht ihre
    Rundung für die centgenaue Schlussrechnung mit aus. Ist sie der letzte Abzug, kann ein Rundungscent bleiben (der
    Editor der Schlussrechnung zeigt ihn an).
  - **Schlussrechnung bzw. Rechnung:** genau **eine** je Auftrag, aus der AB oder dem Lieferschein der AB, über alle
    Positionen. Sie zieht alle bereits berechneten Abschläge **und** Teilrechnungen desselben Auftrags ab („abzgl.
    bereits berechnet“); der Abzug lässt sich nicht abwählen. Gibt es weder Abschläge noch Teilrechnungen, heißt sie
    „Rechnung“. Eine zweite Schlussrechnung lässt die App nicht fertigstellen; Korrekturen laufen über eine Gutschrift.
  - **Gutschrift** entsteht nur aus einer Rechnung oder Abschlagsrechnung (nie leer, nie aus AB oder Lieferschein).
  - **Abschlagsrechnungen** entstehen am Auftrag (Prozent oder Betrag, siehe Architektur) und werden nicht
    dupliziert. Je Auftrag beliebig viele, nach der Schlussrechnung keine mehr. Sawins übliche Zahlungsbedingung:
    Elemente 50 % bei Auftragserteilung, 50 % vor Montage, Montage nach Fertigstellung (Vorschlag im Editor: 50 %).
    Am Auftrag stehen unter Finanzen Abschlagsrechnungen („2 von 3 bezahlt“) und Rechnungen getrennt, je mit Status.
  - **Rechnung und Gutschrift werden nicht dupliziert** (Stand 10.11.2026): Eine Rechnung entsteht am Auftrag oder
    Ticket, eine Gutschrift aus der Rechnung bzw. dem Abschlag.
- **Als bezahlt markieren:** Dialog mit Zahlungseingang am, Betrag (vorbelegt mit dem offenen Betrag, Teilzahlung
  möglich), Zahlungsart und den Häkchen „Zahlungsbestätigung erstellen“ und „danach per E-Mail senden“ (Rechnung als
  eigenes PDF im Anhang). Abgleich mit Lexware siehe Architektur.
  - Das „Beleg erstellen“-Menü am Auftrag zeigt nur, was in der Lage möglich ist (nach der Schlussrechnung nur noch
    „Gutschrift zu …“ und „Nachtragsangebot“).
- Lieferscheine zeigen nirgends einen Betrag und drucken keinen Steuerhinweis.
- **Druck und PDF:** A4 ohne Leerseiten. Gedruckt wird nur der Beleg, nicht die App. Tabellenkopf wiederholt sich
  auf jeder Seite, eine Position wird nicht über einen Seitenwechsel getrennt, Fußzeile mit Firmendaten und
  Wasserzeichen „Entwurf“ stehen auf jeder Seite. Formatierte Beschreibungen (Listen, Farbe, fett) erscheinen im
  PDF wie im Editor. Gilt auch für Formulare und den Wochenplan.

### Chat

- Interner Chat je Auftrag und je Ticket (Reiter „Chat“), getrennt von der Historie.
  Die Historie bleibt das Protokoll (Ereignisse, Telefonate, Notizen, Versand) und gehört fachlich zum Audit-Log.
- Erwähnungen mit `@Kürzel` lösen eine Benachrichtigung aus. Fotos anhängen. Ungelesene Nachrichten werden an der
  Karte in der Pipeline und am Reiter gezählt.
- In Version 1 schreiben nur Büro-Benutzer. Mit der Monteur-App kommen die Monteure in denselben Chat.

### Formulare & Protokolle

- **Aufmaßblatt digital:** vor Ort auf Tablet oder Handy (Büro-Zugang). Je Zeile Raum, Element, Breite und Höhe in
  mm, Anzahl, Anschlag, Bemerkung, dazu Hinweise zur Baustelle. Speichert automatisch, Status Entwurf/Abgeschlossen,
  PDF in `02 Aufmaß`. „In Angebot übernehmen“ erzeugt einen Angebots-Entwurf mit den Elementen als Positionen;
  am Aufmaß eines Auftrags ist das ein Nachtragsangebot (eigene Anfrage mit `nachtrag_zu`, siehe Architektur).
  Version 1 setzt eine Netzverbindung voraus.
- **Montageprotokoll, Servicebericht, Übergabeprotokoll:** vorausgefüllte PDF-Vorlagen zum Drucken
  (Kunde, Objekt, Checkliste je Produkt, Leistungen aus der AB, Unterschriftsfelder). Auf der Baustelle von Hand
  ausgefüllt und unterschrieben, danach lädt das Büro den Scan hoch. Status Gedruckt → Scan abgelegt.
- Formulare hängen an einem Auftrag, einem Ticket oder (nur Aufmaß) an einer Anfrage.

### Aufgaben

- Zuweisung an einen Benutzer, Fälligkeitsdatum, Priorität, Status (Offen, In Arbeit, Wartet auf Zulieferer, Wartet
  auf Kunde, Erledigt), Notiz, optional verknüpft mit **Kunde, Anfrage, Auftrag oder Ticket** (höchstens einer;
  Entscheidung 10.11.2026).
- Seite „Aufgaben“ mit „Meine Aufgaben“ (Standard) und „Alle Aufgaben“, Filter Offen/Erledigt/Alle, Gruppen
  Überfällig, Heute, Demnächst, Ohne Datum, Erledigt. Abhaken direkt in der Liste (speichert „erledigt am“).
  Kunden- und Anfrageseite zeigen ihre Aufgaben mit „Aufgabe“-Knopf (Bezug vorbelegt).

### Montagepläne (Plantafel)

- **Zwei Pläne mit derselben Plantafel:** **Montageplan** für Einsätze zu Aufträgen und
  **Service-Plan** für Einsätze zu Service-Tickets. Beide teilen Kolonnen, Monteure, Ressourcen,
  Abwesenheiten und Feiertage. Einsätze des jeweils anderen Plans erscheinen **grau schraffiert als „belegt“**
  (nicht ziehbar, Doppelklick öffnet Auftrag bzw. Ticket), damit Doppelbelegungen sichtbar bleiben. Konflikte
  werden planübergreifend geprüft.
- Zeilen von oben nach unten: Planungszeilen (siehe unten), Kolonnen mit ihren Monteuren, Monteure ohne Kolonne,
  weitere Ressourcen. Es gibt keine Fahrzeugzeilen.
- **Planungszeilen im Montageplan – Auftrags-Pipeline** (Gruppe, auf- und zuklappbar). Aufträge ohne Montagetermin
  stehen in genau einer Zeile, nach dem erreichten Stand:
  - **Lieferung:** Liefertermin gesetzt (Standard).
  - **Abschlag bezahlt:** mindestens eine Abschlagsrechnung ist bezahlt; der Eintrag zeigt „bezahlt/gesamt“
    (z. B. „2/3“), der Tooltip „2 von 3 Abschlägen bezahlt“.
  - **Warten auf Kunde:** von Hand gesetzt (Schalter am Auftrag oder Ziehen in die Zeile); hat Vorrang vor den
    anderen Stufen.
  Datum je Stufe: Standard ist der Liefertermin; Ziehen innerhalb der Zeile auf einen anderen Tag ändert nur das
  Datum der Stufe (nicht den Liefertermin). Die Zeile „Abschlag bezahlt“ füllt sich nur durch eine Zahlung, nicht durch
  Ziehen.
  Liegt das Datum in der Vergangenheit, wird der Eintrag rot markiert.
- **Planungszeile im Service-Plan – „Terminierbar“:** offene Tickets ohne Termin, automatisch in der kommenden
  Woche (siehe Service-Tickets). Ziehen innerhalb der Zeile ändert `vorab_datum`.
- Ziehen aus einer Planungszeile auf eine Kolonne, einen Monteur oder eine Ressource plant ein (dann vorgeplant).
  Ein Einsatz, der zurück in eine Planungszeile gezogen wird (oder „Termin entfernen“ im Dialog), verliert seinen
  Termin und steht dort am Ablagetag. Es gibt keine Ungeplant-Spalte neben der Tafel.
- **Ansichten:** 1 Woche im Stundenraster und 4 Wochen tagesgenau. Das Stundenraster folgt der Geschäftszeit aus
  den Einstellungen (Standard 7 bis 16 Uhr), Raster eine Stunde. Ziehen auf eine Stunde setzt die Beginnzeit, die
  Dauer bleibt erhalten. In schmalen Balken steht nur der Kundenname, die Nummer im Tooltip.
- Die Tafel scrollt waagerecht in einem eigenen Bereich; Kopfzeile und Zeilenbeschriftung bleiben stehen, der
  Scrollbalken ist immer sichtbar. Beim Öffnen steht der heutige Tag im Blick.
- Ein Einsatz kann mehrere Monteure haben und erscheint dann in jeder beteiligten Zeile.
- **Mehrere Einsätze je Auftrag oder Ticket:** **Duplizier-Modus** (Knopf „Duplizieren“ in der Kopfzeile) oder
  gedrückte Alt-Taste: Ziehen eines Balkens erzeugt einen **weiteren echten Einsatz** zum selben Auftrag bzw. Ticket
  (eigene Zeit, eigenes Team, eigene Freigabe), das Original bleibt stehen. Ebenso „Weiterer Einsatz“ am Auftrag und
  „Duplizieren“ im Termin-Dialog (Kopie am nächsten Werktag). Weitere Einsätze sind in der Tafel markiert und lassen
  sich einzeln verschieben, in der Länge ändern, freigeben und löschen.
- **Farbe** je Einsatz: Standard nach Typ, eine Farbe der Planungspalette oder eine **frei gewählte Farbe** aus der
  Farbskala. Bei freier Farbe setzt die App die Schrift automatisch hell oder dunkel (Kontrast ≥ 4,5:1).
- Klick auf einen Einsatz öffnet den Termin-Dialog mit Knopf „Auftrag öffnen“ bzw. „Ticket öffnen“, Doppelklick
  springt direkt in den Auftrag bzw. das Ticket.
- Arbeitszeit standardmäßig 7 bis 16 Uhr, in den Einstellungen änderbar (Vorbelegung beim Einplanen).
- **Dauer per Ziehen:** Ein eingeplanter Balken lässt sich an seinen Enden in der Länge ziehen (Griff erscheint beim
  Überfahren). In der 1-Wochen-Ansicht stundengenau, in der 4-Wochen-Ansicht tagesgenau. Ende muss nach Beginn liegen.
  Ein kurzer Hinweis zeigt beim Ziehen die neue Beginn- bzw. Endzeit. Konflikte werden danach gewarnt, die Änderung
  wird in der Historie protokolliert. Ein Klick auf den Griff öffnet keinen Termin-Dialog.
- Die Legende (Auftrag, Reklamation, Service, Belegt (anderer Plan), Vorgeplant, Weiterer Einsatz, Pipeline bzw.
  Terminierbar, Datum überschritten, Abwesend, Beantragt, Feiertag, Konflikt) steht unter der Tafel. Einsätze zu
  Aufträgen in der Phase „Reklamation“ haben eine eigene Standardfarbe aus der Planungspalette.
- **Vorplanung und Freigabe:** Ein neu eingeplanter Einsatz ist „vorgeplant“ (blass, gestrichelt). „Freigeben“
  einzeln oder gesammelt für den sichtbaren Zeitraum des jeweiligen Plans macht ihn fest. Freigegeben heißt in
  Version 1: fest gebucht und im Wochenplan des Monteurs. Konflikte werden in der Freigabeliste angezeigt.
  Im Termin-Dialog lässt sich ein Einsatz mit „Fest einplanen und freigeben“ in einem Schritt freigeben.
- **Wochenplan je Monteur:** PDF mit allen freigegebenen Einsätzen beider Pläne einer Woche (Kunde, Adresse,
  Telefon, Team, Fahrzeug, Hinweise), Feiertage und Abwesenheiten.
- **Feiertage** des eingestellten Bundeslandes (Standard Niedersachsen) werden in Tafel und Kalender rot markiert.
- Abwesenheiten werden angezeigt, beantragte anders als genehmigte. Abgelehnte nicht.
- **Konfliktwarnung:** Ist ein eingeplanter Monteur im Zeitraum abwesend (genehmigt oder beantragt) oder zeitgleich
  in einem anderen Einsatz (auch im anderen Plan), liegt ein Feiertag im Zeitraum, oder hat das Fahrzeug einen
  Werkstatttermin, wird der Einsatz
  markiert und beim Einplanen und Freigeben gewarnt. Die Warnung blockiert nicht.
- **Kolonnen:** feste Teams mit Stammfahrzeug. Die Kolonne ist eine Gruppenzeile über ihren Monteuren.
  Ziehen auf die Kolonne bucht alle Mitglieder und das Stammfahrzeug.
  - Kolonnen werden direkt in der Plantafel gepflegt: anlegen, umbenennen, Stammfahrzeug wählen, löschen.
  - Monteure werden per Ziehen zwischen Kolonnen verschoben. Mit gedrückter Alt-Taste, im Duplizier-Modus oder über
    das Zeilenmenü wird ein Monteur in eine weitere Kolonne dupliziert; ein Monteur kann in mehreren Kolonnen stehen.
  - Änderungen an Kolonnen gelten dauerhaft. Bereits geplante Einsätze behalten ihr Team.
- **Reihenfolge:** Zeilen und Zeilengruppen (Kolonnen, „Ohne Kolonne“, „Weitere Ressourcen“) lassen sich am Griff
  senkrecht verschieben. Die Reihenfolge wird gespeichert und gilt für alle Benutzer und beide Pläne. Die
  Planungszeilen bleiben oben.
- **Fahrzeuge:** keine eigenen Zeilen. Ein Einsatz hat höchstens ein Fahrzeug, vorbelegt aus der Kolonne und im
  Termin-Dialog änderbar. Werkstatttermine und überfällige Prüftermine erscheinen als Warnung im Termin-Dialog und
  an der Kolonne.
- **Weitere Ressourcen:** frei benannte Zeilen (z. B. Selbstabholer, Lager / Werkstatt, Subunternehmer),
  schnell über „+ Zeile hinzufügen“ in der Tafel. Ebenso schnell: „Monteur hinzufügen“, „Kolonne hinzufügen“.
- **Markierte Zeile:** Überfahren hebt die Zeile hervor, Klick auf die Beschriftung markiert sie dauerhaft
  (Sand-Hinterlegung), damit man sieht, wo man sich befindet.
- Kolonnen und Ressourcen werden in der Plantafel gepflegt, Fahrzeuge unter Team und Ressourcen › Fahrzeuge.
- **Umsetzung (11.11.2026):** Rechenlogik ohne Oberfläche in `src/lib/plantafel-logik.ts` (Ablegen auf Monteur,
  Kolonne oder Ressource, Duplizieren, Zeiten im Stunden- und Tagesraster, Pipeline-Stufen, Farben mit Kontrast,
  Reihenfolge) mit Unit-Tests (`tests/unit/plantafel.test.ts`). Die 4-Wochen-Ansicht zeigt wie die Wochenansicht nur
  Montag bis Freitag (20 Arbeitstage, `?ansicht=4`); Verschieben dort um Werktage, die Uhrzeiten bleiben. Ein Einsatz
  braucht mindestens einen Monteur oder eine weitere Ressource. Die Reihenfolge der Gruppen steht in
  `einstellung.plantafel_gruppen`, die der Zeilen in `reihenfolge` (Kolonnenmitglieder, Monteure ohne Kolonne,
  Ressourcen). „Abschlag bezahlt“ zählt Abschlagsrechnungen mit Status „bezahlt“. Wochenplan als PDF A4 quer je
  Monteur oder Kolonne (`/pdf/wochenplan`, Knopf in der Tafel und auf der Mitarbeiterseite); Samstag nur, wenn dort
  etwas steht.

### Team und Ressourcen

- **Kalender:** Terminkalender für das ganze Team, keine Plantafel-Ansicht.
  - Links: Mini-Monatskalender (Tage mit Einträgen markiert, Klick springt zum Tag), Filter Terminarten mit
    Anzahl und Filter Mitarbeiter.
  - Rechts: Ansichten Monat (Standard), Woche, Tag und Liste; vor/zurück, „Heute“ und „+ Termin“.
  - Terminarten: Montage, Service, Aufmaß, Beratung, Intern, Abwesenheit. Feiertage werden immer angezeigt.
    Einträge mit Uhrzeit und Titel, farbig nach Terminart; zu viele Einträge eines Tages als „+N weitere“.
  - Ein Klick öffnet Auftrag, Ticket, Anfrage oder Termin. Feiertage rot, beantragte Abwesenheiten schraffiert,
    vorgeplante Einsätze gestrichelt.
  - **Termine** (Beratung, Intern) sind eigene Datensätze: Titel, Art, Datum, Beginn, Ende, Mitarbeiter, optional
    Kunde, Anfrage oder Auftrag, Notiz. Montage und Service entstehen im Montage- bzw. Service-Plan.
- **Mitarbeiter:** Name, Kürzel (eindeutig), Rolle, Telefon, Kennzeichen „Monteur“ (erscheint in der Plantafel;
  nur Monteure können Mitglied einer Kolonne sein und in Einsätzen stehen).
  Die Kolonnen werden angezeigt, gepflegt werden sie in der Plantafel. Je Monteur Wochenplan drucken.
- **Fahrzeuge (Fahrzeugpool):** Kennzeichen, Typ, Kolonne, Kilometerstand, Hinweise und Prüftermine
  TÜV/HU, Service, UVV-Prüfung mit Ampel (überfällig, in 30 Tagen fällig). Fällige Termine erscheinen in der Glocke
  und im Montage-Dashboard. Werkstatttermine eintragen.
- **Zeiterfassung:** Das Büro trägt Zeiten ein.
  - Bezug: Auftrag, Service-Ticket oder ohne Bezug (Lager, Fahrt, Büro). Die Arten Montage, Aufmaß und Service
    brauchen immer einen Auftrag bzw. ein Ticket (Entscheidung 10.11.2026).
  - Felder: Mitarbeiter, Bezug, Datum, Beginn, Ende, Pause in Minuten, Art, Tätigkeit (Freitext).
    Die Stunden werden berechnet, Ende muss nach Beginn liegen.
  - Arten: Montage, Aufmaß, Service, Lager / Werkstatt, Fahrt, Büro.
  - Die Wochensumme je Mitarbeiter für die laufende Kalenderwoche steht als Zeile unter der Liste.
  - Freigabe-Stufe: Jede Buchung ist „Offen“ oder „Freigegeben“, das Büro gibt frei (einzeln oder gesammelt für den
    gefilterten Zeitraum). Freigegebene Buchungen sind gesperrt, bis jemand die Freigabe zurücknimmt.
  - Auswertung (Entscheidung 10.11.2026): Summe der Stunden je Mitarbeiter und je Auftrag für Woche, Monat oder
    gesamt. Die Auftragsseite zeigt die Stunden des Auftrags, die Mitarbeiterseite die der laufenden Woche; beide mit
    „Zeit eintragen“ (Bezug vorbelegt).
- **Abwesenheiten:** Anträge trägt in Version 1 das Büro ein.
  - Arten: Urlaub, Krank, Schulung, Überstundenabbau, Sonstiges.
  - Status: Beantragt, Genehmigt, Abgelehnt. Genehmigen, Ablehnen und „Direkt genehmigen“ beim Eintragen nur durch
    `admin`. Ausnahme: Eine Krankmeldung gilt sofort als genehmigt. Eine genehmigte oder abgelehnte Abwesenheit löscht nur `admin`;
    beantragte und Krankmeldungen darf jeder löschen (Entscheidung 10.11.2026).
  - Genehmigungsübersicht: offene Anträge mit Person, Art, Zeitraum, Arbeitstagen, Resturlaub danach und Hinweis,
    wenn die Person in dem Zeitraum eingeplant ist.
  - Urlaubskonto je Mitarbeiter und Jahr: Anspruch (Standard 30 Tage, in den Einstellungen änderbar), genehmigt,
    beantragt, Rest. Gezählt werden Arbeitstage (Montag bis Freitag).

### Einkauf

- **Lieferanten:** Firma, Produktgruppen, Link zum Konfigurator, Link zum Händlerportal, unsere Kundennummer,
  Lieferzeit, Telefon, Notiz und Ansprechpartner (Name, Funktion, Handy, Telefon, E-Mail; Nummern antippbar).
- **Lieferanten-Konditionen:** Freitext je Lieferant mit unseren Einkaufskonditionen (Rabatte, Skonto,
  Frachtfreigrenze). Sichtbar in der Lieferantenübersicht (Karte), auf der Lieferantenseite (eigene Karte, dort
  änderbar) und im Bearbeiten-Dialog, aber nur für Benutzer mit dem Recht „Konditionen sehen“. Eigene Tabelle mit
  eigener RLS-Policy wie die Kunden-Konditionen, nicht als Spalte der Lieferantentabelle.
- **Bestellungen:** Kopf mit Lieferant, Bestelldatum, AB-Nummer des Lieferanten, Liefer-KW, Status (Bestellt,
  Bestätigt) und Zeilen. **Eine Bestellung kann mehrere Aufträge abdecken** (Sammelbestellung): jede Zeile hat
  Auftrag, Artikeltext, Menge und „geliefert“. Kein Bestell-PDF und kein Versand an Lieferanten in Version 1.
- Abgeleitete Status: Bestellung „Teilweise geliefert“/„Geliefert“/„Überfällig“ (Liefer-KW überschritten).
  Auftrag „Offen“, „Teilweise bestellt“, „Bestellt“, „Teilweise geliefert“, „Abgeschlossen“ aus seinen Zeilen und
  dem Feld „Noch nicht bestellt“. Liefer-KW des Auftrags = früheste offene Zeile.
- Beim Anlegen einer Bestellung aus dem Auftrag werden passende Zeilen aus „Noch nicht bestellt“ entfernt.
- **Ware eingetroffen** (Entscheidung 10.11.2026): Ist alles geliefert und nichts mehr offen, zeigt der Auftrag den
  Bestellstatus „Ware eingetroffen“ und, solange er in der Phase „Bestellung“ steht, den Hinweis „Ware vollständig
  eingetroffen“ mit dem Knopf „Phase auf Montage setzen“. Die Phase wechselt nie automatisch.

### Einstellungen

- Reiter: **Firma** (Firmendaten für Belege), **Benutzer** (einladen, Admin ja/nein, Recht „Konditionen sehen“
  ja/nein, aktivieren/deaktivieren, 2FA-Status, Start-Ansicht des Dashboards), **Montageplan** (Arbeitszeit, zugleich
  Stundenraster der Plantafel, Bundesland für Feiertage, Urlaubsanspruch, weitere Ressourcen), **Belege & Artikel**
  (Gültigkeit Angebot, **Zahlungsbedingungen**, Artikelkatalog, Textvorlagen für alle Belegarten, **Versand**:
  Standard-PDF-Gruppen je Belegart aus Beleg, AGB, Widerrufsbelehrung, Pflegehinweisen, Aufmaßblatt und
  Vorgängerbeleg; Version 2), **Verbindungen** (Lexware, OneDrive mit Basisordner, E-Mail „kommt mit Version 2“, **interne Kopie (BCC) je Belegart** für den vorläufigen Versand), **Darstellung**
  (**Farbschema Hell, Dunkel oder wie das System**, je Benutzer gemerkt; Seitenleiste hell oder dunkel).
- **Artikelkatalog:** Bezeichnung (Kurztext), Einheit, Preis netto, formatierbare Beschreibung (wird als
  Positionsbeschreibung übernommen) und Stern „Schnellauswahl“ (Knopf im Beleg-Editor). Anlegen, bearbeiten,
  löschen (Löschen als Markierung).
- Es gibt keine Rollen mit eigenen Rechten, nur zwei Einzelrechte: Admin und „Konditionen sehen“ (gilt für Kunden-
  und Lieferanten-Konditionen).
  Mindestens ein aktiver Admin muss bleiben.

### Version 2 (nicht in Version 1)

- **Monteur-App** mit Rolle `monteur`: eigene freigegebene Einsätze sehen, Zeiten stempeln, Anträge stellen,
  Chat, Fotos, Checklisten und Protokolle digital mit Unterschrift, Aufmaß offline.
- Automatische Anfragen, KI-Agents.

### Demo-Daten des Prototyps

- Die Demo-Daten folgen denselben Regeln wie die App: Nummern je Nummernkreis chronologisch, Aufträge mit
  Quelle „Anfrage“ haben eine gewonnene Anfrage, Zeiterfassung passt zu den freigegebenen Einsätzen, keine Einsätze
  über Wochenende oder Feiertag, Abschläge passend zur Zahlungsbedingung, Monteure handeln in Version 1 nicht selbst
  in der App (Rückmeldungen trägt das Büro ein). Die Airtable-Übernahme muss dieselben Regeln einhalten.

## Sicherheit (nicht verhandelbar)

Maßstab ist OWASP ASVS Level 1. Vor dem Start mit Echtdaten müssen alle Mindestkriterien unten erfüllt sein.

1. **Rechte werden in der Datenbank geprüft.** Jede Tabelle hat RLS aktiviert und Policies. Nie nur in der
   Next.js-Middleware oder im Frontend prüfen. Nach jeder Migration die Supabase Advisors ausführen, null Warnungen.
2. **Geheimnisse nur serverseitig.** Lexware-, Microsoft- und Supabase-Service-Schlüssel nur in
   Server-Umgebungsvariablen. Nie in `NEXT_PUBLIC_*`, nie im Repository, nie in Logs.
   Der Supabase `service_role`-Schlüssel wird nur in klar abgegrenzten Serverfunktionen verwendet.
3. **Anmeldung nur per Einladung,** keine offene Registrierung. MFA ist Pflicht für alle Nutzer.
4. **Löschen nur als Markierung** (`deleted_at`), nie hartes Löschen von Fachdaten. Das gilt auch für verworfene
   Beleg-Entwürfe, Chat-Nachrichten und Formulare.
5. **Audit-Log für jede Änderung** an Fachdaten, besonders an Belegen: wer, wann, was, vorher/nachher.
   Auch Zugriffe von Luca als Admin werden protokolliert.
6. **Rollen in Version 1:** Alle Nutzer haben gleiche Rechte. Ausnahmen: Nur `admin` verwaltet Benutzer und
   genehmigt Abwesenheiten (Krankmeldungen gelten ohne Genehmigung). Nur Benutzer mit dem Recht `konditionen`
   lesen und ändern die Kunden- und Lieferanten-Konditionen; beide Tabellen sind für alle anderen per RLS gesperrt,
   auch für Lesezugriffe über Suche, Export oder Joins. Die Prüfung liegt in der RLS-Policy.
   Die Dashboard-Ansicht ist eine Benutzereinstellung, keine Rolle. Rolle `monteur` ist im Datenmodell vorgesehen,
   aber erst mit der Monteur-App (Version 2) in Gebrauch.
   Vor dem Finalisieren einer Rechnung oder Gutschrift immer ein Bestätigungsdialog.
7. **Sicherheits-Header** stehen in `next.config.ts`. Offen: vollständige CSP mit Nonce, sobald die Supabase-URL feststeht.
8. **Abhängigkeiten:** Dependabot aktiv, `npm audit --omit=dev` ohne hohe Befunde.
9. **Datenbankänderungen nur als Migration** über die Supabase CLI (`supabase/migrations`), nie per Klick im Dashboard.
10. **Uploads** (Fotos im Chat, Scans) nur in private Storage-Buckets mit RLS, Dateityp und Größe serverseitig prüfen.
11. **Formatierte Texte** (Positions- und Artikelbeschreibungen) werden vor dem Speichern serverseitig nach Whitelist
    bereinigt und nie ungeprüft als HTML ausgegeben (XSS). E-Mail-Empfänger und Anhänge prüft der Server; Anhänge nur
    aus dem OneDrive-Ordner des jeweiligen Auftrags bzw. Tickets, aus freigegebenen Vorlagen oder als frischer Upload.

## Lexware-Regeln

- Es gibt keine Lexware-Sandbox. Entwicklung und Staging arbeiten **nur gegen ein eigenes Lexware-Testkonto (Tarif XL)**.
  Der API-Schlüssel von Sawins echtem Lexware wird erst beim Go-live in Produktion gesetzt.
- An Lexware gehen nur Rechnung, Abschlagsrechnung (von der App als normale Rechnung angelegt) und Gutschrift
  (`precedingSalesVoucherId` = Rechnung bzw. Abschlag); Angebot, AB, Teil-AB und Lieferschein bleiben in der App.
- Ablauf „Fertigstellen“ (`src/lib/lexware/uebertragung.ts`): Bestätigungsdialog → Entwurf speichern →
  `lexware_start` (Regeln, Sperre gegen doppelte Übertragung, Abschlagsnummer) → Kontakt sichern → Beleg mit
  `finalize=true` anlegen → Nummer, Beträge je Satz und Original-PDF übernehmen (`lexware_fertig`). Gab es schon einen
  Versuch oder kam keine Antwort, sucht die App vorher in Lexware einen passenden Beleg (Kontakt, Datum, Betrag), damit
  nichts doppelt entsteht. Fehler stehen am Entwurf (`lexware_status` = fehler, `lexware_fehler`) und werden mit
  „Fertigstellen“ wiederholt. Fehlt das PDF, holt die App es beim Öffnen nach; bis dahin zeigt sie die eigene Vorschau
  mit Wasserzeichen „Entwurf“ (wird nie versendet).
- Ergebnisse von Lexware (Nummer, Status, Beträge, PDF-Pfad, Kontakt-ID) schreibt nur der Server über die
  Datenbankfunktionen `lexware_*` mit der Service-Rolle; Benutzer können sie nicht aufrufen. Der handelnde Benutzer
  wird mitgegeben und steht im Audit-Log (`app.handelnder()`).
- Finalisierte Rechnungen und Gutschriften sind endgültig und nicht löschbar.
- Rate-Limit: höchstens 2 Anfragen pro Sekunde. Alle Aufrufe über eine zentrale Funktion mit Drosselung und
  Wiederholung bei HTTP 429 (exponentielles Backoff): `src/lib/lexware/client.ts`.
- API-Gateway: `https://api.lexware.io`.
- Positionen: Titelzeile in `name`, Beschreibung als reiner Text in `description` (Formatierung aus der App wird
  umgewandelt: Aufzählungen als „• “, Nummerierung als „1. “, Farbe und Fett entfallen). Angebote mit `expirationDate`.
- Datum immer mit Uhrzeit und Zeitzone (`2026-11-10T00:00:00.000+01:00`), ein reines Datum lehnt Lexware ab.
- Belegfelder: Adresse je Beleg in `address` (mit `contactId`, Felder des Belegs überschreiben die Kontaktadresse),
  Bauvorhaben und Objekt / Lieferanschrift als erste Zeilen der Einleitung, Einleitung in `introduction`, Nachbemerkung in `remark`,
  Zahlungsbedingung (gefüllter Text) in `paymentConditions`, Liefer-/Leistungsdatum in `shippingConditions` (bei Rechnungen Pflicht),
  Steuerart in `taxConditions.taxType` (`net`, `gross`, `constructionService13b`, `vatfree`), Positionsrabatt in
  `discountPercentage`, Gesamtrabatt in `totalPrice.totalDiscountPercentage` bzw. `totalDiscountAbsolute`,
  Freitextzeilen als Position vom Typ `text`.
- Tags, interner Kommentar, Kunden- und Lieferanten-Konditionen, `kette_id`, Pipeline-Stufen, Einsatzfarben und
  Zahlungsbestätigungen gehen nie an Lexware.
- **Ergebnisse im Testkonto (10.11.2026).** Mit der neuen Abschlag-Regel entfallen die Punkte (b), (h), (i), (k),
  (r) und (s) (keine Lexware-Abschlagsrechnungen mehr), ebenso (a) und (e) (Angebote gehen nicht an Lexware).
  - (c) Gutschrift mit `precedingSalesVoucherId` einer Rechnung: angenommen, beide Belege verweisen aufeinander
    (`relatedVouchers`); die Gutschrift verringert den offenen Betrag der Rechnung.
  - (d) Grenzen: Titel 25 Zeichen, `name` 255, `description`, `introduction` und `remark` je 2000 Zeichen,
    Einzelpreis höchstens 4 Nachkommastellen, Einheit (`unitName`) Pflicht. Negativer Gesamtbetrag wird abgelehnt.
  - (f) Steuerarten: `net`, `gross` und gemischte Sätze gehen; `constructionService13b` nur an einen Firmenkontakt
    mit `allowTaxFreeInvoices` (USt-IdNr. nicht nötig), Positionen mit 0 %; `vatfree` lehnt dieses Konto ab
    („No vatfree invoices allowed for this organization“) – vor dem Go-live mit Sawins Konto und Steuerberater klären.
  - (g), (n), (o) Ein fertig gefüllter Zahlungsbedingungstext wird unverändert übernommen (500 Zeichen geprüft);
    `paymentTermDuration` und `paymentDiscountConditions` werden gespeichert, Lexware berechnet die Fälligkeit.
  - (j) Rechnung ohne Lexware-Vorgänger: voll nutzbar; Minuspositionen (Abzug der Abschläge) sind erlaubt.
  - (l) `description` übernimmt Zeilenumbrüche, „•“, „1. “, Umlaute und Sonderzeichen unverändert.
  - (m) Am Kontakt nur eine Rechnungs- und höchstens eine Lieferadresse; die Lieferanschrift erscheint nicht als
    eigenes Feld auf der Rechnung, deshalb steht sie in der Einleitung (p). Die Kundennummer vergibt Lexware.
  - (p) Bauvorhaben und Objekt / Lieferanschrift: erste Zeilen der Einleitung (auf dem PDF geprüft).
  - (q) Zahlungen sind über die API nur lesbar. `/v1/payments/{id}` liefert `openAmount`, `voucherStatus` und
    `paymentItems` (Art, Buchungsdatum, Betrag; **ohne eigene ID**, die App bildet einen Schlüssel aus Beleg, Art, Datum,
    Betrag und laufender Nummer). Eine Gutschrift zu einer Rechnung erscheint als `partPaymentCreditNote` und
    verringert `openAmount`. Die Belegliste (`voucherlist`) enthält `openAmount` je Rechnung. Event-Abos
    (`payment.changed`) brauchen eine öffentliche Adresse und werden mit Staging auf Vercel geprüft.
  - Rundung: Lexware rundet jede Zeile auf Cent und rechnet die Steuer je Satz auf die Summe, netto wie brutto, auch
    mit Positions- und Gesamtrabatt – genau wie `src/lib/beleg-summen.ts` (geprüft, centgleich).
  - PDF: `GET /v1/invoices/{id}/file` bzw. `/v1/credit-notes/{id}/file` liefert das Original, erst nach dem
    Fertigstellen (Entwürfe haben kein PDF).

## Designsystem

- **Nur Tokens verwenden.** Farben, Radien und Schatten kommen aus `src/styles/tokens.css` und dem Kunden-Theme.
  Keine festen Farbwerte in Komponenten (Ausnahmen nur im App-Rahmen, wo Weißtöne auf Anthrazit nötig sind).
- **Hell und Dunkel:** Jeder Token hat einen hellen und einen dunklen Wert (`[data-theme="dark"]` auf `<html>`;
  „System“ folgt `prefers-color-scheme`). Flächen über `--card`, `--surf`, `--surf2`, nie `#fff`. Belege, Formulare,
  Wochenplan, PDF und Druck setzen die hellen Werte lokal neu und bleiben immer hell (Papier). Im Dunkelmodus ist
  die Seitenleiste immer dunkel. Kontrast in beiden Modi mindestens 4,5:1 für Text; Planungspalette und
  Kalenderfarben haben eigene Dunkel-Werte.
- **Logo:** exakt das Logo von sawin-bauelemente.de, als SVG nachgezeichnet: Gebäude-Symbol (Konturen in Strichfarbe,
  Flächen Sand `#D2B19A` und Grau `#B3B3B3`) und Wortmarke „SAWIN“ (Sand) mit „BAUELEMENTE“ und Linie darunter.
  Konturen, „BAUELEMENTE“ und Linie sind weiß auf dunklem und anthrazit (`#2E2B28`) auf hellem Grund (Token
  `--logo-ink`, auf der Seitenleiste `--frame-logo-ink`; Komponente mit `variante` „voll“ oder „symbol“). Seitenleiste:
  ganzes Logo, eingeklappt nur das Symbol; Anmeldeseite: ganzes Logo; Belegkopf, Formulare und Wochenplan: ganzes Logo; Browser-Symbol: Symbol
  auf Anthrazit. Liegt als SVG in `src/customers/sawin/` (am besten die Original-Vektordatei von Sawins Agentur
  anfordern und gegen die Nachzeichnung tauschen).
- **Akzentfarbe nur als Fläche.** Text auf Akzent nutzt `text-accent-ink`. Akzent als Textfarbe nur über `text-accent-text`.
  Kontrast mindestens 4,5:1 für Text.
- Feiertage und Konflikte nutzen die Token-Farbe für „Fehler/Rot“, Vorplanung die gestrichelte Darstellung.
- **Planungspalette:** feste Palette als Tokens (`--plan-1` bis `--plan-10`) für Einsätze in den Plantafeln.
  Gespeichert wird der Token-Name. Jede Palettenfarbe erreicht mit der Textfarbe mindestens 4,5:1.
  **Ausnahme frei gewählte Einsatzfarbe:** gespeichert als Hex-Wert (`#RRGGBB`, serverseitig geprüft); die
  Textfarbe wird aus der Helligkeit berechnet (hell oder dunkel, Kontrast ≥ 4,5:1). Das ist der einzige erlaubte
  feste Farbwert außerhalb der Tokens, ebenso wie die frei gewählte Schriftfarbe in Positionsbeschreibungen.
  Terminarten im Kalender haben eigene Tokens.
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
- Kundenspezifische Stammdaten (Bundesland, Produktgruppen, Formular-Checklisten je Produkt, Artikel, Textvorlagen
  für Belege) sind Konfiguration bzw. Daten, kein Sonder-Code.

## Go-live-Mindestkriterien (vor Echtdaten)

- [ ] RLS auf allen Tabellen, Policies getestet, Supabase Advisors ohne Warnung
- [ ] MFA für alle Nutzer aktiv
- [ ] Auth-E-Mails (Einladung, Passwort vergessen) über einen eigenen SMTP-Zugang getestet; Inaktivitäts-Grenze der
      Sitzungen in Supabase (Pro-Tarif) auf 60 Minuten gesetzt; Schutz vor geleakten Passwörtern (HaveIBeenPwned,
      Pro-Tarif) aktiv, damit die Advisors ohne Warnung sind
- [ ] Backups aktiv (Pro-Tarif, PITR) und eine Wiederherstellung einmal getestet
- [x] Lexware-Testpunkte geprüft und die Entscheidung zu AG/AB festgehalten (10.11.2026, siehe Lexware-Regeln);
      offen nur noch `vatfree` und das Zahlungs-Event (q)
- [ ] Belegerstellung vollständig gegen das Lexware-Testkonto durchgespielt: Angebot → AB → Auftrag, zwei Abschläge,
      Schlussrechnung mit Abzug, Gutschrift und Ticket-Rechnung mit Austausch der Vorschau durch das Lexware-PDF
      erledigt (`npm run test:lexware`, 10.11.2026); Zahlungsstand aus Lexware und „Als bezahlt markieren“ erledigt
      (`npm run test:zahlungen`, 10.11.2026); Teil-AB → Lieferschein → Teilrechnung und Schlussrechnung mit Abzug der Teilrechnung erledigt
      (`npm run test:lexware`, 10.11.2026); offen: eine echte Bankzahlung in
      Lexware gebucht und abgeglichen
- [ ] Nummernkreise der App-Belege mit Sawin abgestimmt (Startwerte je Belegart nach der Airtable-Übernahme)
- [ ] OneDrive-Ablage mit Sawins Bibliothek getestet (nur die eine Bibliothek freigegeben, Ordner ab Angebot, Umbenennung mit der AB, Zwischenspeicher)
- [ ] Vorläufiger Versand (Download, `mailto` mit BCC an angebot@/auftrag@) mit Sawins Outlook geprüft; Versand über Microsoft Graph folgt in Version 2
- [ ] Steuerarten (Standard, § 13b, steuerfrei), Pflichtangaben auf Rechnungen und das Muster der
      Zahlungsbestätigung (ohne Umsatzsteuer) mit Sawins Steuerberater abgestimmt
- [ ] Datenübernahme aus Airtable als Probelauf auf Staging durchgeführt und geprüft
- [ ] ASVS-Level-1-Checkliste abgehakt
- [ ] AVV mit Sawin angepasst (Supabase direkt mit Sawin, Vercel bis zur Übergabe als Unterauftragsverarbeiter von Luca)
- [ ] Übergabe-Anleitung vollständig: alle Umgebungsvariablen, Dienste und manuellen Schritte beschrieben

Airtable und Make bleiben nach dem Start 2 bis 4 Wochen eingefroren als Rückfallebene.

## Arbeitsweise

- Erst auf Staging, nach Abnahme auf Produktion. Updates gebündelt einmal pro Woche.
- Vor jedem Commit: `npm run lint`, `npx tsc --noEmit`, `npm run build`.
- Next.js 16: vor neuem Code die Doku in `node_modules/next/dist/docs/` prüfen (siehe AGENTS.md).
- Änderungen am fachlichen Umfang zuerst in der Demo und in dieser Datei festhalten, dann bauen.
