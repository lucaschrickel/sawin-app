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
| `benutzer_einstellung` | je Benutzer: Farbschema (hell/dunkel/system), Seitenleiste hell/eingeklappt, gemerkte Ansichten (Liste/Board je Seite, `ansichten.dashboard` = zuletzt gewählte Dashboard-Ansicht; ohne Wahl gilt `benutzer.dashboard_start`) |
| `mitarbeiter` | Kürzel (eindeutig), Name, Rolle, Telefon, `ist_monteur`, `aktiv`, Reihenfolge in der Plantafel, eigener Urlaubsanspruch (leer = Standard). Löschen nur ohne Einsätze, Zeiten, Abwesenheiten, Kolonne und Benutzerkonto, sonst deaktivieren |
| `kolonne` | Name, Stammfahrzeug, Reihenfolge |
| `kolonne_mitglied` | Kolonne, Mitarbeiter (nur Monteure), Reihenfolge; ein Monteur kann in mehreren Kolonnen sein |
| `ressource` | weitere Zeilen der Plantafel (Selbstabholer, Lager …), Notiz, Reihenfolge |
| `fahrzeug` | Kennzeichen, Typ, Kolonne, km-Stand, Hinweise, TÜV/HU, Service, UVV. Löschen nur ohne künftige Einsätze |
| `fahrzeug_werkstatt` | Fahrzeug, von, bis, Notiz |
| `abwesenheit` | Mitarbeiter, Art (urlaub, krank, schulung, ueberstunden, sonstiges), von, bis, Status (beantragt, genehmigt, abgelehnt), Notiz, entschieden von/am. Entschiedene Abwesenheiten (außer Krankmeldungen) löscht nur ein Admin (Trigger `abwesenheit_loeschen_pruefen`) |
| `zeitbuchung` | Mitarbeiter, Auftrag **oder** Ticket **oder** ohne Bezug, Datum, Beginn, Ende (`ende > beginn`), Pause (min), Art (montage, aufmass, service, lager, fahrt, buero), Tätigkeit, Freigabe (offen/freigegeben). Montage, Aufmaß und Service brauchen einen Auftrag oder ein Ticket; freigegebene Buchungen sind gesperrt (Trigger `zeitbuchung_regeln`) |

### Stammdaten und Einstellungen

| Tabelle | Inhalt |
|---|---|
| `einstellung` | genau eine Zeile: Firmendaten für Belege, Arbeitszeit von/bis, Bundesland, Urlaubsanspruch, Gültigkeit Angebot (Tage) |
| `belegart_einstellung` | je Belegart: interne Kopie (BCC), Standard-PDF-Gruppen für den Versand |
| `nummernkreis` | je Belegart bzw. Ticket/Anfrage/Kunde/Bestellung: Präfix, Ziffer, Jahr, letzte Nummer. Vergabe nur über `app.naechste_nummer(art)` mit Zeilensperre (transaktionssicher, kein `max()+1`, Jahreswechsel und Startwerte aus Airtable einstellbar) |
| `artikel` | Bezeichnung, Einheit, Preis netto, Beschreibung (bereinigtes HTML), Schnellauswahl |
| `textvorlage` | Feld (einleitung, lieferbedingungen, nachbemerkung), Belegarten, Name, Text, Standard |
| `zahlungsbedingung` | Name, Text mit Platzhaltern, Zahlungsziel, Skontoziel, Skonto %, Belegarten, Standard je Belegart |
| `kunde` | Kundennummer, Name, Typ (privat/firma), Bauleister § 13b, Ansprechpartner, Herkunft, Rechnungsadresse, Telefon, E-Mail, Notiz, Lexware-Kontakt-ID, an Lexware seit, Prüfsumme der übertragenen Kontaktdaten (`lexware_hash`, Änderungen nur App → Lexware) |
| `kunde_lieferadresse` | Kunde, Bezeichnung, Straße, PLZ, Ort, `alt_seit` |
| `kunde_speichern()` | Funktion: Kunde mit Lieferadressen in einer Transaktion anlegen oder ändern (RLS gilt, Audit mit Benutzer). Gespeicherte Lieferadressen werden nie gelöscht, nur „Alt“. Die Lexware-Felder setzt nur der Server; einen Kunden mit Anfragen, Aufträgen, Belegen oder Tickets lehnt das Löschen mit Begründung ab. |
| `kunde_kondition` | Kunde, Freitext (eigene RLS, nur Recht „Konditionen“) |
| `lieferant` | Firma, Produktgruppen, Konfigurator-Link, Händlerportal, unsere Kundennummer, Lieferzeit, Telefon, Notiz |
| `lieferant_kontakt` | Lieferant, Name, Funktion, Handy, Telefon, E-Mail. Lieferant und Ansprechpartner speichert `lieferant_speichern(id, lieferant, kontakte)` in einem Schritt; entfernte Ansprechpartner nur markiert. Ein Lieferant mit offener Bestellung ist nicht löschbar |
| `lieferant_kondition` | Lieferant, Freitext (eigene RLS, nur Recht „Konditionen“) |

### Anfragen, Aufträge, Service

| Tabelle | Inhalt |
|---|---|
| `anfrage` | Nummer, Kurzbezeichnung, Kunde (optional) oder Name/Telefon/E-Mail, Objekt, Beschreibung, Herkunft, Produkte, geschätzter Wert, Zuständig, Wiedervorlage, Aufmaß-Termin, interne Notiz, Status (neu, in_klaerung, aufmass, angebot_erstellen, angebot_versendet), Archiv (gewonnen/verloren) mit Grund, `nachtrag_zu` (Auftrag), entstandener Auftrag |
| `anfrage` (Regeln) | Ein Aufmaß-Termin stellt eine neue Anfrage auf „Aufmaß“. Kunde ist Pflicht, „Zuständig“ ist ein Benutzer. Gewonnen wird die Anfrage mit dem Fertigstellen der AB (`beleg_fertigstellen`); die frühere Übergangsfunktion `anfrage_auftrag_anlegen()` ist entfernt (Migration `…_belege_modul.sql`). |
| `auftrag` | Nummer = AB-Nummer (eindeutig), Kunde, Anfrage, `nachtrag_zu`, Titel, Objekt, Phase (bestellung, montage, abnahme, baustelle_fertig, reklamation, abgeschlossen), Montagestatus, Herkunft, Zuständig, Produkte, Bemerkung, Liefertermin, „Noch nicht bestellt“, `warten_auf_kunde`, `stufe_datum` je Stufe (Lieferung, Abschlag bezahlt, Warten auf Kunde), Prüfhinweis, OneDrive-Ordner, `abgeschlossen_am` (folgt der Phase). Löschen nur ohne Belege, Einsätze, Bestellzeilen, Zeitbuchungen, Service-Tickets und Nachträge; Bestellstatus, Montagetermin und Rechnungsstand werden abgeleitet |
| `service_ticket` | Nummer `ST-JJ-NNNN`, Kunde, Ursprungsauftrag, Thema, Art, Abrechnung (garantie, kulanz, kostenpflichtig), Priorität, Problem, Wunschtermin, `vorab_datum`, Zuständig, Objekt, Status (neu, eingeplant, in_arbeit, erledigt, abgerechnet). Trigger: `vorab_datum` (Tag in „Terminierbar“) beim Anlegen und bei geändertem Wunschtermin ohne Einsatz; Status „Eingeplant“ mit dem ersten Einsatz, ohne Einsatz zurück auf „Neu“; „Abgerechnet“ nicht von Hand; Löschen nur ohne Einsätze, Zeiten und Belege |

Bestellstatus, Liefer-KW, AB-Status und Pipeline-Stufe werden **abgeleitet**, nicht gespeichert (später als Views).

### Belege

| Tabelle | Inhalt |
|---|---|
| `beleg` | Art (angebot, auftragsbestaetigung, teil_ab, lieferschein, zahlungsbestaetigung, rechnung, abschlagsrechnung, gutschrift), Nummer (eindeutig, bei Entwürfen leer außer Angebot), Status, `kette_id`, `vorgaenger_id`, Bezug (Anfrage/Auftrag/Ticket), Kunde, Empfängeradresse (Name, Zusatz, Straße, PLZ, Ort, Land), Kundennummer, Datum, Titel, Bauvorhaben, Objekt, Einleitung, Lieferbedingungen, Nachbemerkung, Zahlungsbedingung (Kopie: Text, Ziel, Skonto, Skontoziel), Steuerart (standard, bauleistung_13b, steuerfrei), Preise brutto/netto, Gesamtrabatt, Gültig bis, Liefer-/Leistungsdatum bzw. -zeitraum, Teil-/Schlussrechnung, Abzug, Summen netto/brutto, offener Betrag, fällig am, aktuelle und eingefrorene Version, Tags, interner Kommentar, Lexware-ID und -Status (uebertragung, fehler, pdf_fehlt, fertig) mit letzter Fehlermeldung und Zeitpunkt des Versuchs, Abschlag: Nummer am Auftrag (`abschlag_nr`) und Eingabe (Prozent oder Betrag), Beträge je Steuersatz laut Lexware (`steuern`), PDF-Pfad, fertiggestellt von/am |
| `beleg_position` | Beleg, Reihenfolge, Typ (artikel, text), Titel, Beschreibung (bereinigtes HTML), optional, Menge, Einheit, Einzelpreis netto, Rabatt %, Steuersatz, Artikel |
| `beleg_version` | Beleg, Versionsnummer, Kopie aller Druckfelder und Positionen (JSON), PDF-Pfad, eingefroren von/am |
| `beleg_versand` | Versandprotokoll: Beleg, Version, Kanal (email, uebergeben), Empfänger, BCC, Betreff, Text, PDFs mit Inhalt, wer/wann |
| `beleg_versand_gruppe` | Beleg, Reihenfolge, Dateiname (PDF-Gruppen) |
| `beleg_anhang` | Gruppe, Quelle (beleg, onedrive, upload, vorlage), Verweis, Reihenfolge |
| `zahlung` | Beleg, Datum, Betrag, Zahlungsart, Quelle (app/lexware), `lex_abgleich` (offen/abgeglichen), Lexware-ID, Zahlungsbestätigung |
| `zahlung_erfassen()` | Funktion „Als bezahlt markieren“: App-Buchung (Quelle app, „in Lexware noch buchen“), Teilzahlung möglich, Betrag höchstens offen, Datum bis heute; optional mit Zahlungsbestätigung |
| `zahlungsbestaetigung_erstellen()` | Funktion: Zahlungsbestätigung (App-Beleg, Nummer ZB…, fertiggestellt, Vorgänger = Rechnung bzw. Abschlag, Betrag = Zahlung, `offen_betrag` = Restbetrag zum Zeitpunkt der Bestätigung); höchstens eine je Zahlung |
| Zahlungsstand | `beleg.lexware_offen` = offener Betrag laut Lexware; `offen_betrag` = `lexware_offen` − nicht abgeglichene App-Buchungen; 0 → Status „bezahlt“ (Trigger auf `zahlung`). Offener Betrag und Status ändern nur die Zahlungsfunktionen bzw. der Server. Zahlungen ändert kein Benutzer; eigene, nicht abgeglichene ohne Bestätigung lassen sich als gelöscht markieren. Bezahlt und alles erledigt → Auftrag in Abnahme/Baustelle fertig wird „abgeschlossen“. |
| `lexware_zahlungen()`, `lexware_abgleich_beginnen()` | Server (Service-Rolle): Zahlungsstand eines Belegs aus Lexware übernehmen (Geldeingänge als Zahlung, passende App-Buchung wird abgeglichen statt doppelt gezählt; Gutschriften nur offener Betrag und Status); Abgleich beim Öffnen höchstens alle 5 Minuten (`einstellung.lexware_zahlung_abgleich_am`), der Cron erzwingt ihn |
| `lexware_ereignis` | Eingangsprotokoll des Lexware-Webhooks: Schlüssel (SHA-256 aus Organisation, Ereignis, Ressource, Zeitpunkt; Lexware liefert keine Ereignis-ID), Ereignis, Ressource, Status (neu, verarbeitet, ignoriert, fehler), Fehlertext, Versuche, Zeitpunkte. Technisches Protokoll ohne Audit-Trigger; schreiben nur `lexware_ereignis_eingang()` (idempotent: Doppelzustellung wird nur gezählt, nach Fehler erneut verarbeitet) und `lexware_ereignis_ende()` (Service-Rolle), lesen nur Admins. |
| Formatierte Texte | `beleg_position.beschreibung_html` und `artikel.beschreibung_html`: bereinigtes HTML (Whitelist b, strong, i, em, u, ul, ol, li, p, br, span mit color bzw. font-weight), bereinigt vom Server vor dem Speichern (`src/lib/html.ts`) |
| `beleg_position.abzug_beleg_id` | Schlussrechnung: Minusposition für den Abzug dieses Abschlags bzw. dieser Teilrechnung (vom Server gesetzt, nur fertige Abschläge und Teilrechnungen desselben Auftrags) |
| Teil-AB und Teilrechnung | Teil-AB nur aus einer fertigen AB, Liefertermin Pflicht, Nummer `<AB>-01`; `beleg_fertigstellen` setzt den Liefertermin des Auftrags. Eine Rechnung aus einer Teil-AB bzw. deren Lieferschein ist Teilrechnung (`teil`, setzt nur `beleg_speichern`), ohne Abzug; `lexware_start` verlangt in der Schlussrechnung den Abzug aller Abschläge und Teilrechnungen. |
| `lexware_start()`, `lexware_fehler()`, `lexware_fertig()`, `lexware_pdf()`, `lexware_kunde()` | Funktionen nur für den Server (Service-Rolle): Übertragung beginnen (Regeln prüfen, gegen doppelte Übertragung sperren, Abschlagsnummer vergeben), Fehler speichern, Ergebnis von Lexware übernehmen (Nummer, Status „offen“, Beträge, Fälligkeit, PDF; Ticket-Rechnung setzt das Ticket auf „abgerechnet“), PDF nachtragen, Kontakt-ID am Kunden speichern. Der handelnde Benutzer wird mitgegeben (`app.handelnder()` für Zeitstempel und Audit-Log). |
| `beleg_speichern()` | Funktion: Kopf und Positionen in einem Schritt (fehlende Positionen nur markiert). Auch Entwürfe von Rechnung (Auftrag oder Ticket), Abschlag (Auftrag) und Gutschrift (nur aus einer Rechnung bzw. einem Abschlag in Lexware). Neues Angebot ohne Bezug legt im Hintergrund eine Anfrage an („Angebot erstellen“). Folgebelege und fertiggestellte Belege behalten ihren Bezug. Bearbeiten eines fertiggestellten Angebots bzw. einer AB: Datum auf heute (Gültig bis wandert mit), Version n+1, wenn die aktuelle eingefroren ist; die Nummer bleibt. |
| `beleg_fertigstellen()` | Funktion für App-Belege (Angebot → offen, Anfrage „Angebot versendet“; Lieferschein → fertiggestellt, braucht einen Auftrag; AB → legt den Auftrag mit der AB-Nummer an bzw. übernimmt die Nummer eines bestehenden Auftrags ohne AB, hängt die Kette auf den Auftrag um, Angebot „angenommen“, offene andere Varianten „nicht beauftragt“, deren Entwürfe verworfen, Anfrage „gewonnen“). |
| `beleg_uebergeben()` | Funktion „Als übergeben markieren“: friert die aktuelle Version (Kopf und Positionen als JSON, PDF-Pfad) in `beleg_version` ein und protokolliert die Übergabe in `beleg_versand` |
| Regeln am Beleg | Neue Belege sind immer Entwurf; Status wechselt nur über `beleg_fertigstellen` bzw. beim Angebot offen ↔ angenommen/abgelehnt (zurück nur ohne AB); „nicht beauftragt“ nur durch die AB einer anderen Variante. Version, Fertigstellung, Lexware-Felder, Abschlagsnummer und Steuerbeträge setzen nur die Funktionen bzw. der Server; Rechnung, Abschlag und Gutschrift werden nur über Lexware fertig, ein Entwurf in Übertragung lässt sich weder ändern noch verwerfen. Aufträge entstehen nur beim Fertigstellen der AB; die Auftragsnummer ändert sich nie. Ein Auftrag hat höchstens eine fertiggestellte AB. |
| Speicher `belege` | privater Storage-Bucket für Beleg-PDFs (nur PDF, max. 10 MB), Pfad `<beleg_id>/<Nummer>[_V<n>]_<Belegart>.pdf`; lesen, anlegen und ersetzen nur angemeldete Benutzer, Löschen gesperrt. Die Ablage in OneDrive folgt mit dem OneDrive-Modul. |

Regeln: Bezug „genau einer“; nur ein **Entwurf** darf noch ganz ohne Bezug sein (freie AB, Gutschrift vor der
Wahl der Rechnung). Höchstens eine Zahlungsbestätigung je Zahlung. Höchstens eine Schlussrechnung je Auftrag.

### Planung, Arbeit, Kommunikation

| Tabelle | Inhalt |
|---|---|
| `einsatz` | Auftrag **oder** Ticket, Beginn, Ende (`ende > beginn`), Fahrzeug, Ressource, `fest` (freigegeben), Farbe (Paletten-Token `plan-1` … `plan-10` oder `#RRGGBB`, geprüft) |
| `einsatz_monteur` | Einsatz, Mitarbeiter (mehrere Monteure je Einsatz) |
| `ablage_ordner`, `ablage_datei` | OneDrive-Ablage: Ordner je Anfrage (ab dem ersten Angebot), derselbe Ordner für den Auftrag (`auftrag_id` kommt mit der AB dazu), Tickets eigene Ordner; Drive-ID, Item-ID, Web-Adresse, Unterordner (Name → Item-ID), Status (wartet, angelegt, fehler). Dateien mit Unterordner, Quelle (beleg, upload, formular), Beleg und Version, Status (upload, wartet, abgelegt, fehler), Pfad im Zwischenspeicher `ablage-puffer`, Versuche, Fehler. Lesen alle Benutzer, schreiben nur der Server über `ablage_ordner_setzen()` / `ablage_datei_setzen()` (Service-Rolle, handelnder Benutzer im Audit-Log). |
| `ms_token` | Verschlüsseltes Zugriffstoken für Microsoft Graph (AES-256-GCM, Schlüssel nur in `MS_TOKEN_SCHLUESSEL`); RLS ohne Policy, nur Service-Rolle. |
| `beleg_versenden()` | Vorläufiger Versand (Version 1): prüft Empfänger und interne Kopie, verlangt bei Rechnung, Abschlag und Gutschrift das Lexware-PDF, friert bei Angebot und AB die Version ein und protokolliert in `beleg_versand` (Kanal `email`, Empfänger, BCC, Betreff, Text, Dateiname). |
| `suche()` | Globale Suche (SECURITY INVOKER, RLS gilt): Kunden (auch Lieferadressen), Anfragen, Aufträge, Belege (auch Positionen, Tags, Kommentar), Service-Tickets; je Bereich höchstens n Treffer, mit Fundstelle. Konditionen werden nie durchsucht. |
| `einsatz_freigeben()`, `kolonne_speichern()`, `kolonne_monteur()`, `kolonne_loeschen()`, `ressource_loeschen()` | Funktionen (SECURITY INVOKER) der Plantafel: vorgeplante Einsätze gesammelt freigeben (gibt die Anzahl zurück); Kolonne mit Stammfahrzeug und Mitgliedern in Reihenfolge speichern (nur Monteure, entfernte nur markiert); Monteur in eine andere Kolonne verschieben, in eine weitere duplizieren, entfernen oder sortieren; Kolonne samt Mitgliedschaften als gelöscht markieren (Einsätze behalten ihr Team); weitere Ressource nur ohne künftige Einsätze als gelöscht markieren. Reihenfolge der Gruppen in `einstellung.plantafel_gruppen` (`kolonne:<id>`, `solo`, `res`). |
| `einsatz_speichern()`, `einsatz_loeschen()`, `einsatz_konflikte()` | Funktionen (SECURITY INVOKER): Einsatz zu genau einem Auftrag oder Ticket samt Team, Fahrzeug, weiterer Ressource und Farbe (`plan-1` … `plan-10` oder `#RRGGBB`) in einem Schritt speichern (mindestens ein Monteur oder eine Ressource, nur Monteure, entfernte Monteure nur markiert), Einsatz samt Team als gelöscht markieren, Konflikte im Zeitraum (Monteur gleichzeitig in einem anderen Einsatz oder abwesend, beantragt oder genehmigt; Werkstatttermin des Fahrzeugs ohne Mitarbeiter-Bezug). Feiertage prüft die App selbst (`src/lib/feiertage.ts`). Die Arbeitszeit in `einstellung` ist auf volle Stunden beschränkt (Stundenraster der Plantafel). |
| `aufgabe` | Titel, Zuständig (Benutzer), fällig, Priorität, Status (offen, in_arbeit, wartet_zulieferer, wartet_kunde, erledigt), erledigt am (Trigger), Notiz, optional Kunde, Anfrage, Auftrag oder Ticket (höchstens einer) |
| `termin` | Titel, Art (beratung, intern), Datum, Beginn, Ende, optional Kunde/Anfrage/Auftrag, Ort, Notiz. Speichern samt Mitarbeitern über `termin_speichern()`, Löschen über `termin_loeschen()` |
| `termin_mitarbeiter` | Termin, Mitarbeiter |
| `formular` | Typ (aufmass, montageprotokoll, servicebericht, uebergabeprotokoll), Anfrage (nur Aufmaß), Auftrag oder Ticket, Datum, Status, Hinweise, PDF- und Scan-Pfad |
| `aufmass_zeile` | Formular, Raum, Element, Breite/Höhe mm, Anzahl, Anschlag, Bemerkung |
| `chat_nachricht` | Auftrag oder Ticket, Autor, Text, Foto-Pfad, erwähnte Benutzer |
| `chat_gelesen` | Nachricht, Benutzer, gelesen am |
| `historie_notiz` | Telefonat oder Notiz von Hand zu Anfrage, Auftrag, Ticket oder Kunde (Ereignisse kommen aus dem Audit-Log) |
| `benachrichtigung` | Glocke: Benutzer, Art, Text, Link, gelesen am (Erwähnungen, Genehmigungen; andere Hinweise werden berechnet) |
| `bestellung` | Nummer `BE-JJ-NNN`, Lieferant, Bestelldatum, AB-Nummer des Lieferanten, Liefer-KW und -Jahr, Status (bestellt, bestaetigt), Notiz. Gespeichert über `bestellung_speichern(id, kopf, zeilen)` (mindestens eine Zeile); löschen über `bestellung_loeschen` nur ohne gelieferte Zeile (nur Markierung, Zeilen mit). „Teilweise geliefert“, „Geliefert“ und „Überfällig“ werden abgeleitet |
| `bestellzeile` | Bestellung, Auftrag (Pflicht, eine Bestellung kann mehrere Aufträge abdecken), Artikeltext, Menge, geliefert. Daraus abgeleitet: Bestellstatus des Auftrags (Offen … „Ware eingetroffen“) und Liefer-KW = früheste offene Zeile |

### Audit

| Tabelle | Inhalt |
|---|---|
| `audit.log` | Zeitpunkt, Benutzer, Rolle, Tabelle, Datensatz, Aktion (insert, update, soft_delete, delete), vorher, nachher, geänderte Spalten. Nicht über die API erreichbar; gelesen wird über `public.historie(tabelle, id)` (nur Benutzer, Konditionen-Tabellen nur mit Recht). |

## Migrationen (`supabase/migrations`)

1. `…_grundlagen.sql`: Schemas `app` und `audit`, Hilfsfunktionen, Trigger für Zeitstempel und Audit, `loeschen()`, Nummernkreise
2. `…_team.sql`: Benutzer, Mitarbeiter, Kolonnen, Ressourcen, Fahrzeuge, Abwesenheiten
3. `…_stammdaten.sql`: Einstellungen, Artikel, Vorlagen, Zahlungsbedingungen, Kunden, Lieferanten, Konditionen
4. `…_anfragen_auftraege.sql`: Anfragen, Aufträge, Service-Tickets
5. `…_belege.sql`: Belege, Positionen, Versionen, Versand, Zahlungen (Modul Belege Schritt 1: `20261111090000_belege_modul.sql` mit Speichern, Fertigstellen, Übergeben, Status-Regeln, Speicher `belege`; Korrekturen `…090100` und `…090200`; Schritt 2 Lexware: `20261112090000_lexware.sql`, Korrektur `…090100`; Zahlungen `20261113090000_zahlungen.sql` und `…090100`; Teil-AB `…090200_teil_ab.sql`; Webhook-Protokoll `20261114090000_lexware_ereignis.sql`, Korrektur Abgleichsbeginn `…090100`)
6. `…_planung_arbeit.sql`: Einsätze, Zeiten, Aufgaben, Termine, Formulare, Chat, Notizen, Benachrichtigungen, Einkauf
   (Plantafel fertig: `20261114090200_plantafel.sql` mit Ressource und Farbe am Einsatz, Sammelfreigabe, Kolonnen,
   Reihenfolge der Gruppen; OneDrive-Ablage `20261116090000_onedrive.sql`, `…090100` Upload-Status, `…090200` Verwerfen;
   Versand `20261115090000_versand_vorlaeufig.sql`, Suche `20261115090100_suche.sql`)
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
8. **Montageplan:** Einsatz mit zwei Monteuren anlegen, Konflikte (Abwesenheit, Überschneidung), Monteur tauschen
   (alter nur markiert), Ablehnung ohne Monteur, mit Ende vor Beginn oder mit Nicht-Monteur, Löschen als Markierung,
   Arbeitszeit nur in vollen Stunden.
9. **Mitarbeiter:** Kürzel eindeutig, Urlaubsanspruch 0 bis 366, mit Einsätzen oder Abwesenheiten nicht löschbar
   (nur deaktivierbar), ohne Geschichte nur als gelöscht markiert.
10. **Zeiterfassung:** Montage, Aufmaß und Service nur mit Auftrag, Lager, Fahrt und Büro auch ohne; Ende vor Beginn
    und zu lange Pause abgelehnt; Freigabe hält Benutzer und Zeitpunkt fest; freigegebene Buchungen gesperrt (auch
    gegen Löschen), bis die Freigabe zurückgenommen ist.
12. **Fahrzeuge und Termine:** Kennzeichen eindeutig, Werkstatttermin als Konflikt des ganzen Einsatzes, Einsatz braucht
    genau einen Bezug, Fahrzeug mit künftigem Einsatz nicht löschbar, Termin mit Mitarbeitern speichern, ändern und als
    gelöscht markieren.
13. **Service-Tickets:** Nummer `ST-JJ-NNNN`, Tag in „Terminierbar“, kein „Abgerechnet“ von Hand, Eingeplant/Neu nach
    Einsätzen, Zeit auf ein Ticket, Löschregel.
14. **Einkauf:** Lieferant samt Ansprechpartnern (entfernter nur markiert), Lieferanten-Konditionen nur mit Recht,
    Bestellung `BE-JJ-NNN` nur mit Zeilen und Auftrag, gelieferte Bestellung und Lieferant mit offener Bestellung nicht
    löschbar, Löschen nur als Markierung.
16. **Plantafel:** Kolonne speichern (Reihenfolge, nur Monteure, entfernte nur markiert), Monteur duplizieren, nicht
    doppelt, entfernen, Kolonne nur markiert; Einsatz mit Ressource ohne Monteur, Farbe nur Palette oder `#RRGGBB`;
    Ressource mit künftigem Einsatz nicht löschbar; Sammelfreigabe zählt nur vorgeplante.
15. **Lexware-Webhook:** Server-Funktionen für Benutzer und Admins gesperrt, Doppelzustellung erkannt, nach Fehler
    erneut verarbeitet, Protokoll nur für Admins lesbar.
11. **Abwesenheiten löschen:** eine entschiedene Abwesenheit löscht nur ein Admin (nur als Markierung), einen Antrag
    und eine Krankmeldung jeder Benutzer.

## Nicht in diesem Schritt

Storage-Buckets (Scans, Fotos), Volltextsuche, Views für abgeleitete Status, Lexware-Synchronisation, Realtime für
den Chat, Einladungs-Ablauf in der App. Diese kommen mit den jeweiligen Funktionen als eigene Migrationen.
