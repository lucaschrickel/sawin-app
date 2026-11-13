# Go-live – Produktion

Produktion: Supabase-Projekt **sawin-produktion** (Ref `zqjrxxrvhbrnhknkmpqh`, Frankfurt), Vercel-Projekt
`sawin-bauelemente-app` (Umgebung „Production“). Staging: `sawin-staging` (Ref `ufopfstnqhitiyvelhjn`), Vercel „Preview“.
Produktion startet mit allen Kunden aus Airtable (Stammdaten und Lieferadressen), ohne Anfragen, Aufträge und Belege.

## Stand der Vorbereitung (13.11.2026)

| Punkt | Stand |
|---|---|
| Datenbank | alle 54 Migrationen eingespielt; Schema identisch mit Staging (`npm run golive:schema`: Tabellen, Spalten, Policies, Trigger, Funktionen, Rechte, Buckets) |
| Advisors Produktion | Sicherheit und Performance ohne Warnung (nur INFO: Tabellen nur für den Server, ungenutzte Indizes der leeren Datenbank) |
| Nummernkreise | Angebot `AG1261000`, AB `AB2261000`, Lieferschein `LS1000`, neue Kunden ab `30000` |
| Einstellungen | Arbeitszeit 7–16 Uhr, Bundesland NI, OneDrive-Basisordner „2026“ vorbelegt (Verbindung am Go-live-Tag), Go-live-Datum 13.11.2026 |
| Auth-Konfiguration (`supabase/config.toml`) | noch nicht eingespielt: Das persönliche Supabase-Token hat keine Rechte für die Konfiguration des Produktionsprojekts (Dashboard oder Token mit Rechten, siehe unten) |
| Kundenimport | geschrieben (13.11.2026): 861 Kunden mit Lexware-Kontakt-ID und bisheriger Kundennummer (höchste 10874, `altbestand`), 143 Lieferadressen; keine Anfragen, Aufträge, Belege, Aufgaben, Ordner. Probelauf vorher: keine doppelten Nummern oder Kontakt-IDs, 17 Gruppen mit gleicher E-Mail, 9 mit gleichem Namen und gleicher PLZ (je eigener Lexware-Kontakt; Bericht in `berichte/`, nicht im Repository) |
| Erster Admin | Befehl vorbereitet, Luca führt ihn aus (Startpasswort verdeckt, Pflicht zum Ändern bei der ersten Anmeldung) |
| Go-live-Prüfung | gegen Produktion nur lesend ohne Lexware, nach dem Import: alle Startwerte ok (nächster Kunde 30000); mit Sawins Lexware wiederholen |

## Lexware am Go-live-Tag: LEXWARE_ALTBESTAND

**`LEXWARE_ALTBESTAND=aktiv` setzt Luca am Go-live-Tag selbst in Vercel „Production“.** Dann nutzt die App die übernommenen
Lexware-Kontakt-IDs der Kunden direkt: Rechnungen, Abschläge und Gutschriften gehen an den bestehenden Lexware-Kontakt.
**`ONEDRIVE_ALTBESTAND` bleibt aus** (Produktion startet ohne Aufträge, die übernommenen Ordner werden nicht gebraucht).

Ist der Schalter (noch) nicht gesetzt, entsteht trotzdem kein doppelter Kontakt: Die App sucht vor dem Anlegen in
Lexware nach dem Kunden (Kundennummer, E-Mail, Name, Adresse). Ein übernommener Kunde trägt seine Lexware-Kundennummer und
wird darüber eindeutig gefunden; Kontakte, die schon ein anderer App-Kunde nutzt, scheiden aus. Geprüft im Browser-Test
`npm run test:kontakte` (Fälle 4 und 5, Lexware-Testkonto).

## Befehle (Claude Code, über `scripts/prod.mjs`)

`scripts/prod.mjs` führt einen Befehl einmal gegen die Produktion aus: mit den Werten aus Abschnitt 2 von `.env.local`
(`…_PROD`), alle übrigen Zugänge (Lexware-Testkonto, Microsoft, Staging-Schlüssel) leer. Er nennt vorher die Projekt-Ref
und bricht ab, wenn API- und Datenbank-Adresse nicht zusammenpassen oder auf Staging zeigen.

```bash
node scripts/prod.mjs npm run db:push:dry                              # Migrationen anzeigen
node scripts/prod.mjs node scripts/supabase-db.mjs db push --yes        # Migrationen einspielen
npm run golive:schema                                                   # Schema Staging ↔ Produktion (nur lesend)
node scripts/prod.mjs node scripts/airtable-import.mjs --nur-kunden     # Probelauf Kundenimport (nichts geschrieben)
node scripts/prod.mjs node scripts/airtable-import.mjs --nur-kunden --schreiben --projekt=zqjrxxrvhbrnhknkmpqh
node scripts/prod.mjs npm run golive:pruefen                            # Nummernkreise, mit LEXWARE_API_KEY_PROD auch Lexware (nur GET)
node scripts/prod.mjs node scripts/benutzer-anlegen.mjs --email=<adresse> --name="<Vorname Nachname>" --admin
npm run golive:vercel                                                   # Produktionsadresse: fra1, CSP, no-store, Supabase = Produktion
```

Befehle für Luca im eigenen Terminal (Werte erscheinen nur dort):

```bash
npm run golive:geheimnisse        # neue CRON_SECRET und MS_TOKEN_SCHLUESSEL für Vercel Production, einmal angezeigt
node scripts/prod.mjs node scripts/lexware-webhook.mjs konto       # mit LEXWARE_API_KEY_PROD: zeigt Sawins Konto und organizationId
node scripts/prod.mjs node scripts/lexware-webhook.mjs anlegen https://sawin-bauelemente-app.vercel.app/api/lexware/webhook
node scripts/prod.mjs node scripts/lexware-webhook.mjs liste       # Kontrolle
```

## Vercel „Production“: Variablen und Herkunft

Vercel › Projekt › Settings › Environment Variables › Environment **Production** (Preview behält die Staging-Werte).
Geheime Werte als „Sensitive“. Kein Wert aus Staging: Nach dem Redeploy prüft `npm run golive:vercel`, dass die App mit
dem Produktionsprojekt arbeitet.

| Variable | Wert bzw. Herkunft | geheim |
|---|---|---|
| `NEXT_PUBLIC_CUSTOMER_ID` | `sawin` | nein |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase › sawin-produktion › Project Settings › Data API › Project URL (`https://zqjrxxrvhbrnhknkmpqh.supabase.co`) | nein |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase › sawin-produktion › Project Settings › API Keys › Publishable key | nein |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase › sawin-produktion › Project Settings › API Keys › Secret keys | ja |
| `LEXWARE_API_KEY` | Sawins Lexware Office › Einstellungen › Erweiterungen › Public API (von Sawin erzeugt) | ja |
| `LEXWARE_ALTBESTAND` | `aktiv` (am Go-live-Tag) | nein |
| `ONEDRIVE_ALTBESTAND` | leer lassen | nein |
| `CRON_SECRET` | `npm run golive:geheimnisse` (eigener Wert, nicht der von Preview) | ja |
| `MS_TOKEN_SCHLUESSEL` | `npm run golive:geheimnisse` (eigener Wert) | ja |
| `MS_GRAPH_TENANT_ID` | Entra › App-Registrierung der Produktion › Übersicht › Verzeichnis-ID | nein |
| `MS_GRAPH_CLIENT_ID` | Entra › App-Registrierung der Produktion › Übersicht › Anwendungs-ID | nein |
| `MS_GRAPH_CLIENT_SECRET` | Entra › App-Registrierung der Produktion › Zertifikate & Geheimnisse (neu, mit Ablaufdatum) | ja |
| `UMGESETZT_VON` | optional `aus` | nein |

Nie in Vercel: `SUPABASE_DB_URL`, `SUPABASE_ACCESS_TOKEN`, `ERLAUBTES_TESTPROJEKT`, `AIRTABLE_*` und alle `…_PROD`.

## Checkliste Go-live-Tag

Go-live-Datum: **13.11.2026** (in Produktion gesetzt, Einstellungen › Verbindungen).

### Vorher

**Luca**
- [ ] Dashboard-Schritte für sawin-produktion abhaken (Checkliste in `docs/uebergabe.md`): Passwortschutz, Sessions
      12 h / 60 min, sicherer Passwortwechsel, SMTP, Rate Limits, URL Configuration, PITR, Realtime.
- [ ] Auth-Konfiguration: entweder im Dashboard wie in `supabase/config.toml` setzen (Sign-up aus, TOTP an, Passwort ab
      12 Zeichen, E-Mail-Vorlagen) oder Claude Code ein Supabase-Token mit Rechten für sawin-produktion geben
      (`npm run auth:push`).
- [ ] GitHub › Repository › Settings › Branches: Schutzregel für `main` (Pull Request oder mindestens kein Force-Push,
      kein Löschen).
- [ ] Entra: App-Registrierung für die Produktion mit Freigabe nur für „Kundenprojekte“ (Sites.Selected bzw.
      Lists.SelectedOperations.Selected); Client-Secret mit Ablaufdatum.

**Claude Code**
- [x] Kundenimport schreiben (13.11.2026), danach Go-live-Prüfung erneut (nur lesend): ok.
- [ ] Schema-Vergleich und Advisors der Produktion.

### Am Go-live-Tag

**Luca**
- [ ] Airtable und Make einfrieren: Make-Szenarien stoppen, Airtable nur noch lesen (2–4 Wochen als Rückfallebene).
- [ ] Sawins Lexware-Schlüssel erzeugen: in Vercel Production `LEXWARE_API_KEY`, für die Prüfung zusätzlich in
      `.env.local` als `LEXWARE_API_KEY_PROD` (danach wieder löschen).
- [ ] Vercel Production: alle Variablen der Tabelle oben, einschließlich `LEXWARE_ALTBESTAND=aktiv`,
      `CRON_SECRET` und `MS_TOKEN_SCHLUESSEL` aus `npm run golive:geheimnisse`.
- [ ] Vercel › Deployments › letzte Bereitstellung von `main` › Redeploy (Production), damit die Variablen gelten.
- [ ] Erste Anmeldung als Admin: Authenticator-App einrichten, Startpasswort durch eigenes ersetzen.
- [ ] Weitere Benutzer anlegen (`benutzer:anlegen`, je mit Startpasswort) bzw. in der App einladen, sobald SMTP läuft.
- [ ] Einstellungen › Firma: Firmendaten prüfen (stehen auf jedem Beleg). Einstellungen › Belege & Artikel:
      Zahlungsbedingungen, Textvorlagen, Artikel.
- [ ] Einstellungen › Verbindungen: OneDrive (Website-ID, Bibliotheks-ID, Basisordner „2026“) verbinden; Go-live-Datum
      prüfen.
- [ ] Lexware-Webhook für die Produktionsadresse anlegen (Befehl oben). Den Webhook des Lexware-Testkontos, der auf
      dieselbe Adresse zeigt, löschen oder auf eine Preview-Adresse umstellen.
- [ ] Ersten echten Beleg prüfen: Angebot an einen übernommenen Kunden (Nummer `AG1261000`, PDF), AB (`AB2261000`,
      Auftrag entsteht), Rechnung über Lexware: geht an den bestehenden Lexware-Kontakt (kein neuer Kontakt), Nummer und
      Original-PDF kommen zurück; Zahlung in Lexware buchen und in der App „Zahlungsstand abrufen“.

**Claude Code**
- [x] Go-live-Datum setzen: 13.11.2026.
- [ ] Kundenimport noch einmal mit `--schreiben` (übernimmt Änderungen in Airtable seit dem ersten Lauf; wiederholbar,
      ändert nur Zeilen, die in der App noch niemand bearbeitet hat).
- [ ] `node scripts/prod.mjs npm run golive:pruefen` mit Sawins Lexware (nur lesend): Konto, organizationId, höchste
      Nummern, Startwerte.
- [ ] `npm run golive:vercel`: Region fra1, CSP, no-store, Supabase-Projekt = Produktion.
- [ ] Advisors der Produktion.
- [ ] Am Ende die `…_PROD`-Einträge aus `.env.local` leeren: `npm run golive:prod-entfernen`.

### Rückfallplan

- **App nicht erreichbar oder fehlerhaft nach dem Redeploy:** Vercel › Deployments › vorige Bereitstellung › Instant
  Rollback; die Daten in Supabase bleiben unverändert.
- **Grundsätzliches Problem am ersten Tag:** Make-Szenarien wieder starten und mit Airtable weiterarbeiten (2–4 Wochen
  eingefroren). Belege, die in der Zwischenzeit in der App entstanden sind, stehen in der Belegliste; Rechnungen,
  Abschläge und Gutschriften liegen ohnehin in Lexware.
- **Falsche Daten in der Datenbank:** Point-in-Time-Recovery (Supabase › Database › Backups) auf einen Zeitpunkt vor
  dem Fehler, vorher in ein Testprojekt wiederherstellen und prüfen (`npm run backup:pruefen`).
- **Lexware:** In Lexware entstehen nur Rechnungen, Abschläge, Gutschriften und Kontakte. Sie sind endgültig; Korrekturen
  über eine Gutschrift. Den Schlüssel bei Bedarf in Lexware widerrufen (stoppt jeden Zugriff der App).
