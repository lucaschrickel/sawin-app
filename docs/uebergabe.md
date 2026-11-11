# Übergabe-Anleitung

Diese Anleitung beschreibt alle Dienste, Umgebungsvariablen und manuellen Schritte, die für den Betrieb einer
Instanz nötig sind. Sie wird bei jeder neuen Umgebungsvariable, jedem neuen Dienst und jedem neuen manuellen Schritt
ergänzt.

## Dienste

| Dienst | Zweck | Konto |
|---|---|---|
| Supabase | Datenbank, Anmeldung, Dateien | Konto des Kunden, Region Frankfurt, je Kunde ein Staging- und ein Produktionsprojekt |
| Vercel | Hosting der App, Region `fra1` (festgelegt in `vercel.json`, gilt für alle Serverfunktionen) | bis zur Übergabe im Team von Luca |
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
| `CRON_SECRET` | nur Server (Vercel: Production und Preview) | Zufällige Zeichenkette, mindestens 16 Zeichen (z. B. `openssl rand -hex 32`). Vercel schickt sie beim Cron als `Authorization: Bearer …`; ohne sie antwortet `/api/cron/zahlungsabgleich` immer 401. Je Umgebung ein eigener Wert. |
| `MS_GRAPH_TENANT_ID`, `MS_GRAPH_CLIENT_ID`, `MS_GRAPH_CLIENT_SECRET` | nur Server (Vercel: Production und Preview, „Sensitive“) | App-Registrierung in Microsoft Entra für die OneDrive-Ablage (siehe „OneDrive“): Verzeichnis-ID, Anwendungs-ID, geheimer Clientschlüssel. Keine Mailrechte. |
| `MS_TOKEN_SCHLUESSEL` | nur Server (je Umgebung eigener Wert) | 32 Byte base64 (`openssl rand -base64 32`); verschlüsselt das Graph-Zugriffstoken in `public.ms_token`. Wechsel unkritisch: das Token wird dann neu geholt. |
| `MS_GRAPH_BASIS`, `MS_LOGIN_BASIS` | nur Tests | Lenken Graph und Anmeldung auf den nachgebauten Test-Server (`npm run test:onedrive`). **Nie** auf Vercel setzen. |

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
APP_URL=http://localhost:3100 npm run test:plantafel  # Kolonnen, Ressourcen, Pipeline, Duplizieren, Farbe, Sammelfreigabe, 4 Wochen, Wochenplan-PDF
APP_URL=http://localhost:3100 npm run test:kopfzeile  # Globale Suche, Neu-Menü, Glocke, vorläufiger Versand (Download, mailto)
APP_URL=http://localhost:3100 npm run test:onedrive   # OneDrive-Ablage gegen den nachgebauten Graph-Server (siehe „OneDrive“)
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
APP_URL=http://localhost:3100 npm run test:katalog      # Artikelkatalog, Textvorlagen, formatierte Beschreibungen (ohne Lexware)
npm run test:unit                                       # Belegsummen, Abschläge (centgenau), Zahlungsposten, HTML, Webhook-Signatur und Cron-Zugang, ohne App
```

**Belege einrichten (je Instanz, einmalig in der App):** Unter Einstellungen › Firma die Firmendaten eintragen (stehen
im Kopf, in der Absenderzeile und im Fuß jedes Beleg-PDFs, auch Bank, USt-IdNr. und Steuernummer). Unter Einstellungen ›
Belege & Artikel die Gültigkeit der Angebote, die Zahlungsbedingungen (Standard je Belegart markieren), den
Artikelkatalog (Stern = Schnellauswahl im Editor) und die Textvorlagen für Einleitung, Lieferbedingungen und
Nachbemerkung anlegen. Der private
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

## Vercel

- **Region:** `vercel.json` setzt `"regions": ["fra1"]` für alle Serverfunktionen. In Vercel unter Settings › Functions
  prüfen, dass dort „Frankfurt (fra1)“ steht und keine andere Region eingetragen ist.
- **Umgebungsvariablen** (Settings › Environment Variables) für **Production** und **Preview** getrennt setzen; Preview
  zeigt auf Staging-Supabase und das Lexware-Testkonto, Production auf die Produktivprojekte:
  `NEXT_PUBLIC_CUSTOMER_ID`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY`, `LEXWARE_API_KEY`, `CRON_SECRET` (später `MS_GRAPH_*`). Nicht auf Vercel:
  `SUPABASE_DB_URL`, `SUPABASE_ACCESS_TOKEN`, `SUPABASE_AUTH_SITE_URL`.
- **Cron:** `vercel.json` ruft alle 30 Minuten `/api/cron/zahlungsabgleich` und versetzt dazu `/api/cron/ablage` (OneDrive nachladen) auf (Zahlungsstand aller offenen
  Lexware-Belege). Vercel führt Crons **nur für Production-Deployments** aus und erst ab dem **Pro-Tarif** öfter als
  einmal am Tag (im Hobby-Tarif schlägt das Deployment mit diesem Zeitplan fehl). Läuft Staging als Preview, gibt es
  dort keinen Cron; der Abgleich beim Öffnen und der Webhook reichen dann. Prüfen: Settings › Cron Jobs › „Run“,
  Ergebnis in den Logs (`{"status":"ok","geprueft":…}`).
- **Schutz der Deployments:** Ist „Vercel Authentication“ (Deployment Protection) aktiv, erreicht Lexware den Webhook
  nicht. Für die Adresse, die Lexware aufruft, entweder den Schutz abschalten (für Production Standard) oder unter
  Settings › Deployment Protection ein „Protection Bypass for Automation“-Geheimnis anlegen und an die Webhook-Adresse
  hängen: `…/api/lexware/webhook?x-vercel-protection-bypass=<Geheimnis>`.
- **Lexware-Webhook registrieren** (einmal je Umgebung und je Lexware-Konto; der API-Schlüssel kommt aus `.env.local`,
  also zuerst prüfen, dass er zum richtigen Konto gehört):

  ```bash
  npm run lexware:webhook -- konto     # mit welchem Lexware-Konto ist der Schlüssel verbunden?
  npm run lexware:webhook -- anlegen https://<app-adresse>/api/lexware/webhook
  npm run lexware:webhook -- liste     # payment.changed, invoice.status.changed, credit-note.status.changed
  npm run lexware:webhook -- loeschen <subscriptionId>
  ```

  Lexware prüft die Adresse beim Anlegen (HEAD, muss 200 liefern; HTTPS Pflicht). Der Endpunkt prüft jede Zustellung
  über die RSA-Signatur von Lexware (Header `X-Lxo-Signature`, öffentlicher Schlüssel in
  `src/lib/lexware/webhook-pruefung.ts`), erkennt Doppelzustellungen und protokolliert Fehler in der Tabelle
  `lexware_ereignis` (Admins lesen sie z. B. im Supabase-Dashboard). Bei Fehlern antwortet er 500, Lexware stellt
  dann erneut zu. Wird der Lexware-API-Schlüssel ungültig gemacht, löscht Lexware alle Abos: nach einem neuen
  Schlüssel erneut anlegen. Beim Go-live: Abos im Testkonto löschen und mit Sawins Schlüssel für die
  Produktionsadresse anlegen.

## OneDrive (Ablage über Microsoft Graph)

Die App legt je Vorgang einen Ordner an (ab dem ersten Angebot `<AG-Nummer>_<Kunde>`, mit der AB umbenannt in
`<AB-Nummer>_<Kunde>`, Unterordner wie im bisherigen Make-Szenario) und speichert dort Beleg-PDFs, Scans und Dateien.
Sie meldet sich als **Anwendung** an (keine Benutzeranmeldung, deshalb **keine Redirect-URLs**, weder für localhost noch
für vercel.app) und darf nur in **eine** SharePoint-Bibliothek schreiben. Keine Mailrechte. Die App speichert nur die
Verknüpfung (Drive-ID, Item-ID). Ist Microsoft nicht erreichbar oder noch nichts eingerichtet, liegt die Datei im
privaten Speicher `ablage-puffer` und wird nachgeladen (Cron alle 30 Minuten, beim Öffnen eines Auftrags,
„Jetzt übertragen“ in den Einstellungen).

**App-Registrierung (als globaler Administrator, je Umgebung eine eigene Registrierung empfohlen):**

1. https://entra.microsoft.com › Anwendungen › App-Registrierungen › **Neue Registrierung**: Name z. B.
   „Sawin App Ablage (Staging)“, Kontotyp „Nur Konten in diesem Organisationsverzeichnis“, **Umleitungs-URI leer
   lassen**. Nach dem Registrieren notieren: **Anwendungs-ID (Client-ID)** → `MS_GRAPH_CLIENT_ID`,
   **Verzeichnis-ID (Mandant)** → `MS_GRAPH_TENANT_ID`.
2. **Zertifikate & Geheimnisse** › Neuer geheimer Clientschlüssel (Ablauf 12 oder 24 Monate, Termin vormerken). Den
   **Wert** sofort kopieren (nur einmal sichtbar) → `MS_GRAPH_CLIENT_SECRET`.
3. **API-Berechtigungen**: die vorhandene delegierte Berechtigung „User.Read“ entfernen. Berechtigung hinzufügen ›
   Microsoft Graph › **Anwendungsberechtigungen** › **Lists.SelectedOperations.Selected**. Danach **„Administrator­
   zustimmung für <Mandant> erteilen“**. Nicht hinzufügen: Mail.*, Files.ReadWrite.All, Sites.ReadWrite.All.
   Die Zustimmung allein gibt noch keinen Zugriff; erst die Freigabe in Schritt 4.
4. **Freigabe der einen Bibliothek** im Graph Explorer (https://developer.microsoft.com/graph/graph-explorer, als
   globaler Administrator angemeldet; für diese Aufrufe einmalig die delegierte Berechtigung `Sites.FullControl.All`
   für den Graph Explorer zustimmen):
   - Website-ID: `GET https://graph.microsoft.com/v1.0/sites/<firma>.sharepoint.com:/sites/<website>` → `id`
     (Form `<host>,<guid>,<guid>`).
   - Bibliotheks-ID: `GET https://graph.microsoft.com/v1.0/sites/<website-id>/lists?$select=id,displayName` → `id`
     der Dokumentbibliothek (meist „Dokumente“).
   - Freigeben: `POST https://graph.microsoft.com/v1.0/sites/<website-id>/lists/<bibliotheks-id>/permissions` mit
     `{"roles": ["write"], "grantedTo": {"application": {"id": "<client-id>", "displayName": "Sawin App Ablage"}}}`
     (lehnt v1.0 den Aufruf ab, dieselbe Adresse mit `/beta/`).
   - Prüfen: `GET …/lists/<bibliotheks-id>/permissions` zeigt die App mit „write“.
   - Falls Microsoft die Freigabe auf Listenebene für diese Bibliothek nicht zulässt: statt Schritt 3/4
     `Sites.Selected` (Anwendungsberechtigung) und `POST /v1.0/sites/<website-id>/permissions` mit demselben Inhalt
     (dann gilt der Zugriff für die eine Website).
5. **Umgebungsvariablen** in Vercel (Production und Preview getrennt, als „Sensitive“) und lokal in `.env.local`:
   `MS_GRAPH_TENANT_ID`, `MS_GRAPH_CLIENT_ID`, `MS_GRAPH_CLIENT_SECRET`, `MS_TOKEN_SCHLUESSEL`
   (`openssl rand -base64 32`, je Umgebung eigener Wert). Danach neu deployen.
6. **In der App** (Admin): Einstellungen › Verbindungen › Website-ID, Bibliotheks-ID, Basisordner **`_App-Test`** ›
   „Prüfen und speichern“. Ein Angebot anlegen: der Ordner `<AG-Nummer>_<Kunde>` mit Unterordnern erscheint in
   `_App-Test`. Erst nach der Abnahme den echten Basisordner eintragen.

Prüfung ohne Microsoft (nachgebauter Graph-Server; nur mit leerem Zwischenspeicher auf Staging):

```bash
MS_GRAPH_BASIS=http://127.0.0.1:3990/v1.0 MS_LOGIN_BASIS=http://127.0.0.1:3990/login MS_GRAPH_TENANT_ID=test \
MS_GRAPH_CLIENT_ID=test MS_GRAPH_CLIENT_SECRET=test MS_TOKEN_SCHLUESSEL=<base64> CRON_SECRET=<geheim> npx next start -p 3100
APP_URL=http://localhost:3100 CRON_SECRET=<geheim> npm run test:onedrive
```

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
  5 Minuten), über „Zahlungsstand abrufen“, alle 30 Minuten per Vercel-Cron und sofort über den Lexware-Webhook
  (siehe „Vercel“).
- **Fehler:** Lehnt Lexware einen Beleg ab, bleibt er Entwurf, die Meldung steht auf der Belegseite, und
  „Fertigstellen“ versucht es erneut. Ein schon angelegter Beleg wird dabei gefunden (Kontakt, Datum, Betrag) und
  nicht doppelt angelegt. Fehlt das Original-PDF, holt die App es beim Öffnen nach („PDF von Lexware holen“).
- **Beim Go-live in Sawins Lexware prüfen:** ob `vatfree` (steuerfreie Rechnung) für das Konto erlaubt ist, ob die
  Kontakte mit § 13b („Steuerfreie Rechnungen erlauben“) passen, und welche Nummernkreise Lexware für Rechnungen und
  Gutschriften verwendet. Die Kundennummer auf dem Lexware-PDF vergibt Lexware selbst.
