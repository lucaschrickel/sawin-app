# Übergabe-Anleitung

Diese Anleitung beschreibt alle Dienste, Umgebungsvariablen und manuellen Schritte, die für den Betrieb einer
Instanz nötig sind. Sie wird bei jeder neuen Umgebungsvariable, jedem neuen Dienst und jedem neuen manuellen Schritt
ergänzt.

## Dienste

| Dienst | Zweck | Konto |
|---|---|---|
| Supabase | Datenbank, Anmeldung, Dateien | Konto des Kunden, Region Frankfurt, je Kunde ein Staging- und ein Produktionsprojekt |
| Vercel | Hosting der App, Region `fra1` | bis zur Übergabe im Team von Luca |
| GitHub | Quellcode | Repository wird übergeben |
| Lexware Office | Rechnungen, Abschläge, Gutschriften | Staging: eigenes Testkonto (Tarif XL), Produktion: Konto des Kunden |
| Microsoft 365 | OneDrive-Ablage, E-Mail-Versand | Konto des Kunden |

## Umgebungsvariablen

Vorlage: `.env.example`. Lokal in `.env.local` (nie einchecken), auf Vercel in den Projekteinstellungen.

| Variable | Wo | Inhalt |
|---|---|---|
| `NEXT_PUBLIC_CUSTOMER_ID` | App | Kundeninstanz, Ordnername in `src/customers/` (z. B. `sawin`) |
| `NEXT_PUBLIC_SUPABASE_URL` | App | Projekt-URL aus Supabase › Project Settings › API, nur `https://<ref>.supabase.co` (ohne `/rest/v1/`) |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | App | Publishable Key (`sb_publishable_…`) |
| `SUPABASE_SERVICE_ROLE_KEY` | nur Server, Tests | Secret Key (`sb_secret_…`) aus Supabase › Project Settings › API Keys. Nie mit `NEXT_PUBLIC_`. |
| `SUPABASE_DB_URL` | nur lokal / Deployment-Rechner | Verbindung zur Datenbank für Migrationen: Supabase › Connect › Session pooler (mit Passwort). Nicht auf Vercel setzen. |
| `SUPABASE_ACCESS_TOKEN` | nur lokal | Persönliches Token (Supabase › Account › Access Tokens) zum Einspielen der Auth-Einstellungen. Nicht auf Vercel setzen. |
| `SUPABASE_AUTH_SITE_URL` | nur lokal (beim Einspielen) | Adresse der App für Links in Auth-E-Mails, z. B. `http://localhost:3000` (Staging lokal) oder die Vercel-Adresse |
| `LEXWARE_API_KEY` | nur Server | Lexware Office › Erweiterungen › Public API: Schlüssel erzeugen. Staging: eigenes Testkonto, Produktion: Schlüssel des Kunden (erst beim Go-live). Ohne Schlüssel zeigt die Seitenleiste „Lexware nicht verbunden“ und Rechnungen lassen sich nicht fertigstellen. |
| `MS_GRAPH_TENANT_ID`, `MS_GRAPH_CLIENT_ID`, `MS_GRAPH_CLIENT_SECRET` | nur Server | App-Registrierung in Microsoft Entra für OneDrive und E-Mail |

## Datenbank

Das Datenmodell ist in `docs/datenmodell.md` beschrieben. Änderungen gibt es nur als Migration in
`supabase/migrations` (nie per Klick im Dashboard).

Migrationen einspielen (erst Staging, nach Abnahme Produktion; `SUPABASE_DB_URL` zeigt auf das jeweilige Projekt):

```bash
npm run db:status     # welche Migrationen sind eingespielt
npm run db:push:dry   # Probelauf, ändert nichts
npm run db:push       # einspielen (fragt nach Bestätigung)
```

Danach im Supabase-Dashboard unter Advisors (Security und Performance) prüfen: keine Warnungen (WARN/ERROR).

Prüfung der Rechte (legt Testbenutzer mit MFA und Testdaten an und entfernt sie über `SUPABASE_DB_URL` wieder, weil
über die API niemand echt löschen darf; nur gegen Staging ausführen):

```bash
npm run test:rls
```

## Anmeldung

E-Mail und Passwort über Supabase Auth, danach Pflicht-Code aus einer Authenticator-App (TOTP). Ohne bestätigten
zweiten Faktor gibt die Datenbank keine Daten heraus. Zugänge nur per Einladung durch einen Admin (Einstellungen ›
Benutzer). Automatische Abmeldung nach 60 Minuten ohne Aktivität (`src/lib/auth/konstanten.ts`).

Die Auth-Einstellungen stehen als Code in `supabase/config.toml` (keine Selbstregistrierung, Passwort mindestens 12
Zeichen mit Groß-/Kleinbuchstaben und Ziffer, TOTP an, Links eine Stunde gültig) mit den deutschen E-Mail-Vorlagen in
`supabase/templates/`. Einspielen je Projekt (braucht `SUPABASE_ACCESS_TOKEN` und `SUPABASE_AUTH_SITE_URL`):

```bash
npm run auth:diff     # Unterschiede zum Projekt anzeigen
npm run auth:push     # einspielen (fragt nach Bestätigung)
npm run auth:push -- --ohne-vorlagen   # ohne E-Mail-Vorlagen (kostenloser Tarif ohne eigenen SMTP)
```

Im kostenlosen Tarif mit dem eingebauten E-Mail-Versand lehnt Supabase eigene E-Mail-Vorlagen ab. Dann alles außer
den Vorlagen mit `--ohne-vorlagen` einspielen; Einladungen und „Passwort vergessen“ per E-Mail funktionieren erst mit
eigenem SMTP-Zugang (oder Pro-Tarif) und anschließendem `npm run auth:push`. Stand Staging (09.11.2026): ohne Vorlagen
eingespielt.

Ersten Admin einer Instanz einladen (danach lädt dieser Admin alle weiteren Benutzer in der App ein):

```bash
npm run admin:einladen -- name@firma.de "Vorname Nachname"
npm run admin:einladen -- name@firma.de "Vorname Nachname" --ohne-email   # Link in lokale Datei statt E-Mail
npm run admin:passwort -- name@firma.de   # neues Passwort setzen (verdeckte Eingabe, nur im Terminal)
```

Der Admin öffnet den Link aus der E-Mail, klickt „Weiter“, setzt sein Passwort und scannt den QR-Code mit der
Authenticator-App. Danach meldet er sich mit E-Mail, Passwort und Code an. Verliert jemand sein Handy, setzt ein Admin
unter Einstellungen › Benutzer die Zwei-Faktor-Anmeldung zurück.

Prüfung im Browser (nur gegen Staging; App vorher bauen und starten):

```bash
npm run build && npx next start -p 3100
APP_URL=http://localhost:3100 npm run test:anmeldung
APP_URL=http://localhost:3100 npm run test:kunden     # Modul Kunden mit vorübergehendem Test-Admin
APP_URL=http://localhost:3100 npm run test:anfragen   # Modul Anfragen
APP_URL=http://localhost:3100 npm run test:aufgaben   # Modul Aufgaben
APP_URL=http://localhost:3100 npm run test:auftraege  # Modul Aufträge
APP_URL=http://localhost:3100 npm run test:montageplan # Modul Montageplan (Plantafel, echte Mausbewegungen)
APP_URL=http://localhost:3100 npm run test:mitarbeiter # Modul Mitarbeiter
APP_URL=http://localhost:3100 npm run test:zeiten      # Modul Zeiterfassung
APP_URL=http://localhost:3100 npm run test:abwesenheiten # Modul Abwesenheiten (Büro-Benutzer und Admin)
APP_URL=http://localhost:3100 npm run test:seitenleiste  # Seitenleiste wie in der Demo (folgt, Zähler, Einklappen)
APP_URL=http://localhost:3100 npm run test:team          # Fahrzeuge, Fahrzeug in der Plantafel, Kalender
APP_URL=http://localhost:3100 npm run test:service       # Service-Tickets und Service-Plan
APP_URL=http://localhost:3100 npm run test:einkauf       # Lieferanten, Bestellungen, „Ware eingetroffen“ am Auftrag
APP_URL=http://localhost:3100 npm run test:dashboard     # Dashboard: drei Ansichten mit echten Daten, Ansicht je Benutzer gemerkt
APP_URL=http://localhost:3100 npm run test:oberflaeche   # Passwortfeld mit Augen-Symbol, Logo hell und dunkel
APP_URL=http://localhost:3100 npm run test:belege        # Belege: Angebot → AB → Auftrag → Lieferschein, PDF, Versionen, Listen
APP_URL=http://localhost:3100 npm run test:lexware      # Lexware-Testkonto: Angebot → AB → Abschlag → Teil-AB → Teilrechnung → Abschlag → Schlussrechnung → Gutschrift, Ticket-Rechnung
APP_URL=http://localhost:3100 npm run test:zahlungen    # Lexware-Testkonto: Zahlungsstand abrufen, Als bezahlt markieren, Zahlungsbestätigung
npm run test:unit                                       # Belegsummen und Abschläge (Rundung auf Cent, Schlussrechnung centgenau), ohne App
```

**Belege einrichten (je Instanz, einmalig in der App):** Unter Einstellungen › Firma die Firmendaten eintragen (stehen
im Kopf, in der Absenderzeile und im Fuß jedes Beleg-PDFs, auch Bank, USt-IdNr. und Steuernummer). Unter Einstellungen ›
Belege die Gültigkeit der Angebote und die Zahlungsbedingungen anlegen (Standard je Belegart markieren). Der private
Speicher `belege` für die PDFs entsteht mit der Migration, es ist nichts per Klick anzulegen. Die Schrift Inter für die
PDFs kommt aus `@fontsource/inter` und wird über `outputFileTracingIncludes` (`next.config.ts`) mit ausgeliefert.

**Vor der Einladung von Mitarbeitern:** Der eingebaute E-Mail-Versand von Supabase schickt nur an Mitglieder der
Supabase-Organisation und nur wenige E-Mails pro Stunde. Für den Betrieb unter Authentication › Emails › SMTP Settings
einen eigenen SMTP-Zugang eintragen (z. B. Microsoft 365 des Betriebs oder ein Versanddienst mit Sitz in der EU).
**Ab dem Pro-Tarif** zusätzlich unter Authentication › Sessions eine Inaktivitäts-Grenze (60 Minuten) setzen.

### Manuelle Einstellungen je Supabase-Projekt

- Authentication: prüfen, dass „Allow new users to sign up“ aus und TOTP an ist (setzt `npm run auth:push`).
- Nummernkreise: nach der Datenübernahme aus Airtable die Startwerte in `nummernkreis.letzte` setzen und das Muster je
  Belegart prüfen (Vorgabe: `AG1JJNNNN`, `AB2JJNNNN`, `LS1JJNNNN`, `ZB1JJNNNN`, `ST-JJ-NNNN`, `BE-JJ-NNN`).
- Interne Kopie (BCC) je Belegart in `belegart_einstellung` eintragen (bei Sawin: Angebot an `angebot@…`, AB und
  Teil-AB an `auftrag@…`).

## Lexware

- **Konto:** Lexware Office des Kunden (Tarif mit Public API). Bis zum Go-live arbeitet Staging nur gegen ein eigenes
  Testkonto; Sawins Schlüssel wird erst in Produktion gesetzt (`LEXWARE_API_KEY`, nur Server).
- **Was übertragen wird:** Rechnungen, Abschläge (als normale Rechnung „1. Abschlagsrechnung“ …) und Gutschriften,
  jeweils beim „Fertigstellen“ nach einem Bestätigungsdialog. Der Kunde wird beim ersten dieser Belege als Kontakt
  angelegt; danach gehen Änderungen nur von der App nach Lexware. Angebote, ABs und Lieferscheine bleiben in der App.
- **Serverseitige Rechte:** Die Lexware-Ergebnisse (Nummer, Beträge, PDF, Kontakt-ID) schreibt der Server mit dem
  Supabase-Secret-Key (`SUPABASE_SERVICE_ROLE_KEY`) über die Datenbankfunktionen `lexware_*`. Benutzer können diese
  Funktionen nicht aufrufen; im Audit-Log steht trotzdem der Benutzer, der „Fertigstellen“ geklickt hat. Der
  Secret Key muss deshalb auch auf Vercel (nur Server, nie `NEXT_PUBLIC_`) gesetzt sein.
- **Drosselung:** höchstens 2 Anfragen pro Sekunde je Server-Instanz, bei HTTP 429 Wiederholung mit Backoff.
- **Zahlungen:** Lexware nimmt Zahlungen über die API nicht an. Bar- und Kartenzahlungen, die das Büro in der App
  „als bezahlt markiert“, müssen zusätzlich in Lexware gebucht werden; die App gleicht sie dann ab (gleicher Beleg,
  gleicher Betrag). Den Zahlungsstand holt die App beim Öffnen von Belegen, Aufträgen und Dashboard (höchstens alle
  5 Minuten) und über „Zahlungsstand abrufen“. **Sobald die App auf Vercel läuft:** Cron alle 15 Minuten einrichten
  (neue Variable `CRON_SECRET`, wird mit dem Cron ergänzt).
- **Fehler:** Lehnt Lexware einen Beleg ab, bleibt er Entwurf, die Meldung steht auf der Belegseite, und
  „Fertigstellen“ versucht es erneut. Ein schon angelegter Beleg wird dabei gefunden (Kontakt, Datum, Betrag) und
  nicht doppelt angelegt. Fehlt das Original-PDF, holt die App es beim Öffnen nach („PDF von Lexware holen“).
- **Beim Go-live in Sawins Lexware prüfen:** ob `vatfree` (steuerfreie Rechnung) für das Konto erlaubt ist, ob die
  Kontakte mit § 13b („Steuerfreie Rechnungen erlauben“) passen, und welche Nummernkreise Lexware für Rechnungen und
  Gutschriften verwendet. Die Kundennummer auf dem Lexware-PDF vergibt Lexware selbst.
