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
| `LEXWARE_API_KEY` | nur Server | Staging: Testkonto, Produktion: Schlüssel des Kunden (erst beim Go-live) |
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

### Manuelle Einstellungen je Supabase-Projekt

- Authentication › Sign In / Providers: **„Allow new users to sign up“ ausschalten** (Anmeldung nur per Einladung).
- Authentication › Multi-Factor: **TOTP aktiviert** (Standard). Die Datenbank lässt nur Benutzer mit bestätigtem
  zweiten Faktor an Daten.
- Nummernkreise: nach der Datenübernahme aus Airtable die Startwerte in `nummernkreis.letzte` setzen und das Muster je
  Belegart prüfen (Vorgabe: `AG1JJNNNN`, `AB2JJNNNN`, `LS1JJNNNN`, `ZB1JJNNNN`, `ST-JJ-NNNN`, `BE-JJ-NNN`).
- Erster Admin: Benutzer in Supabase einladen, danach mit der Service-Rolle eine Zeile in `benutzer` mit
  `admin = true` anlegen. Weitere Benutzer verwaltet dieser Admin.
- Interne Kopie (BCC) je Belegart in `belegart_einstellung` eintragen (bei Sawin: Angebot an `angebot@…`, AB und
  Teil-AB an `auftrag@…`).
