# Datenmodell Version 1 (Stand 09.11.2026)

Grundlage: `CLAUDE.md` und `docs/demo/sawin-demo.html`. Umgesetzt in `supabase/migrations` und eingespielt in
Supabase-Staging `sawin-staging` (Frankfurt, Postgres 17); die Produktion bekommt dieselben Migrationen
(siehe `docs/uebergabe.md`).

Statuswerte der Belege: Angebot `entwurf`, `offen`, `angenommen`, `abgelehnt`, `nicht_beauftragt`; Rechnung,
Abschlag, Gutschrift `entwurf`, `offen`, `bezahlt` (überfällig wird berechnet); AB, Teil-AB, Lieferschein `entwurf`,
`fertiggestellt` (der AB-Status „Bestätigt / In Abwicklung / Abgerechnet“ wird aus der Kette berechnet);
Zahlungsbestätigung `fertiggestellt`.

## Grundregeln für alle Tabellen

| Regel | Umsetzung |
|---|---|
| Schlüssel | `id uuid primary key default gen_random_uuid()` |
| Wer, wann | `created_at`, `created_by`, `updated_at`, `updated_by` per Trigger (`auth.uid()`) |
| Soft Delete | `deleted_at`, `deleted_by`. `DELETE` ist für `anon`, `authenticated` und `service_role` entzogen (auch der Server löscht nie echt). Gelöscht wird nur über die Funktion `public.loeschen(tabelle, id)`, die prüft und `deleted_at` setzt. Gelöschte Zeilen sind über die API nicht mehr sichtbar. |
| Audit-Log | Ein Trigger auf jeder Fachtabelle schreibt jede Änderung in `audit.log`: Zeitpunkt, Benutzer (`auth.uid()`), Datenbankrolle, Tabelle, Datensatz, Aktion, vorher/nachher als JSON, geänderte Spalten. Änderungen per Service-Rolle oder direkt in der Datenbank (z. B. Luca als Admin) werden mit Rolle protokolliert. Das Log ist nur anhängbar, niemand kann es ändern oder löschen. |
| Statuswerte | `text` mit `CHECK` (Schlüssel wie `in_klaerung`), Anzeigetexte in der App. Kundenspezifische Listen (Produkte, Herkunft) sind freie Werte bzw. Einstellungen, keine Datenbankregel. |
| Bezug Auftrag oder Ticket | zwei Fremdschlüssel `auftrag_id`, `ticket_id` mit `CHECK (num_nonnulls(...) = 1)`. Bei Belegen drei (`anfrage_id`, `auftrag_id`, `ticket_id`). |
| Geld | `numeric(12,2)`, Mengen `numeric(12,3)`, Prozente `numeric(5,2)` |

## Rechte (Row Level Security)

Auf **jeder** Tabelle ist RLS aktiv. Hilfsfunktionen im nicht öffentlichen Schema `app`:

- `app.ist_benutzer()`: angemeldet, **MFA bestätigt** (`aal2`), Eintrag in `benutzer` aktiv und nicht gelöscht.
- `app.ist_admin()`: `ist_benutzer()` und `benutzer.admin`.
- `app.darf_konditionen()`: `ist_benutzer()` und `benutzer.konditionen`.

| Wer | Darf |
|---|---|
| nicht angemeldet (`anon`) | nichts. Zusätzlich sind alle Tabellenrechte für `anon` entzogen. |
| angemeldet ohne MFA | nichts (wie `anon`) |
| Benutzer | alle Fachdaten lesen, anlegen, ändern, per `loeschen()` löschen |
| nur Admin | Benutzer anlegen, ändern, deaktivieren; Abwesenheiten genehmigen und ablehnen; „Direkt genehmigen“ beim Eintragen |
| nur Recht „Konditionen“ | `kunde_kondition`, `lieferant_kondition` lesen und ändern (alle anderen sehen diese Tabellen leer, auch über Joins) |
| jeder für sich selbst | eigene `benutzer_einstellung` (Farbschema, Seitenleiste, Dashboard-Ansicht) |

Sonderregeln per Trigger (RLS kann Spaltenänderungen nicht prüfen):

- **Abwesenheit:** neue Anträge sind `beantragt`, Krankmeldungen sofort `genehmigt`. Den Status auf `genehmigt` oder
  `abgelehnt` setzen (auch beim Anlegen) darf nur ein Admin; `entschieden_von` und `entschieden_am` setzt der Trigger.
- **Benutzer:** mindestens ein aktiver Admin muss bleiben.
- **Belege:** fertiggestellte Belege sind gesperrt (Ausnahmen Angebot bis zur AB, AB bis zum ersten Folgebeleg;
  Tags und interner Kommentar bleiben änderbar). Rechnungen und Gutschriften mit Lexware-ID sind endgültig.

## Tabellen

### Benutzer und Team

| Tabelle | Inhalt |
|---|---|
| `benutzer` | `id` = `auth.users.id`, Name, E-Mail, `mitarbeiter_id`, `admin`, `konditionen`, `aktiv`, `dashboard_start` (gf/montage/einkauf) |
| `benutzer_einstellung` | je Benutzer: Farbschema (hell/dunkel/system), Seitenleiste hell/eingeklappt, gemerkte Ansichten (Liste/Board) |
| `mitarbeiter` | Kürzel (eindeutig), Name, Rolle, Telefon, `ist_monteur`, `aktiv`, Reihenfolge in der Plantafel |
| `kolonne` | Name, Stammfahrzeug, Reihenfolge |
| `kolonne_mitglied` | Kolonne, Mitarbeiter (nur Monteure), Reihenfolge; ein Monteur kann in mehreren Kolonnen sein |
| `ressource` | weitere Zeilen der Plantafel (Selbstabholer, Lager …), Notiz, Reihenfolge |
| `fahrzeug` | Kennzeichen, Typ, Kolonne, km-Stand, Hinweise, TÜV/HU, Service, UVV |
| `fahrzeug_werkstatt` | Fahrzeug, von, bis, Notiz |
| `abwesenheit` | Mitarbeiter, Art (urlaub, krank, schulung, ueberstunden, sonstiges), von, bis, Status (beantragt, genehmigt, abgelehnt), Notiz, entschieden von/am |
| `zeitbuchung` | Mitarbeiter, Auftrag **oder** Ticket **oder** ohne Bezug, Datum, Beginn, Ende (`ende > beginn`), Pause (min), Art (montage, aufmass, service, lager, fahrt, buero), Tätigkeit, Freigabe (offen/freigegeben) |

### Stammdaten und Einstellungen

| Tabelle | Inhalt |
|---|---|
| `einstellung` | genau eine Zeile: Firmendaten für Belege, Arbeitszeit von/bis, Bundesland, Urlaubsanspruch, Gültigkeit Angebot (Tage) |
| `belegart_einstellung` | je Belegart: interne Kopie (BCC), Standard-PDF-Gruppen für den Versand |
| `nummernkreis` | je Belegart bzw. Ticket/Anfrage/Kunde/Bestellung: Präfix, Ziffer, Jahr, letzte Nummer. Vergabe nur über `app.naechste_nummer(art)` mit Zeilensperre (transaktionssicher, kein `max()+1`, Jahreswechsel und Startwerte aus Airtable einstellbar) |
| `artikel` | Bezeichnung, Einheit, Preis netto, Beschreibung (bereinigtes HTML), Schnellauswahl |
| `textvorlage` | Feld (einleitung, lieferbedingungen, nachbemerkung), Belegarten, Name, Text, Standard |
| `zahlungsbedingung` | Name, Text mit Platzhaltern, Zahlungsziel, Skontoziel, Skonto %, Belegarten, Standard je Belegart |
| `kunde` | Kundennummer, Name, Typ (privat/firma), Bauleister § 13b, Ansprechpartner, Herkunft, Rechnungsadresse, Telefon, E-Mail, Notiz, Lexware-Kontakt-ID, an Lexware seit |
| `kunde_lieferadresse` | Kunde, Bezeichnung, Straße, PLZ, Ort, `alt_seit` |
| `kunde_speichern()` | Funktion: Kunde mit Lieferadressen in einer Transaktion anlegen oder ändern (RLS gilt, Audit mit Benutzer). Gespeicherte Lieferadressen werden nie gelöscht, nur „Alt“. Die Lexware-Felder setzt nur der Server; einen Kunden mit Anfragen, Aufträgen, Belegen oder Tickets lehnt das Löschen mit Begründung ab. |
| `kunde_kondition` | Kunde, Freitext (eigene RLS, nur Recht „Konditionen“) |
| `lieferant` | Firma, Produktgruppen, Konfigurator-Link, Händlerportal, unsere Kundennummer, Lieferzeit, Telefon, Notiz |
| `lieferant_kontakt` | Lieferant, Name, Funktion, Handy, Telefon, E-Mail |
| `lieferant_kondition` | Lieferant, Freitext (eigene RLS, nur Recht „Konditionen“) |

### Anfragen, Aufträge, Service

| Tabelle | Inhalt |
|---|---|
| `anfrage` | Nummer, Kurzbezeichnung, Kunde (optional) oder Name/Telefon/E-Mail, Objekt, Beschreibung, Herkunft, Produkte, geschätzter Wert, Zuständig, Wiedervorlage, Aufmaß-Termin, interne Notiz, Status (neu, in_klaerung, aufmass, angebot_erstellen, angebot_versendet), Archiv (gewonnen/verloren) mit Grund, `nachtrag_zu` (Auftrag), entstandener Auftrag |
| `anfrage_auftrag_anlegen()` | Funktion (Übergang bis zum Beleg-Modul): Auftrag aus einer Anfrage, Nummer aus dem AB-Nummernkreis, Anfrage wird „gewonnen“; nur einmal je Anfrage. Ein Aufmaß-Termin stellt eine neue Anfrage auf „Aufmaß“. Kunde ist Pflicht, „Zuständig“ ist ein Benutzer. |
| `auftrag` | Nummer = AB-Nummer (eindeutig), Kunde, Anfrage, `nachtrag_zu`, Titel, Objekt, Phase (bestellung, montage, abnahme, baustelle_fertig, reklamation, abgeschlossen), Montagestatus, Herkunft, Zuständig, Produkte, Bemerkung, Liefertermin, „Noch nicht bestellt“, `warten_auf_kunde`, `stufe_datum` je Stufe (Lieferung, Abschlag bezahlt, Warten auf Kunde), Prüfhinweis, OneDrive-Ordner, `abgeschlossen_am` (folgt der Phase). Löschen nur ohne Belege, Einsätze, Bestellzeilen, Zeitbuchungen, Service-Tickets und Nachträge; Bestellstatus, Montagetermin und Rechnungsstand werden abgeleitet |
| `service_ticket` | Nummer `ST-JJ-NNNN`, Kunde, Ursprungsauftrag, Thema, Art, Abrechnung (garantie, kulanz, kostenpflichtig), Priorität, Problem, Wunschtermin, `vorab_datum`, Zuständig, Objekt, Status (neu, eingeplant, in_arbeit, erledigt, abgerechnet) |

Bestellstatus, Liefer-KW, AB-Status und Pipeline-Stufe werden **abgeleitet**, nicht gespeichert (später als Views).

### Belege

| Tabelle | Inhalt |
|---|---|
| `beleg` | Art (angebot, auftragsbestaetigung, teil_ab, lieferschein, zahlungsbestaetigung, rechnung, abschlagsrechnung, gutschrift), Nummer (eindeutig, bei Entwürfen leer außer Angebot), Status, `kette_id`, `vorgaenger_id`, Bezug (Anfrage/Auftrag/Ticket), Kunde, Empfängeradresse (Name, Zusatz, Straße, PLZ, Ort, Land), Kundennummer, Datum, Titel, Bauvorhaben, Objekt, Einleitung, Lieferbedingungen, Nachbemerkung, Zahlungsbedingung (Kopie: Text, Ziel, Skonto, Skontoziel), Steuerart (standard, bauleistung_13b, steuerfrei), Preise brutto/netto, Gesamtrabatt, Gültig bis, Liefer-/Leistungsdatum bzw. -zeitraum, Teil-/Schlussrechnung, Abzug, Summen netto/brutto, offener Betrag, fällig am, aktuelle und eingefrorene Version, Tags, interner Kommentar, Lexware-ID und -Status, PDF-Pfad, fertiggestellt von/am |
| `beleg_position` | Beleg, Reihenfolge, Typ (artikel, text), Titel, Beschreibung (bereinigtes HTML), optional, Menge, Einheit, Einzelpreis netto, Rabatt %, Steuersatz, Artikel |
| `beleg_version` | Beleg, Versionsnummer, Kopie aller Druckfelder und Positionen (JSON), PDF-Pfad, eingefroren von/am |
| `beleg_versand` | Versandprotokoll: Beleg, Version, Kanal (email, uebergeben), Empfänger, BCC, Betreff, Text, PDFs mit Inhalt, wer/wann |
| `beleg_versand_gruppe` | Beleg, Reihenfolge, Dateiname (PDF-Gruppen) |
| `beleg_anhang` | Gruppe, Quelle (beleg, onedrive, upload, vorlage), Verweis, Reihenfolge |
| `zahlung` | Beleg, Datum, Betrag, Zahlungsart, Quelle (app/lexware), `lex_abgleich` (offen/abgeglichen), Lexware-ID, Zahlungsbestätigung |

Regeln: Bezug „genau einer“; nur ein **Entwurf** darf noch ganz ohne Bezug sein (freie AB, Gutschrift vor der
Wahl der Rechnung). Höchstens eine Zahlungsbestätigung je Zahlung. Höchstens eine Schlussrechnung je Auftrag.

### Planung, Arbeit, Kommunikation

| Tabelle | Inhalt |
|---|---|
| `einsatz` | Auftrag **oder** Ticket, Beginn, Ende (`ende > beginn`), Fahrzeug, Ressource, `fest` (freigegeben), Farbe (Paletten-Token `plan-1` … `plan-10` oder `#RRGGBB`, geprüft) |
| `einsatz_monteur` | Einsatz, Mitarbeiter (mehrere Monteure je Einsatz) |
| `aufgabe` | Titel, Zuständig (Benutzer), fällig, Priorität, Status (offen, in_arbeit, wartet_zulieferer, wartet_kunde, erledigt), erledigt am (Trigger), Notiz, optional Kunde, Anfrage, Auftrag oder Ticket (höchstens einer) |
| `termin` | Titel, Art (beratung, intern), Datum, Beginn, Ende, optional Kunde/Anfrage/Auftrag, Ort, Notiz |
| `termin_mitarbeiter` | Termin, Mitarbeiter |
| `formular` | Typ (aufmass, montageprotokoll, servicebericht, uebergabeprotokoll), Anfrage (nur Aufmaß), Auftrag oder Ticket, Datum, Status, Hinweise, PDF- und Scan-Pfad |
| `aufmass_zeile` | Formular, Raum, Element, Breite/Höhe mm, Anzahl, Anschlag, Bemerkung |
| `chat_nachricht` | Auftrag oder Ticket, Autor, Text, Foto-Pfad, erwähnte Benutzer |
| `chat_gelesen` | Nachricht, Benutzer, gelesen am |
| `historie_notiz` | Telefonat oder Notiz von Hand zu Anfrage, Auftrag, Ticket oder Kunde (Ereignisse kommen aus dem Audit-Log) |
| `benachrichtigung` | Glocke: Benutzer, Art, Text, Link, gelesen am (Erwähnungen, Genehmigungen; andere Hinweise werden berechnet) |
| `bestellung` | Nummer, Lieferant, Bestelldatum, AB-Nummer des Lieferanten, Liefer-KW, Status (bestellt, bestaetigt) |
| `bestellzeile` | Bestellung, Auftrag, Artikeltext, Menge, geliefert |

### Audit

| Tabelle | Inhalt |
|---|---|
| `audit.log` | Zeitpunkt, Benutzer, Rolle, Tabelle, Datensatz, Aktion (insert, update, soft_delete, delete), vorher, nachher, geänderte Spalten. Nicht über die API erreichbar; gelesen wird über `public.historie(tabelle, id)` (nur Benutzer, Konditionen-Tabellen nur mit Recht). |

## Migrationen (`supabase/migrations`)

1. `…_grundlagen.sql`: Schemas `app` und `audit`, Hilfsfunktionen, Trigger für Zeitstempel und Audit, `loeschen()`, Nummernkreise
2. `…_team.sql`: Benutzer, Mitarbeiter, Kolonnen, Ressourcen, Fahrzeuge, Abwesenheiten
3. `…_stammdaten.sql`: Einstellungen, Artikel, Vorlagen, Zahlungsbedingungen, Kunden, Lieferanten, Konditionen
4. `…_anfragen_auftraege.sql`: Anfragen, Aufträge, Service-Tickets
5. `…_belege.sql`: Belege, Positionen, Versionen, Versand, Zahlungen
6. `…_planung_arbeit.sql`: Einsätze, Zeiten, Aufgaben, Termine, Formulare, Chat, Notizen, Benachrichtigungen, Einkauf
7. `…_rls.sql`: RLS und Policies für alle Tabellen, Rechte für `anon` entzogen, Prüfung am Ende: bricht ab, wenn
   eine Tabelle in `public` ohne RLS ist

Danach: Supabase Advisors (Security und Performance) ohne Warnung.

## Tests (`tests/rls`, `npm run test:rls`)

Laufen gegen Staging über die echte API (supabase-js), mit zwei Testbenutzern samt MFA (TOTP), die der Test anlegt
und danach wieder entfernt:

1. **Nicht angemeldet:** Für jede Tabelle der API (Liste aus der OpenAPI-Beschreibung, damit neue Tabellen automatisch
   mitgeprüft werden) liefert Lesen keine Zeile, obwohl vorher Testdaten angelegt wurden. Schreiben schlägt fehl.
2. **Angemeldet ohne MFA:** sieht ebenfalls nichts.
3. **Benutzer:** legt eine Abwesenheit an (wird `beantragt`), kann sie nicht genehmigen oder ablehnen, kann keine
   genehmigte anlegen; eine Krankmeldung ist sofort genehmigt; kann keinen Benutzer anlegen oder zum Admin machen.
4. **Admin:** kann genehmigen und ablehnen; `entschieden_von` ist der Admin.
5. **Soft Delete und Audit:** `DELETE` wird abgelehnt, `loeschen()` blendet die Zeile aus, das Audit-Log enthält
   Benutzer und Zeitpunkt jeder Änderung.
6. **Konditionen:** ohne Recht leer, mit Recht lesbar.
7. **Aufträge:** nur die Phasen aus CLAUDE.md, `abgeschlossen_am` folgt der Phase, Nummer unveränderlich, Löschen mit
   Belegen oder Einsätzen gesperrt, ein leerer Auftrag wird nur markiert.

## Nicht in diesem Schritt

Storage-Buckets (Scans, Fotos), Volltextsuche, Views für abgeleitete Status, Lexware-Synchronisation, Realtime für
den Chat, Einladungs-Ablauf in der App. Diese kommen mit den jeweiligen Funktionen als eigene Migrationen.
