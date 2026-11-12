# Datenübernahme aus Airtable

Stand 12.11.2026. Plan am 12.11.2026 bestätigt (E1–E8 wie empfohlen). Gebaut sind das Import-Skript, die Schalter für
den Altbestand und das Leeren von Staging.

**Probelauf auf Staging (12.11.2026):**
- Staging wurde geleert und importiert, ohne Fehler beim Schreiben.
- Ein zweiter Lauf legte nichts neu an (alles „aktualisiert“).
- Eine in der App geänderte Zeile blieb erhalten („übersprungen“).
- Summen: Abschläge und ABs centgleich mit Airtable. Bei Angeboten (1.912,93 €) und Rechnungen (190,40 €) fehlen genau
  die vier Belege ohne Kunden.
- Stichproben gleich.

Erkenntnis aus dem Lauf: Das Airtable-Feld „Vorgänger-IDs“ enthält die verknüpften Lexware-Belege in **beide**
Richtungen. Die Kette bildet sich daraus; die Richtung bestimmt die Belegart. Abschlagsnummern und Teilrechnungen gelten
je Auftrag. Grundlage: Base „Sawin
Bauelemente“ (`AIRTABLE_BASE_ID`, nicht die Kopie), nur lesend über `AIRTABLE_TOKEN`.

## Ablauf

```bash
# Staging (Testkonto, Schalter aus)
npm run staging:leeren -- --projekt=<staging-ref>            # zeigt, was gelöscht würde
npm run staging:leeren -- --projekt=<staging-ref> --ja       # löscht (nur Staging, siehe unten)
npm run import:airtable                                      # Probelauf: rechnet, schreibt nur den Bericht
npm run import:airtable -- --schreiben --projekt=<staging-ref>

# Go-live (Produktion, eigene Umgebungsdatei mit Sawins Lexware-Schlüssel und beiden Schaltern auf „aktiv“)
npm run import:airtable -- --env=.env.produktion
npm run import:airtable -- --env=.env.produktion --schreiben --projekt=<produktion-ref> --lexware-lesen
```

- Der Bericht liegt in `berichte/` (nicht im Repository). Er enthält die Anzahl je Tabelle (gelesen, neu, aktualisiert,
  übersprungen, Fehler), die Verteilung, die Nummernkreise vorher und nachher, die Summen (Airtable gegen App), die
  Hinweise, die Datensätze ohne Zuordnung und je Tabelle 10 Stichproben. Personendaten zeigen die Stichproben nur als
  „gleich“ oder „abweichend“.
- **Wiederholbar:** Jede übernommene Zeile trägt `airtable_id` und `import_stand`. Ein zweiter Lauf legt nichts doppelt
  an. Er aktualisiert nur Zeilen, die seit dem letzten Import niemand geändert hat (`updated_at = import_stand`), weder
  in der App noch durch den Zahlungsabgleich.
- Das Skript ruft Lexware nie schreibend auf. `--lexware-lesen` liest nur (GET), und nur mit `LEXWARE_ALTBESTAND=aktiv`.
- Code: `scripts/airtable-import.mjs` (Ablauf, Schreiben, Bericht), `scripts/airtable/zuordnung.mjs` (Zuordnung,
  Unit-Tests `tests/unit/airtable-zuordnung.test.ts`), `scripts/airtable/lieferanten.json` (Lieferantenkürzel).

## Bestand in Airtable (12.11.2026)

| Tabelle | Datensätze | Übernahme |
|---|---|---|
| Kunden | 861 (alle mit Lexware-Kontakt-ID, Kundennummer 10002–10874) | alle → `kunde`, 143 Lieferadressen |
| Aufträge | 189 (erstellt 22.07.–11.11.2026) | 75 → `auftrag`, 114 → `anfrage` |
| Belege | 585 (01.09.2025–12.11.2026, alle mit Lexware-ID) | 578 → `beleg` (3 in Lexware gelöscht, 4 ohne Kunde) |
| Aufgaben | 8 | → `aufgabe` |
| Anfragen | 1 (gewonnen, archiviert, ohne Auftrag) | nein |
| Zeiterfassung | 12 (Testeinträge ohne Auftrag und Stunden) | nein |
| Fehlerprotokoll | 0 | nein |

Airtable hat keine Anhang-Felder und keine Belegpositionen (nur Kopfdaten und Beträge).

## Zuordnung

### Kunden → `kunde`, `kunde_lieferadresse`

| Airtable | App | Regel |
|---|---|---|
| Kundennummer | `nummer` | unverändert (Lexware-Kundennummer); Nummernkreis Kunde danach ab höchster + 1 |
| Firmenname / Vorname + Nachname | `name`, `typ` | Firmenname gesetzt → `firma`, sonst `privat` „Vorname Nachname“ (fehlt beides: „Kontakt“) |
| Anrede | `anrede` (neu) | vereinheitlicht: Herr, Frau, Familie, Eheleute, Dr.; nur bei Privatkunden |
| Vor-/Nachname bei Firmen, Ansprechpartner 1/2 | `ansprechpartner` | „Frau Erika Beispiel · Telefon · E-Mail; …“ |
| Straße/PLZ/Ort/Land 1 | Rechnungsadresse | PLZ mit führender Null (Airtable speichert Zahlen), Land „Deutschland“ |
| Straße/PLZ/Ort 2 | Lieferadresse | Bezeichnung = Adresszusatz 2, sonst „Lieferadresse“; gleich der Rechnungsadresse: entfällt |
| Telefon 1, E-Mail 1 | `telefon`, `email` | |
| Adresszusatz 1, Telefon 2, E-Mail 2 | `notiz` | |
| Lexware Contact ID | `lexware_kontakt_id` | nur gespeichert; Prüfsumme wie in der App (`lexware_hash`), damit der Lexware-Kontakt erst nach einer Änderung in der App aktualisiert wird |
| § 13b | `bauleister_13b` | nicht in Airtable → `false` (9 Belege ohne USt im Bericht) |

### Aufträge → `auftrag` oder `anfrage`

| Lage in Airtable | Anzahl | App |
|---|---|---|
| AB-Nr. gesetzt | 67 | `auftrag`, Nummer = AB-Nr. (bei 8 liegt die AB nur als Entwurf vor) |
| „Bestellung“/„Montage“ ohne AB-Nr., ohne Status | 8 | `auftrag` mit neuer Nummer aus dem AB-Kreis und Prüfhinweis; die AB entsteht am Auftrag (E6) |
| „Angebotserstellung“ ohne AB | 114 | `anfrage`: offenes Angebot → „Angebot versendet“, sonst „Angebot erstellen“ |

Phase und Montagestatus 1:1 (Offen → „Nicht begonnen“). Mitarbeiter → Zuständig (Benutzer mit gleicher E-Mail).
Produkte aus den Häkchen, Bemerkung, „Noch nicht bestellte Artikel“ (Rich-Text als Text). Montagebeginn/-ende
(2 Aufträge) stehen im Prüfhinweis, weil ein Einsatz einen Monteur braucht. Titel gibt es in Airtable nicht (Produkte).

### Belegketten ohne Airtable-Auftrag (E2)

Ketten über die Vorgänger-IDs (Lexware). 144 Ketten hängen an keinem Airtable-Auftrag, fast alle aus der Zeit vor Airtable:

- mit fertiger AB → `auftrag` (Nummer = AB). „Abgeschlossen“, wenn eine Rechnung existiert und alles bezahlt ist,
  sonst „Bestellung“ mit Prüfhinweis (15 + 15)
- nur Angebote → `anfrage` (52)
- nur Rechnungen bzw. Abschläge → Altbeleg nur am Kunden (73 Belege, darin offene Forderungen)

### Belege → `beleg`

| Airtable | App | Regel |
|---|---|---|
| Belegart | `art` | Rechnungskorrektur → `gutschrift` |
| Belegnummer | `nummer` | unverändert; AB- und Lieferschein-Entwürfe ohne Nummer |
| Status | `status` | Angebot 1:1 (offen am Auftrag → angenommen bzw. nicht beauftragt); AB/LS → fertiggestellt; Rechnung/Abschlag: Offen, Überfällig → offen; Bezahlt; **Storniert** (E3) |
| Betrag netto/brutto | Summen, `steuern` | Satz aus dem Verhältnis (19 %); ohne USt → § 13b (Bericht) |
| Offener Betrag | `offen_betrag`, `lexware_offen` | |
| Abschlagsrechnung | `abschlag_nr` | je Kette nach Datum |
| Schlussrechnung | `teil` | weitere Rechnungen eines Auftrags werden Teilrechnungen |
| Vorgänger-IDs | `vorgaenger_id`, `kette_id` | |
| Lexware-Beleg-ID, Deeplink | `lexware_id`, `lexware_link` | nur gespeichert |
| – | `altbestand` | immer `true` |

**Kopfbeleg:** Ein fertiger Altbeleg ohne Positionen zeigt eine Seite mit den Kopfdaten und dem Link zum Original in
Lexware. Er ist nicht bearbeitbar und nicht herunterladbar. Ein übernommener Entwurf ist bearbeitbar.

**Storniert:** zählt nicht als Forderung, nicht als Abzug in der Schlussrechnung, nicht als Folgebeleg der AB und
nicht als Schlussrechnung (App und Datenbank).

### OneDrive-Ordner → `ablage_ordner`

148 Links, 125 mit Item-ID. Name aus dem Link (altes Schema `26-0xxx_<Kunde>`, bleibt). Drive-ID aus den Einstellungen
(Bibliothek „Kundenprojekte“). Ordner nur mit Link sucht die App in Produktion lesend über den Pfad, legt sie nie neu an.

### Bestellungen (E7)

„Lieferung KW“ enthält Lieferantenkürzel mit KW (BE 27, Ino 16, Roma 15, Hörm 3, Erfal 3, Nüßing 1). Bei
Bestellstatus „Bestellt“ und weiter entsteht je Auftrag, Lieferant und KW eine Bestellung, sobald das Kürzel in
`scripts/airtable/lieferanten.json` einem Lieferanten der App zugeordnet ist. Nicht zugeordnete Teile und „Bestelle
Artikel“ stehen als Text in der Bemerkung des Auftrags. **Offen:** Zuordnung der Kürzel durch Sawin.

### Aufgaben, Benutzer

Aufgabe → Titel, Beschreibung und Notiz → Notiz, Status und Priorität 1:1, Zuständig per E-Mail. Fehlt der Benutzer
(Staging hat nur den Admin), bleibt „Zuständig“ leer. Der Bericht nennt die Personen.

## Lexware und OneDrive: Altbestand nur speichern

Übernommene Kunden, Belege und Ordner tragen `altbestand`. Zwei Server-Variablen schalten ihn frei
(`src/lib/altbestand.ts`):

- `LEXWARE_ALTBESTAND=aktiv` – Zahlungsabgleich (Cron, Webhook, „Zahlungsstand abrufen“), PDF-Abruf und Kontakt
  nutzen die übernommenen Lexware-IDs. Ohne den Schalter (Staging):
  - Die App ruft Lexware mit keiner übernommenen ID auf.
  - Eine Gutschrift zu einem Altbeleg wird abgelehnt, bevor etwas an Lexware geht.
  - Eine neue Rechnung für einen übernommenen Kunden legt im Testkonto einen eigenen Kontakt an. Die übernommene ID
    wird dabei ersetzt und der Kunde ist kein Altbestand mehr.
- `ONEDRIVE_ALTBESTAND=aktiv` – die App schreibt in übernommene Kundenordner. Ohne den Schalter bleiben Dateien im
  Zwischenspeicher. Wichtig für Staging, weil es an Sawins echter Bibliothek hängt.
- Mit dem Schalter (Produktion) übernimmt die App bei einer Kontaktänderung Vor-/Nachname, Ansprechpartner und Notiz
  aus Lexware, solange sie dasselbe meinen.
- Abschläge aus Lexware sind dort echte Abschlagsrechnungen (`down-payment-invoices`). Die App liest sie in der
  Belegliste mit und holt ihr PDF über den richtigen Pfad.
- **Mit dem Steuerberater klären:** Die Schlussrechnung der App zieht diese Abschläge als Minuspositionen ab (normale
  Rechnung). In Lexware bleiben die Anzahlungen der alten Abschlagsrechnungen dadurch evtl. offen gebucht.

Browser-Test: `npm run test:altbestand` (Kopfbeleg, Storno, Altrechnung ohne Vorgang, Zahlungsstand, Gutschrift,
neuer Kontakt).

## Nummernkreise

Startwerte für den Go-live (12.11.2026), gegen Sawins Lexware geprüft (dort als Nächstes AG1260510, AB2260237, LS0012,
Kunde 10875). Sie stehen in `nummernkreis.start` (Migration, gilt auch in Produktion); die App vergibt nie weniger,
auch nach „Staging leeren“ oder der Übernahme:

| Kreis | höchste aus Übernahme bzw. Lexware | Startwert der App |
|---|---|---|
| Angebot | AG1260509 (Lexware) | AG1261000 (ab 2027 wieder AG1270001) |
| Auftragsbestätigung | AB2260236 | AB2261000; die 8 Aufträge ohne AB bekommen AB2261000–AB2261007 |
| Lieferschein | LS0011 | LS1000 (vierstellig, ohne Jahr wie in Lexware) |
| Kunde | 10874 (Lexware als Nächstes 10875) | 30000 |
| Zahlungsbestätigung, Anfrage, Service-Ticket, Bestellung | – | ZB1260001, 1, ST-26-0001, BE-26-001 |

`npm run golive:pruefen` liest die Nummern aus der App und (nur GET) aus Lexware und meldet mit Exit-Code 1, wenn ein
Startwert nicht über der höchsten fremden Nummer liegt (Übernahme bzw. Lexware; Nummern, die die App selbst ab dem
Startwert vergeben hat, zählen nicht). Kundennummern schickt die App nicht an Lexware; Lexware lehnt eine vorgegebene
Nummer ab und vergibt eine eigene, deshalb gibt es keine Überschneidung.

Rechnung, Abschlag und Gutschrift nummeriert Lexware.

## Positionen aus Lexware (E1, nur Produktion)

`--lexware-lesen` liest für offene Angebote und Entwürfe sowie die ABs laufender Aufträge (ohne Schlussrechnung) den
Beleg aus Sawins Lexware (GET `/v1/quotations/{id}` bzw. `/v1/order-confirmations/{id}`). Übernommen werden Positionen,
Einleitung, Nachbemerkung, Zahlungsbedingung, Steuerart, Gesamtrabatt und Adresse. Weicht die Summe der Positionen vom
Airtable-Betrag ab, steht das im Bericht. Originale der Rechnungen und Abschläge holt die App beim Öffnen. Ältere,
abgeschlossene Belege bleiben Kopfbelege.

## Staging leeren

`scripts/staging-leeren.mjs`, nur nach Bestätigung (erteilt am 12.11.2026):

- **Bleiben:** Benutzer, Benutzereinstellungen, Einstellungen, Belegarten, Zahlungsbedingungen, Textvorlagen, Artikel,
  Mitarbeiter, Fahrzeuge, Kolonnen, Ressourcen und Lieferanten (E8: Stammdaten und Monteure für die Browser-Tests).
- **Werden geleert:**
  - alle Geschäftsdaten (inkl. Abwesenheiten, Lexware-Ereignisse und Audit-Log)
  - die Dateien aller Storage-Buckets
  - der Inhalt von `_App-Test` (SharePoint-Papierkorb)
  - die Nummernkreise beginnen bei 0
- **Schutz gegen Produktion:** `--projekt` muss passen, und mit einem aktiven Altbestand-Schalter bricht das Skript ab.
