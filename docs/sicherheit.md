# Sicherheitsprüfung nach OWASP ASVS 5.0, Level 1

Stand: 13.11.2026 · Prüfgegenstand: Repository `main` (Commit nach 313aa91), Supabase **Staging** · Maßstab: OWASP ASVS
5.0.0, alle 70 Anforderungen der Stufe 1 (CLAUDE.md, Abschnitt „Sicherheit“).

## Vorgehen

- **Zehn Prüfbereiche** wurden parallel und nur lesend geprüft: Datenbank/RLS/Storage, Anmeldung und Sitzung,
  Geheimnisse (einschließlich der gesamten Git-Historie), Webhooks und Crons, Eingaben/Injection/XSS/Uploads, HTTP-Header
  und CSP, Microsoft Graph und Lexware, Abhängigkeiten, Supabase-Advisors und Plattform, Fehlermeldungen und Logging.
- Eine **Vollständigkeitskritik** ergab fünf weitere Nachprüfungen: Zustandsübergänge per Direktzugriff auf die
  Datenbank-API, Werkzeuge und Testskripte, Next.js-Eigenheiten (Shells, Proxy-Matcher, Cache-Header), Realtime und
  signierte Storage-Adressen sowie Ressourcenverbrauch.
- **Jeder Fund wurde unabhängig gegengeprüft.** Hohe Funde prüften drei Gutachter, die sie widerlegen sollten (Angriffsweg
  konstruieren, ausgleichende Kontrollen suchen, Einstufung prüfen). Mittlere Funde prüften zwei Gutachter, niedrige einer.
  Nach dieser Gegenprüfung sind Schweregrade teils herabgestuft (z. B. F70, F103) und zwei Funde verworfen.
- Auf Staging liefen nur lesende Abfragen und die bestehende RLS-Testsuite. Lexware und Microsoft Graph wurden nicht
  aufgerufen, an der Produktion wurde nichts geändert.
- **Schweregrade:**
  - **kritisch:** Zugriff ohne Anmeldung, offengelegte Geheimnisse oder Codeausführung.
  - **hoch:** Ein angemeldeter Benutzer umgeht Berechtigungen, gespeichertes XSS oder ein Maschinen-Endpunkt ohne
    Signaturprüfung.
  - **mittel:** Lücke in der Tiefenverteidigung mit plausiblem Angriffsweg.
  - **niedrig:** Härtung.
  - **info:** Beobachtung.

## Ergebnis in Kürze

| Schweregrad | Funde | Stand |
|---|---|---|
| kritisch | 0 | – |
| hoch | 3 Funde zu 2 Sachverhalten (F01 = F61, F14) | **behoben** (Migration `20261121090000_admin_rechte.sql`, RLS-Tests) |
| mittel | 14 Funde zu 9 Sachverhalten | offen, Vorschläge unten |
| niedrig | 75 (davon F05 und F41 mit den hohen Funden behoben) | offen, Tabelle unten |
| info | 46 | Hinweise |
| verworfen | 2 | nach Gegenprüfung kein Fund |

**ASVS 5.0 Level 1:**
- **41 Anforderungen erfüllt, 22 nicht erfüllt, 7 nicht relevant** (OAuth-Autorisierungsserver, XML, WebSockets).
- Bei den nicht erfüllten Anforderungen wiegt nur ein Fund mittel oder höher. Die meisten fallen auf
  Tiefenverteidigung in der Datenbank zurück: Regeln, die bisher nur die App prüft und die ein angemeldeter Benutzer
  per Direktzugriff auf die Datenbank-API umgehen kann.

**Was gut ist (mit Beleg geprüft):**
- RLS ist auf allen Fachtabellen aktiv, und die Policies verlangen den zweiten Faktor (aal2) auch in der Datenbank. Eine
  Sitzung nur mit Passwort liest nichts.
- Nicht angemeldete Aufrufer sehen nichts.
- Jede Server-Action und jeder Route-Handler prüft die Sitzung.
- Die Konditionen sind nur mit Recht lesbar, auch über die Suche.
- Kein Geheimnis liegt im Client-Bundle, in Logs oder in der Git-Historie.
- Der Lexware-Webhook prüft die RSA-Signatur über den rohen Body und erkennt Doppelzustellungen. Die Crons laufen nur
  mit `CRON_SECRET` (zeitkonstanter Vergleich) und sind ohne gesetztes Secret gesperrt.
- Das Graph-Token liegt AES-256-GCM-verschlüsselt in der Datenbank.
- Uploads werden nach Dateianfang (Magic Bytes) und Größe geprüft.
- `npm audit --omit=dev` meldet 0 Befunde.

## Behobene Funde (hoch)

### F01 / F61 (auch F41): Admin-Einstellungen in der Datenbank für jeden Benutzer änderbar

- **Befund:** Die Policies von `einstellung` und `belegart_einstellung` prüften nur `app.ist_benutzer()`. Ein Büro-Benutzer
  ohne Admin-Recht konnte per PostgREST an der Server-Action vorbei:
  - das Go-live-Datum ändern,
  - die OneDrive-Basis umbiegen,
  - `lexware_zahlung_abgleich_am` in die Zukunft setzen und damit den Zahlungsabgleich anhalten,
  - die Fremdbeleg-Liste fälschen,
  - die Einstellungszeile als gelöscht markieren,
  - eine fremde BCC-Adresse je Belegart eintragen.

  Der erste Testlauf vor der Behebung hat das bestätigt: Er konnte `golive_datum` auf Staging setzen (danach aus dem
  Audit-Log zurückgesetzt).
- **Behebung:**
  - Trigger `app.einstellung_schutz`: Go-live-Datum und OneDrive-Verbindung nur für Admins. Abgleich- und
    Fremdbeleg-Felder schreibt nur der Server. Die Zeile lässt sich nicht löschen.
  - Policies `anlegen`/`aendern` von `belegart_einstellung` auf `app.ist_admin()`.
- **Test:** `tests/rls/rls.test.mjs` › Montageplan › „Go-live-Datum, OneDrive-Verbindung und interne Kopie ändert nur der
  Admin; Server-Felder nur der Server“. Der Test stellt den alten Stand in jedem Fall wieder her.

### F14 (auch F05): Abwesenheit über die Art „krank“ ohne Admin genehmigt

- **Befund:** Ein Nicht-Admin konnte einen beantragten oder abgelehnten Urlaub per Update auf `art = 'krank'` umstellen.
  Der Trigger setzte ihn dann auf „genehmigt“, und danach war er auch ohne Admin löschbar.
- **Behebung:** `app.abwesenheit_status` lehnt bei Nicht-Admins den Wechsel einer anderen Art auf „krank“ ab (42501).
  Eine Krankmeldung ist immer ein neuer Eintrag und gilt weiter sofort als genehmigt.
- **Test:** „Nicht-Admins machen aus einem Antrag oder einer Ablehnung keine Krankmeldung“: beantragt und abgelehnt
  werden abgewiesen, das Löschen bleibt gesperrt.

RLS-Testsuite danach: **94 von 94 bestanden** (vorher 92, zwei neue Tests).

## Offene Funde: mittel

Nach der Vorgabe nur aufgelistet, mit Vorschlag. Reihenfolge nach Dringlichkeit.

| # | Funde | Sachverhalt | Vorschlag |
|---|---|---|---|
| M1 | F02, F81, F103 | **Beleg-PDFs ersetzbar.** Jeder Benutzer kann im Bucket `belege` Dateien anlegen und überschreiben (`upsert`) und `beleg.pdf_pfad` auch an fertigen Rechnungen umsetzen. So ließe sich das Lexware-Original durch ein verändertes PDF ersetzen, ohne Eintrag im Audit-Log. Das verletzt „nur das Lexware-PDF wird versendet“ und die Unveränderbarkeit fertiger Belege (GoBD). | Ablage nur serverseitig mit der Service-Rolle (`pdfAblegen`). Policies `belege_anlegen`/`belege_ersetzen` für `authenticated` entfernen, nur Lesen bleibt. `pdf_pfad` bei Benutzern sperren (Rechnung, Abschlag, Gutschrift nur über `lexware_fertig`/`lexware_pdf`, App-Belege nur mit Präfix `<beleg_id>/`). Jede Ablage mit SHA-256 ins Audit-Log schreiben. RLS-Tests dazu. |
| M2 | F104 | **Belegart, Kette und Vorgänger eines Entwurfs direkt änderbar.** Daraus entstehen z. B. eine AB mit AG-Nummer oder eine Rechnung aus einem Angebots-Entwurf, deren Lexware-Nummer verloren geht. | `art`, `kette_id`, `vorgaenger_id` bei Benutzer-Updates unveränderlich machen. `kette_id` beim Anlegen serverseitig ableiten. Bezüge von Entwürfen nur über `beleg_speichern` ändern. Tests auf 42501. |
| M3 | F52 | **CSP ohne `script-src`/Nonce.** Eine eingeschleuste Skriptzeile würde nicht aufgehalten (siehe Konzept unten). | CSP mit Nonce im Proxy setzen (Konzept unten). |
| M4 | F53 (F18, F44) | **Supabase-Sitzungscookies ohne `HttpOnly` und `Secure`** (Standard von `@supabase/ssr`, Laufzeit 400 Tage). Ein Skript könnte Access- und Refresh-Token der aal2-Sitzung lesen. | In beiden `createServerClient`-Aufrufen `cookieOptions: { httpOnly: true, secure: true in Produktion, sameSite: "lax" }` aus einer gemeinsamen Konstante. Der Browser braucht keinen Supabase-Client (geprüft). |
| M5 | F54, F17 (F82, F123) | **60-Minuten-Abmeldung umgehbar.** Das Aktivitäts-Cookie hat keine Laufzeit: Nach dem Schließen des Browsers fehlt es, und die Sitzung startet ohne Anmeldung neu. Supabase selbst hat weder Inaktivitäts- noch Höchstdauer. Der Proxy-Matcher lässt Pfade mit Bild- oder Schriftendung ungeprüft durch (F123). | Cookie mit `maxAge` setzen. Fehlt es bei bestehender Sitzung, gilt die Sitzung als abgelaufen (`/abmelden?grund=inaktiv`); beim Anmelden setzen. In Supabase (Pro) Inactivity Timeout 60 min und eine Time-box (z. B. 12 h) einstellen. Matcher nur auf `/_next/static`, `/_next/image` und konkrete Dateien in `public/`. |
| M6 | F15, F39 | **Offene Weiterleitung über `?weiter=`.** `sicheresZiel` lässt Tab und Zeilenumbruch durch (`/%09/fremd.example`), der Browser entfernt sie und wertet `//fremd.example` aus. Phishing nach der Zwei-Faktor-Anmeldung. | Steuerzeichen und Backslash ablehnen, Ziel per `new URL(ziel, "https://intern.invalid")` prüfen (gleiche Herkunft), `pathname + search` zurückgeben. Unit-Tests mit `//x`, `/\x`, `/\t/x`, `/\n/x`, `https://x`. |
| M7 | F80 (F20, F136, F137) | **Schutz gegen viele Anmeldeversuche nur über die IP-Grenze von Supabase.** Die Anmeldung läuft serverseitig, Supabase sieht nur die Vercel-IP. Ein Angreifer kann so die Anmeldung für alle sperren, verteilte Versuche werden je Konto nicht gebremst. Der zweite Faktor mindert das Risiko einer Übernahme. | Drosselung je E-Mail-Adresse in der Anmelde-Aktion (z. B. 10 Fehlversuche → 15 min Sperre) oder die Supabase-Hooks `password_verification_attempt`/`mfa_verification_attempt`. Grenzen im Dashboard ablesen und in `docs/uebergabe.md` festhalten. Optional Captcha mit EU-Anbieter. |
| M8 | F79 (F03, F21) | **Schutz vor geleakten Passwörtern (HaveIBeenPwned) ist aus** (Advisor-WARN). | In Staging und Produktion aktivieren (Pro-Tarif, steht auf der Go-live-Liste), in `supabase/config.toml` und `docs/uebergabe.md` festhalten. |
| M9 | F62, F114 (F121) | **Staging hängt an Sawins echter SharePoint-Bibliothek** (dieselbe App-Registrierung wie Produktion) **und enthält Echtdaten aus Airtable.** Staging wird aber wie eine Testumgebung behandelt (Test-Admins, schwächere Einstellungen). | Eigene App-Registrierung für Staging, Preview und lokal mit einer Test-Bibliothek. Staging bis zum Go-live wie Produktion behandeln oder den Import pseudonymisieren. Entscheidung in AVV und `docs/uebergabe.md` festhalten. |

### Konzept CSP mit Nonce (M3)

Ziel-Policy für Produktion. `{N}` ist die Nonce je Anfrage, `{SB}` der Origin aus `NEXT_PUBLIC_SUPABASE_URL` (nie fest im
Code):

```
default-src 'self'; script-src 'self' 'nonce-{N}' 'strict-dynamic'; style-src 'self' 'unsafe-inline';
img-src 'self' data: blob: {SB}; font-src 'self'; connect-src 'self' {SB}; frame-src 'self' blob:;
worker-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none';
upgrade-insecure-requests
```

- Für `/pdf/*` gilt `frame-ancestors 'self'`.
- In der Entwicklung braucht `script-src` zusätzlich `'unsafe-eval'`.

Umsetzung:
- Die Nonce entsteht im Proxy (`src/proxy.ts`). Er setzt sie als Anfrage-Header (`x-nonce` und `Content-Security-Policy`)
  und als Antwort-Header. Next.js versieht seine eigenen Skripte dann automatisch mit der Nonce.
- Das Darstellungs-Skript im `<head>` (`src/app/layout.tsx`) liest die Nonce über `headers()` und setzt sie als Attribut.

Abwägung:
- Mit Nonce muss jede Seite dynamisch gerendert werden. Das betrifft die vorgerenderten Shells von `cacheComponents` und
  `partialPrefetching` aus Block 6 („Seitenwechsel“): Die Sofort-Anzeige des Platzhalters entfiele teilweise.
- Alternative ohne diesen Verlust: Hash-basierte CSP (`'sha256-…'` für das feste Darstellungs-Skript) mit `script-src
  'self'` für die Next-Bundles. Das gilt aber nur, wenn Next keine weiteren Inline-Skripte erzeugt; die Flight-Daten der
  RSC kommen als Inline-Skripte.
- Vor der Umsetzung im Browser messen. Entscheidung offen, siehe `docs/status.md`.

## Offene Funde: niedrig

Doppelte Funde aus verschiedenen Prüfbereichen sind einzeln aufgeführt (z. B. F19 = F36 = F57: Abmelden per GET).

| ID | Fund | Vorschlag |
|---|---|---|
| F03 | Schutz vor geleakten Passwörtern (HaveIBeenPwned) in Supabase Auth ist auf Staging aus | Im Pro-Tarif unter Auth › Passwords aktivieren, auf Staging und Produktion. Danach die Advisors erneut prüfen und das in docs/uebergabe.md als manuellen Schritt festhalten. |
| F04 | Benachrichtigungen lassen sich an beliebige Empfänger mit frei gewähltem Text und Link anlegen | CHECK-Constraint `link IS NULL OR link ~ '^/[^/\\]'` (nur relative App-Pfade). Erwähnungen über eine Server-Funktion anlegen (art fest 'erwaehnung', Text vom Server gebildet) und INSERT für authenticated auf benutzer_id = auth.uid() beschränken, oder ganz entziehen. |
| ~~F05~~ | **behoben:** Abgelehnter oder beantragter Urlaub wird durch Umstellen der Art auf „krank“ ohne Admin genehmigt | Im Trigger einen Wechsel der Art von nicht-krank auf krank bei UPDATE durch Nicht-Admins ablehnen, wenn old.status = 'abgelehnt' (oder allgemein). Für die Krankmeldung einen neuen Eintrag verlangen. Dazu einen RLS-Test ergänzen. |
| F06 | historie('konto', <Benutzer-ID>) gibt Konto-Ereignisse anderer Benutzer an jeden Benutzer heraus | In app.historie 'konto' in die Liste der Admin-Tabellen aufnehmen, oder nur den eigenen Datensatz (p_id = auth.uid()) zulassen. Dazu ein Test. |
| F07 | SECURITY-DEFINER-Funktionen im Schema app sind für PUBLIC ausführbar und prüfen teils keine Berechtigung | `revoke execute on all functions in schema app from public;` und gezielt nur an authenticated bzw. service_role geben, was Policies brauchen (ist_benutzer, ist_admin, darf_konditionen, handelnder, naechste_nummer, loeschen, historie, beleg_bearbeitbar). |
| F08 | Tabelle app.basis ohne RLS und ohne Primärschlüssel | RLS auf app.basis aktivieren oder die Vorlage durch eine Funktion bzw. Domain ersetzen und die Tabelle entfernen. |
| F09 | Standardrechte im Schema public geben authenticated unnötig REFERENCES, TRIGGER und MAINTAIN | `alter default privileges for role postgres in schema public revoke references, trigger, maintain on tables from authenticated;` und auf den bestehenden Tabellen MAINTAIN, REFERENCES und TRIGGER für authenticated entziehen. Die Advisors danach erneut prüfen. |
| F16 | Passwortwechsel ohne aktuelles Passwort über /passwort-setzen (passwortSetzen), ohne Abmelden anderer Sitzungen und ohne Audit-Eintrag | passwortSetzen nur kurz nach linkEinloesen erlauben, z. B. über ein signiertes, httpOnly-Kurzzeit-Cookie (10 Minuten), das linkEinloesen setzt und passwortSetzen verbraucht. Alternativ prüfen, dass die Sitzung per otp/recovery entstanden ist (amr-Claim 'otp' bzw. 'recovery'). |
| F18 | Supabase-Auth-Cookies ohne HttpOnly und ohne Secure (Standard von @supabase/ssr), Laufzeit 400 Tage | In createServerClient (server.ts und proxy.ts) cookieOptions: { httpOnly: true, secure: true (außer lokal über http), sameSite: 'lax' } setzen und maxAge auf die Sitzungsdauer begrenzen (z. B. 12 h). Optional ein Cookie-Präfix __Host- über cookieOptions.name. Danach Anmeldung, Refresh im Proxy und Abmelden testen. |
| F19 | Abmelden per GET auslösbar (Logout-CSRF) | GET nur für die Abmeldegründe inaktiv und gesperrt zulassen, oder per GET eine Bestätigungsseite mit POST-Formular zeigen. Alternativ GET nur mit Sec-Fetch-Site: same-origin akzeptieren. |
| F20 | Schutz gegen viele Anmeldeversuche nur über die IP-Ratenbegrenzung von Supabase, die auf die Server-IP wirkt; keine kontobezogene Sperre | Eine eigene Begrenzung je Konto und Client-IP vor signInWithPassword und mfa.verify einbauen (z. B. Tabelle mit Zählern oder Vercel KV; 5 Fehlversuche je Konto in 15 min, dann Wartezeit). Fehlversuche protokollieren. Die gehosteten Ratenlimits in Supabase › Auth › Rate Limits prüfen und in docs/uebergabe.md festhalten. |
| F21 | Passwortregeln erzwingen Zeichenklassen; Prüfung gegen geleakte Passwörter ist aus | Mit dem Pro-Tarif die Leaked Password Protection aktivieren (steht schon in den Go-live-Kriterien). Die Zeichenklassen-Pflicht durch Mindestlänge 12 plus eine Sperrliste häufiger Passwörter ersetzen (lokal, z. B. Top 10.000, plus Firmenname und E-Mail). Bis zu 64 Zeichen zulassen; bcrypt nutzt nur die ersten 72 Byte. |
| F22 | Zwei-Faktor-Zurücksetzen und Anmeldesperre ohne Audit-Eintrag in der App | Nach erfolgreichem Zurücksetzen konto_ereignis(p_benutzer: Ziel, p_art: 'zweiter_faktor_zurueckgesetzt', p_daten: { durch: admin.id }) schreiben, ebenso für Sperre und Entsperren. Anmeldungen und Fehlversuche optional aus auth.audit_log_entries auswerten. |
| F23 | Hinweis: Lexware- und OneDrive-Fehlertexte gehen ungefiltert an den Client | Im Prüfbereich Fehlermeldungen klären, ob die Exception-Texte von lexware()/graph() bereinigt sind. Sonst feste Meldungen zurückgeben und den Detailtext nur serverseitig loggen. |
| F25 | Keine automatische Geheimnis-Prüfung in Repository und CI | In den GitHub-Einstellungen Secret Scanning und Push Protection einschalten. Zusätzlich einen kleinen Workflow mit gitleaks (Version gepinnt) auf Push und PR einrichten. Beides in docs/uebergabe.md festhalten, damit der Kunde es nach der Übergabe behält. |
| F26 | .gitignore deckt nur *.pem ab, keine anderen Schlüsseldateien | In .gitignore ergänzen: *.key, *.p12, *.pfx, *.crt-Schlüsselpaare, *credentials*.json, *service-account*.json, .env.keys. |
| F27 | Personenbezogene Daten (Kundenname) in Server-Logs der OneDrive-Ablage | Im Log nur die interne ID bzw. die Belegnummer ausgeben, z. B. `OneDrive: Ordner ${o.id}`. Der Name steht ohnehin im Fehlerfeld der Tabelle (ordnerSetzen …fehler). |
| F28 | MS_GRAPH_BASIS / MS_LOGIN_BASIS lenken das Client-Secret auf beliebigen Host | Die Überschreibung nur zulassen, wenn VERCEL_ENV nicht „production“ ist bzw. der Host localhost/127.0.0.1 ist. Andernfalls die Variable ignorieren oder einen Fehler werfen. |
| F32 | Lexware-Webhook prüft die organizationId nicht gegen das eigene Lexware-Konto | Die organizationId des eigenen Kontos beim Einrichten über GET /v1/profile in einstellung speichern (oder als LEXWARE_ORGANISATION_ID setzen). Ereignisse mit abweichender organizationId mit 200 beantworten, aber ohne DB-Eintrag verwerfen. Dazu einen Unit-Test schreiben. |
| F33 | Webhook liest den Body vollständig vor der Größenprüfung, ohne Ratenbegrenzung, mit einem Log-Eintrag je ungültiger Anfrage | Den Content-Length-Header vorab prüfen und den Stream mit Abbruch bei 16 KB lesen (Bytes zählen). Ungültige Signaturen gedrosselt oder zusammengefasst loggen. In der Vercel-Firewall eine Ratenbegrenzung für /api/lexware/webhook und /api/cron/* setzen. |
| F34 | Ablage-Cron ohne Laufsperre: parallele Läufe können eine erfolgreich abgelegte Datei als ‚fehler‘ markieren | Die Zeilen atomar beanspruchen, etwa über eine Funktion ablage_dateien_beanspruchen mit UPDATE … SET status='laeuft' … WHERE id IN (SELECT … FOR UPDATE SKIP LOCKED) RETURNING. Alternativ eine globale Laufsperre wie bei lexware_abgleich_beginnen (pg_try_advisory_xact_lock bzw. Spalte ‚läuft bis‘). |
| F35 | Maschinen-Pfade werden per Präfix freigegeben, künftige Routen unter /api/cron/ und /api/lexware/ wären ohne Vorprüfung erreichbar | MASCHINEN_PFADE auf die exakten Pfade beschränken (/api/cron/zahlungsabgleich, /api/cron/ablage, /api/lexware/webhook) oder einen Unit-Test ergänzen, der alle route.ts unter src/app/api/ aufzählt und verlangt, dass jede cronErlaubt bzw. signaturGueltig aufruft. |
| F36 | Abmelden per GET ist cross-site auslösbar (Logout-CSRF) | GET nur zulassen, wenn Sec-Fetch-Site ‚same-origin‘ oder ‚none‘ ist (die Umleitung des Proxys bei Inaktivität ist same-origin). Sonst auf /anmelden umleiten, ohne abzumelden. Der Knopf nutzt bereits POST. |
| F40 | Interne Fehlermeldungen (Supabase/Postgres, teils Lexware) werden an den Browser zurückgegeben | In den Ablage- und Abwesenheits-Aktionen die zentrale Funktion `meldung()` aus beleg-eingabe.ts verwenden bzw. eigene Fehlerklasse (z. B. `NutzerFehler`) nur für bewusst formulierte Texte durchreichen; alle anderen Fehler serverseitig loggen und eine allgemeine Meldung zurückgeben. |
| ~~F41~~ | **behoben:** Admin-Einstellungen (Go-live-Datum, OneDrive-Verbindung) nur im Server-Code geschützt, RLS erlaubt jedem Benutzer das Ändern | BEFORE-UPDATE-Trigger auf einstellung, der Änderungen an golive_datum und onedrive_* nur bei app.ist_admin() (oder Service-Rolle) zulässt, analog zu kunde_lexware_schutz; mit Policy-Test (Nicht-Admin-JWT → 42501) absichern. |
| F42 | app.loeschen (SECURITY DEFINER) umgeht die gesperrte Update-Policy von ablage_datei und ablage_ordner | In app.loeschen eine Positivliste der Tabellen führen, die der Benutzer löschen darf (die 18 in der App genutzten), statt einer Ausschlussliste; mindestens ablage_datei, ablage_ordner, beleg_versand_gruppe, beleg_anhang, chat_gelesen ergänzen. Policy-Test hinzufügen. |
| F43 | HTML-Bereinigung und URL-Prüfung nur in den Server-Aktionen, Datenbank nimmt beliebige Werte an | CHECK-Constraints: konfigurator_url/haendlerportal_url ~ '^https?://' (oder NULL/leer); onedrive_basis_url/web_url analog. Für beschreibung_html einen BEFORE-Trigger, der Tags außerhalb der Whitelist ablehnt (z. B. Regex auf '<(?!/?(b|strong|i|em|u|ul|ol|li|p|br|span)\b)'), oder vor jeder Ausgabe erneut htmlBereinigen anwenden. |
| F44 | Supabase-Sitzungscookies ohne HttpOnly | In server.ts und im Client von proxy.ts `cookieOptions: { httpOnly: true, secure: true, sameSite: 'lax', path: '/' }` setzen und danach Anmeldung, Token-Erneuerung und Abmelden testen. |
| F45 | Keine Längenbegrenzung für viele Freitextfelder | Einheitliche Hilfsfunktion text(fd, name, max) mit sinnvollen Grenzen (Titel 200, Notizen 4000) in allen Aktionen und CHECK (char_length(x) <= n) in der Datenbank. |
| F46 | Upload-Vorbereitung ohne Mengenbegrenzung und ohne Aufräumen nicht abgeschlossener Uploads | Cron (z. B. in /api/cron/ablage), der Zeilen mit Status 'upload' und Chat-Pfade ohne Nachricht nach 24 h entfernt; optional einfache Begrenzung je Benutzer und Stunde. |
| F56 | Cross-Origin-Opener-Policy (und Cross-Origin-Resource-Policy) fehlen | In securityHeaders ergänzen: { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' } und { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' }. Verträglich mit window.open('', '_blank') + location.href auf /pdf/formular/… (formulare/ui.tsx:60-67, formulare/[id]/editor.tsx:133-135), weil das Ziel dieselbe Herkunft hat … |
| F57 | Abmelden auch per GET (Logout-CSRF) | Bei GET nur abmelden, wenn der Aufruf von der eigenen Seite kommt: Sec-Fetch-Site gleich 'same-origin' bzw. 'none'. Sonst auf / umleiten. Den Inaktivitäts-Weg (window.location.assign('/abmelden?grund=inaktiv') in inaktivitaet.tsx:52) und die Weiterleitung aus dem Proxy (proxy.ts:47-51) betrifft das nicht, beide sind same-origin. |
| F58 | Kein Clear-Site-Data beim Abmelden | Auf der Antwort von /abmelden den Header Clear-Site-Data: "cache", "storage" setzen. Hinweis: "storage" löscht auch die Darstellung im localStorage, nach der nächsten Anmeldung gleicht die App sie aus der Datenbank ab (kurzes Aufflackern). |
| F63 | Lexware-Webhook prüft die organizationId nicht gegen das eigene Lexware-Konto | Die eigene organizationId einmal aus GET /v1/profile lesen und zwischenspeichern (z. B. in einstellung, nur über die Service-Rolle) oder als LEXWARE_ORGANISATION_ID setzen. Ereignisse anderer Organisationen ohne Verarbeitung mit 200 „ignoriert“ beantworten und als Unit-Test absichern. |
| F64 | Graph-Client: Adressen über Umgebungsvariablen umlenkbar, Token wird an beliebige absolute Adressen geschickt | Die Umlenkung nur zulassen, wenn NODE_ENV nicht „production“ ist bzw. VERCEL_ENV fehlt, oder nur auf 127.0.0.1/localhost. Bei absoluten Adressen in graph() den Host gegen eine Allowlist prüfen (graph.microsoft.com, *.sharepoint.com für Upload-Sitzungen), https erzwingen und an Nicht-Graph-Hosts nie den Authorization-Header sende … |
| F65 | Drive- und Item-IDs werden ohne encodeURIComponent in Graph-Pfade eingesetzt | IDs vor dem Einsetzen mit encodeURIComponent kodieren oder auf das Graph-Format prüfen (z. B. /^[A-Za-z0-9!_\-]+$/). Zusätzlich CHECK-Constraints auf einstellung.onedrive_drive_id und onedrive_basis_id sowie auf ablage_ordner.drive_id und item_id setzen. |
| F66 | Interne Datenbank-Fehlermeldungen der Ablage gelangen bis in die Oberfläche | Technische Fehlermeldungen nur serverseitig protokollieren (console.error) und dem Client einen allgemeinen Text mit Fehlerkennung geben, z. B. „Die Ablage ist gerade nicht möglich (Fehler A-123)“. Graph-Meldungen aus GraphFehler sind schon allgemein formuliert und können bleiben. |
| F70 | Next.js 16.4.2 ohne die Sicherheitsversion 16.4.5 (7 Advisories vom 03.11.2026), npm audit zeigt sie nicht an | next und eslint-config-next auf 16.4.6 heben (Patch-Version, LTS-Backports, keine Breaking Changes laut Release Notes). Danach lint, tsc, build und die Tests ausführen. |
| F71 | Keine festgelegten Fristen für Sicherheitsupdates von Abhängigkeiten dokumentiert | In docs/sicherheit.md bzw. docs/uebergabe.md Fristen festlegen, z. B. kritisch 48 h, hoch 7 Tage, mittel 30 Tage, sonst im wöchentlichen Update-Bündel. Dazu die Quellen nennen: npm audit, Dependabot-Alerts, GitHub-Advisories von Next/React/Supabase. |
| F72 | Moderate npm-audit-Befunde in Entwicklungsabhängigkeiten (typescript-eslint → minimatch, ReDoS) | Mit dem Next-Update eslint-config-next auf 16.4.6 heben oder npm audit fix ohne --force ausführen. Danach npm audit erneut prüfen und lint ausführen. |
| F74 | Keine CI-Prüfung (GitHub Actions) für Audit, Lint und Build | Optional einen Workflow anlegen: on: pull_request (nicht pull_request_target), permissions: contents: read, mit npm ci, npm run lint, npx tsc --noEmit, npm run test:unit und npm audit --omit=dev --audit-level=high. Keine Secrets im Workflow. |
| F82 | Sitzungen bei Supabase ohne Inaktivitäts- und Höchstdauer (sessions_timebox = 0, sessions_inactivity_timeout = 0); 60-Minuten-Abmeldung nur in der App | Unter Authentication › Sessions in Staging und Produktion „Inactivity timeout“ = 60 min und eine Höchstdauer (z. B. „Time-box“ 12 h) setzen und als Code in supabase/config.toml ([auth.sessions] inactivity_timeout = "1h", timebox = "12h") hinterlegen, dann `npm run auth:push`. docs/uebergabe.md entsprechend ergänzen. |
| F83 | Kein eigener SMTP-Zugang für Auth-E-Mails (Go-live-Kriterium offen) | Vor dem Go-live SMTP des Betriebs (z. B. Microsoft 365, SPF/DKIM/DMARC der Domain) unter Authentication › Emails › SMTP eintragen, Passwort nur im Dashboard bzw. per env() in config.toml; rate_limit_email_sent danach angemessen erhöhen; Einladung und Passwort-Reset testen. |
| F84 | Backups/PITR und Wiederherstellungstest nicht belegt und nicht in der Übergabe-Anleitung beschrieben | Für das Produktionsprojekt PITR (Add-on) aktivieren, Wiederherstellung einmal in ein Testprojekt üben und Ablauf, Aufbewahrungsdauer und Zuständigkeit in docs/uebergabe.md aufnehmen. |
| F85 | Advisor-Lücken in der Übergabe-Dokumentation: Leaked-Password-Schutz, Sitzungs-Höchstdauer und PITR fehlen in „Manuelle Einstellungen je Supabase-Projekt“ | Checkliste in docs/uebergabe.md ergänzen (Leaked-Password-Schutz, Sessions inactivity 60 min + timebox, PITR, SMTP, Rate Limits, Advisors ohne WARN) und, wo möglich, in supabase/config.toml als Code führen. |
| F86 | Bucket „ablage-puffer“ ohne Beschränkung der MIME-Typen (nur 50 MiB-Grenze) | allowed_mime_types des Buckets auf die erlaubten Typen (PDF, JPEG, PNG, HEIC/HEIF, docx, xlsx) setzen (per Migration) und verwaiste Uploads mit Status „upload“ älter als 24 h über den Cron /api/cron/ablage entfernen. |
| F87 | Tabelle app.basis ohne RLS (Advisor no_primary_key, INFO) | Per Migration `alter table app.basis enable row level security;` (ohne Policies) setzen oder die Vorlage durch einen zusammengesetzten Typ/Domain ersetzen; Performance-Hinweis ist dann gegenstandslos. |
| F95 | Server-Actions geben ungefilterte Ausnahmetexte (Postgres-, Storage- und JS-Fehler) an den Browser zurück | Wie in src/lib/beleg-eingabe.ts:16-21 (`meldung()`, filtert auf eigene SQLSTATEs und /violates|policy|permission denied/) eine zentrale Funktion `nutzerMeldung(e, standard)` einführen: nur bekannte Fehlerklassen (GraphFehler, LexwareFehler, eigene RAISE-Texte) durchreichen, alles andere serverseitig per console.error protokollie … |
| F96 | Durchreichen von DB-Fehlertexten allein nach SQLSTATE, ohne Filter auf native Postgres-Meldungen | Überall die vorhandene Funktion `meldung()` aus src/lib/beleg-eingabe.ts (in eine allgemeine Datei verschieben) verwenden statt eigener Ternaries. |
| F97 | Sicherheitsrelevante Admin- und Zugangsereignisse fehlen im App-Audit-Log; Cron-Aufrufe ohne Secret werden nicht protokolliert | konto_ereignis aufrufen für mfa_zurueckgesetzt (mit handelndem Admin in p_daten), einladung_erneut, benutzer_gesperrt/entsperrt. In den Cron-Routen bei 401 `console.warn('Cron: ungültiges Secret')` ohne Header-Inhalt. Für Produktion (Pro-Tarif) Log-Drain bzw. |
| F98 | Personenbezogene Daten (Kundennamen) in Server-Logs | In Logs nur die Ordner-/Datei-ID (o.id, id) statt Name ausgeben; der Name steht ohnehin in ablage_ordner/ablage_datei.fehler. |
| F99 | Lesezugriffe und Direktzugriffe als Datenbank-Owner werden nicht protokolliert; Audit-Log nur über Rechte geschützt | pgaudit (in Supabase verfügbar) für Rolle postgres/supabase_admin mit log='read,write' auf Fachtabellen aktivieren oder Dashboard-Zugriffe organisatorisch dokumentieren. Zusätzlich BEFORE UPDATE OR DELETE OR TRUNCATE-Trigger auf audit.log, der immer eine Ausnahme wirft (append-only), und regelmäßiger Export/Log-Drain. |
| F105 | beleg_version und beleg_versand: Jeder Benutzer kann eingefrorene Versionen und Versandprotokolle direkt einfügen und dabei eingefroren_von bzw. gesendet_von fälschen | INSERT-Policy auf beleg_version und beleg_versand auf false setzen. Die Funktionen beleg_uebergeben und beleg_versenden schreiben dann als SECURITY DEFINER mit festem search_path und mit eigener Prüfung ist_benutzer(). Alternativ ein BEFORE-INSERT-Trigger, der ohne Vorgang 'uebergeben' bzw. |
| F106 | Eingefrorene (versendete) Angebote und ABs lassen sich per PATCH ohne neue Version, ohne Datum heute und mit anderem Auftrag bzw. Kunden ändern | In beleg_sperre bei old.status <> 'entwurf' Änderungen außerhalb von v_frei nur erlauben, wenn current_setting('app.beleg_vorgang') = 'speichern' ist. Damit laufen alle Inhaltsänderungen über beleg_speichern. Dasselbe in position_sperre. |
| F107 | Direktes INSERT in zahlung umgeht die Prüfungen von zahlung_erfassen (Belegart, Status, Betrag ≤ offen, Datum ≤ heute) | Die Prüfungen aus zahlung_erfassen in app.zahlung_regeln (BEFORE INSERT) übernehmen: Beleg ist Rechnung oder Abschlag mit Status 'offen', betrag ≤ coalesce(offen_betrag, summe_brutto), datum ≤ heute. Oder die INSERT-Policy auf false setzen und zahlung_erfassen als SECURITY DEFINER schreiben lassen. |
| F108 | beleg_speichern übernimmt Summen und HTML ungeprüft vom Aufrufer; die Validierung liegt nur in Next.js (beleg-eingabe.ts) und lässt sich per direktem RPC umgehen | Summen in beleg_speichern aus den Positionen berechnen (wie beleg-summen.ts) oder per Trigger nachrechnen. Für beschreibung_html in der Datenbank eine Whitelist erzwingen, z. B. eine CHECK-Funktion, die nur erlaubte Tags zulässt, oder das Speichern nur über die Server-Action mit Service-Rolle erlauben. |
| F112 | Keine harte Sperre gegen Nicht-Staging in Tests und Betriebsskripten: Ziel ist allein .env.local | Gemeinsame Hilfe anlegen, z. B. scripts/umgebung.mjs mit Funktion nurStaging(): Ref aus NEXT_PUBLIC_SUPABASE_URL lesen, Ref aus SUPABASE_DB_URL ebenfalls (Pooler-Benutzer postgres.<ref> bzw. Host db.<ref>), beide gegen eine Variable ERLAUBTES_TESTPROJEKT (Staging-Ref) prüfen, sonst abbrechen. |
| F113 | Lexware: keine Bindung an das Testkonto (organizationId) in Tests und App | Variable LEXWARE_TEST_ORGANISATION (organizationId des Testkontos „Musterfirma“) einführen. Alle Lexware-Tests, scripts/lexware-webhook.mjs und golive-pruefung lesen vor dem ersten Schreibzugriff /v1/profile und brechen ab, wenn organizationId nicht übereinstimmt (bei Tests) bzw. |
| F115 | 22 verwaiste, aktive Test-Admins mit bestätigtem TOTP und 44 gültigen aal2-Sitzungen auf Staging | Die 22 Konten löschen, mit Lucas Freigabe auf Staging, über die DB-Verbindung erst benutzer_einstellung und benutzer, dann auth.admin.deleteUser. uebergang.e2e.mjs im finally um await aufraeumen() ergänzen. Zusätzlich ein Aufräumschritt am Anfang von hilfen.mjs bzw. |
| F116 | staging-leeren und airtable-import prüfen --projekt nur gegen die API-URL, geschrieben wird aber über SUPABASE_DB_URL; keine feste Staging-Zulassung | Ref zusätzlich aus SUPABASE_DB_URL lesen (Benutzer postgres.<ref> beim Pooler, Host db.<ref>.supabase.co direkt) und Gleichheit verlangen. staging-leeren nur zulassen, wenn die Ref gleich ERLAUBTES_TESTPROJEKT ist (Allowlist statt Blocklist). audit.log vor dem Leeren exportieren oder nicht leeren. |
| F117 | passwort-setzen.mjs: kein Audit-Eintrag mit handelnder Person, andere Sitzungen bleiben gültig | Nach dem Setzen alle Sitzungen des Benutzers beenden (z. B. über die DB-Verbindung delete from auth.sessions where user_id=… oder eine Admin-Abmeldung) und einen Eintrag in konto_ereignis schreiben (Art „passwort_admin“, Ausführender aus os.userInfo bzw. Pflichtargument --durch=<Name>). Optional --env unterstützen. |
| F122 | Dokumentation: Pflicht „Werkzeuge und Tests nur gegen Staging“ unvollständig, Umstellung von .env.local für Produktion nicht geregelt | In .env.example und docs/uebergabe.md einen Abschnitt „Umgebungen“ ergänzen: .env.local = immer Staging, Produktion nur über --env=.env.produktion; welche Befehle Produktion berühren dürfen; Tests und staging:leeren brechen außerhalb der Staging-Ref ab, sobald der Vorschlag aus Fund 1 umgesetzt ist. |
| F123 | Proxy-Matcher lässt dynamische Routen und Server-Aktionen mit Bild- oder Schriftendung ungeprüft durch, die 60-Minuten-Inaktivitätsgrenze greift dort nicht | 1) Die Inaktivitätsprüfung zusätzlich in pruefeSitzung prüfen: AKTIV_COOKIE über cookies() lesen und bei Überschreitung redirect('/abmelden?grund=inaktiv') auslösen. Dann gilt sie für jede Seite, jeden Route-Handler und jede Server-Aktion, unabhängig vom Matcher. |
| F124 | HTML-Seiten des App-Bereichs kommen auf Vercel mit „Cache-Control: public, max-age=0, must-revalidate“ statt „private, no-store“ | Im Proxy für angemeldete, nicht öffentliche Pfade `response.headers.set('Cache-Control', 'private, no-store')` setzen (ggf. auch auf der Umleitung). Alternativ einen headers()-Eintrag in next.config.ts für alle Pfade außer _next/static, _next/image, favicon.ico und brand/. |
| F125 | PDF-Route /pdf/beleg/[id] prüft die Sitzung nicht am Anfang, der Schutz liegt nur im Datenzugriff | In allen Route-Handlern `await pruefeSitzung()` als erste Anweisung aufrufen, wie in pdf/formular (Zeile 14), pdf/wochenplan (Zeile 15) und pdf/vorschau (Zeile 13). Die Prüfung in Zeile 54 kann dann entfallen. |
| F128 | chat_nachricht.foto_pfad ohne Prüfung in der Datenbank: Server-Prüfung des Fotos lässt sich per direktem INSERT umgehen | In einer Migration einen CHECK ergänzen: chat_nachricht.foto_pfad IS NULL OR foto_pfad ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/foto$'. Besser ist, INSERT auf chat_nachricht für authenticated zu entziehen und Nachrichten nur über die Server-Action mit der Service-Rolle oder über eine SECURITY-DEFINER-Funk … |
| F129 | Signierte Lese-URLs für Chat-Fotos gelten 60 Minuten und lassen sich nicht widerrufen | Die Laufzeit auf 5 bis 10 Minuten senken. Der Chat lädt bei jeder Änderung ohnehin neu und fragt alle 10 Sekunden den Stand ab. Alternativ die Fotos über eine eigene Route der App ausliefern, etwa /api/chat/foto/[id]. |
| F130 | Upload-URLs ohne Bindung an einen Vorgang und ohne Aufräumen: Speicher lässt sich mit verwaisten Dateien füllen | Einen Aufräum-Cron einführen, zum Beispiel im bestehenden /api/cron/ablage. Er entfernt Objekte in chat-fotos ohne Nachricht, die älter als 3 Stunden sind, sowie ablage_datei-Zeilen mit status 'upload', die älter als 3 Stunden sind, samt Objekt. Das Löschen geschieht als Markierung, das Objekt wird entfernt. |
| F132 | Fehlertext der Speicher-API wird beim Vorbereiten eines Ablage-Uploads an den Client weitergegeben | Die Storage-Meldung nur serverseitig protokollieren, ohne URL und Token. An den Client nur einen festen Text geben, etwa 'Der Upload konnte nicht vorbereitet werden.'. |
| F133 | Lexware-Aufrufe aus Benutzeraktionen ohne serverseitige Sperre; Drosselung nur je Server-Instanz | Eine serverseitige Sperre je Beleg in der Datenbank einführen, z. B. die Spalte `lexware_abruf_am` mit 30–60 s Mindestabstand, gesetzt per SECURITY-DEFINER-Funktion mit FOR UPDATE wie bei lexware_abgleich_beginnen. Zusätzlich ein globales Budget für Lexware-Aufrufe je Minute in Postgres führen, also über alle Instanzen hinweg. |
| F134 | lexwarePdfHolen holt das Original auch dann erneut, wenn es schon abgelegt ist | In lexwarePdfHolen bzw. lexwarePdfNachladen abbrechen, wenn d.beleg.pdf_pfad gesetzt ist. Erzwungenes Neuladen nur mit Mindestabstand erlauben, wie im Fund oben. |
| F135 | PDF-Vorschau (POST) ohne Body-Größengrenze und ohne Laufzeitgrenze | Vor request.json die Content-Length prüfen (z. B. höchstens 1 MB, wie bei Server-Actions) und sonst 413 antworten. `export const maxDuration = 30` in den PDF-Routen setzen. Optional die Summe der Beschreibungslängen je Beleg begrenzen. |
| F136 | Passwort ändern: Prüfanmeldung ohne eigene Begrenzung belastet die gemeinsame Supabase-IP-Grenze | Für Passwort ändern einen eigenen Zähler in der Datenbank führen, z. B. höchstens 5 Fehlversuche je Benutzer in 15 Minuten, danach Sperre bzw. Abmeldung und ein Eintrag in konto_ereignis. Für die allgemeine Lösung siehe den bekannten Fund: eine eigene Begrenzung je Konto bzw. Client-IP vor signInWithPassword. |
| F137 | „Passwort vergessen“ ohne Anmeldung kann das projektweite E-Mail-Kontingent von Supabase aufbrauchen | In der App eine Begrenzung je Adresse und global einbauen, z. B. eine Tabelle mit Zeitstempeln und höchstens 3 Anfragen je Adresse und Stunde. Mit eigenem SMTP das Limit `email_sent` passend setzen. Optional Supabase CAPTCHA (Turnstile/hCaptcha) für Recovery aktivieren. |
| F138 | OneDrive „Jetzt nachladen“ ohne Sperre gegen parallele bzw. schnell wiederholte Läufe | Wie bei lexware_abgleich_beginnen eine Sperre in der Datenbank verwenden (Zeitstempel in einstellung, FOR UPDATE, z. B. 60 s). Den Versuchszähler nur bei echten Übertragungsversuchen erhöhen und dabei einen zeitlichen Abstand zwischen den Versuchen erzwingen (Backoff). |

## Hinweise (info)

- **F10** ms_token: Service-Rolle hat kein SELECT, INSERT oder UPDATE, der Token-Zwischenspeicher bleibt leer. `grant select, insert, update on public.ms_token to service_role;` per Migration (nur an die Service-Rolle). Danach einen OneDrive-Lauf auf Staging machen und prüfen, dass wert nicht im Klartext gespeichert ist.
- **F11** Lücken in der RLS-Testsuite (tests/rls/rls.test.mjs). Die Testfälle (1)–(9) ergänzen, besonders eine Schleife über alle Tabellen der API für eine aal1-Sitzung (wie bei anon, Zeile 161) und über alle /rpc/-Pfade für anon und aal1.
- **F12** Kein FORCE ROW LEVEL SECURITY; lexware_ereignis ohne Audit-Trigger. So lassen; in docs/sicherheit.md als bewusste Entscheidung festhalten.
- **F24** Hinweis: Begrenzung der TOTP-Versuche und Sitzungs- und MFA-Werte des gehosteten Projekts nicht lesbar. Im Supabase-Dashboard (Staging und Produktion) Auth › Rate Limits und Sessions ablesen und in docs/sicherheit.md festhalten. Eigene Zählung der Fehlversuche bei codePruefen wie beim Passwort.
- **F29** Geheimnisse mit Zugriff auf Echtdaten im Klartext auf dem Entwicklungsrechner. Festplattenverschlüsselung des Rechners sicherstellen. Den Airtable-Token nach dem Go-live widerrufen. Die mit „sollte vor Übergabe erneuert werden“ markierten Schlüssel nach der Übergabe neu erzeugen.
- **F30** Geprüfter Build ist älter als HEAD; CRON_SECRET auf Vercel nicht prüfbar. Nach dem nächsten Build das Prüfskript erneut über .next/static laufen lassen (C:\Users\Luca\AppData\Local\Temp\claude\ccbc7bdcbfba5b5a\d4393bc0-1bd8-4aa7-8428-0c5762812a65\scratchpad\geheim-scan.mjs).
- **F37** Zahlungsabgleich per Cron ohne gegenseitigen Ausschluss; die Antwort ‚Abgleich läuft gerade‘ ist irreführend. Optional eine echte Laufsperre einbauen (pg_try_advisory_lock oder Spalte lexware_abgleich_laeuft_bis) und den Antworttext anpassen.
- **F38** Kein Test der Webhook- und Cron-Routen auf HTTP-Ebene. E2E- oder Route-Tests ergänzen: Webhook ohne, mit falscher und mit zu langer Signatur, Body über 16 KB, Cron ohne und mit falschem Bearer sowie bei leerem CRON_SECRET.
- **F47** Office-Dateien nur über ZIP-Signatur und Endung erkannt, PDFs ungeprüft auf aktive Inhalte. Optional: bei Office-Dateien den Eintrag '[Content_Types].xml' im ZIP prüfen; Hinweis in docs/sicherheit.md, dass OneDrive/Defender die Inhaltsprüfung übernimmt.
- **F48** Admin-Client in kontaktFestlegen liest auch gelöschte Kunden; gewählter Lexware-Kontakt nicht gegen die Kandidaten geprüft. Kunde über den RLS-Client laden (oder .is('deleted_at', null)) und wahl gegen die zuvor ermittelten Kandidaten prüfen.
- **F49** ?grund= akzeptiert Prototyp-Schlüssel (in-Operator). Object.hasOwn(ANMELDE_GRUENDE, grund) an beiden Stellen verwenden.
- **F50** Kürzen nach dem Bereinigen kann HTML-Tags zerschneiden. Bei Überlänge ablehnen oder den Rohtext vor dem Bereinigen kürzen und das Ergebnis erneut bereinigen.
- **F51** Keine Unit-Tests für die Filterbereinigung der Suche und für sicheresZiel. Tests: suchbegriff entfernt , ( ) " \ % *; sicheresZiel lehnt '//', '/\\', Steuerzeichen und absolute URLs ab.
- **F55** Access-Control-Allow-Origin: * auf vorgerenderten Seiten (Vercel-CDN). Mit der Nonce-CSP werden alle Seiten dynamisch und der Header sollte verschwinden. Nach der Umstellung live nachprüfen. Bleibt er, ihn über die Header-Konfiguration für HTML-Pfade nicht zulassen bzw. Vary/Cache prüfen.
- **F59** Cache-Control der angemeldeten HTML-Seiten nicht live geprüft. Nach der Anmeldung auf Staging die Header einer Fachseite (z. B. /kunden) prüfen und 'private, no-store' erwarten.
- **F60** HSTS mit „preload“: nur wirksam nach Eintragung, Domain-Entscheidung mit dem Kunden. So lassen. Beim Umzug auf eine Kunden-Domain (Übergabe) die Preload-Eintragung nur mit Zustimmung des Kunden vornehmen und in docs/uebergabe.md vermerken.
- **F67** Lexware-IDs und Ablage-Links haben in der Datenbank keine Formatprüfung. CHECK-Constraints ergänzen: lexware_id und lexware_kontakt_id ~* '^[0-9a-f-]{36}$', web_url und lexware_link ~* '^https://'. Alternativ prüft das Importskript die Formate.
- **F68** Upload-Adresse der Graph-Antwort wird serverseitig abgerufen (vertrauenswürdige Quelle). Optional den Host der uploadUrl gegen *.sharepoint.com bzw. graph.microsoft.com prüfen (siehe Fund zum Graph-Client).
- **F69** Drosselung der Lexware-Aufrufe gilt nur je Server-Instanz. Nur beobachten. Bei häufigen 429 eine Sperre in der Datenbank (z. B. pg_advisory_lock) oder eine Warteschlange einbauen.
- **F73** react und react-dom 19.3.0, Sicherheits-Release 19.3.1 vom 14.10.2026 nicht eingespielt. react und react-dom zusammen mit dem Next-Update auf 19.3.1 heben.
- **F75** Dependabot-Alerts und automatische Sicherheitsupdates im GitHub-Repository nicht nachprüfbar. In GitHub unter Settings → Code security 'Dependabot alerts' und 'Dependabot security updates' prüfen und einschalten. Offene Dependabot-PRs sichten, vor allem next.
- **F76** Keine Node-Version im Projekt festgelegt (engines, .nvmrc). "engines": { "node": "24.x" } in package.json setzen und in docs/uebergabe.md vermerken.
- **F77** sanitize-html 2.18.2 verfügbar (Inhalt unbekannt), bekannte 2026-Lücken für 2.18.1 nicht relevant. Im wöchentlichen Bündel auf 2.18.2 heben (Patch-Version). Die Unit-Tests zu htmlBereinigen danach ausführen.
- **F78** fontkit 2.0.4 (neue Hauptversion 3.0.0 verfügbar). Kein Handlungsbedarf aus Sicherheitssicht. Das Hauptversions-Update nur gezielt mit PDF-Tests einspielen.
- **F88** Advisor rls_enabled_no_policy (INFO) für audit.log und public.ms_token – beabsichtigt. So lassen. Optional eine ausdrückliche Policy `using (false)` oder einen Kommentar ergänzen, damit der INFO-Hinweis bewusst dokumentiert ist; in docs/sicherheit.md als „beabsichtigt“ vermerken.
- **F89** Advisor unused_index (INFO, 4 Indizes) und auth_db_connections_absolute (INFO). Indizes behalten und nach einigen Wochen Produktion erneut prüfen. Auth-Verbindungen auf Prozent-Zuteilung umstellen, falls die Instanzgröße erhöht wird.
- **F90** PostgREST-Fehlerhinweise verraten nicht angemeldeten Aufrufern Tabellen- und Funktionsnamen. Hinnehmen (Plattformverhalten) und in docs/sicherheit.md als bekannte Restabweichung vermerken.
- **F91** secure_password_change aus (security_update_password_require_reauthentication = false). `secure_password_change = true` setzen (Reauthentifizierung bei nicht frischer Anmeldung) und per `npm run auth:push` einspielen; den Recovery-Ablauf (passwortSetzen) danach erneut testen.
- **F92** Staging: 22 testartige Benutzer von heute, alle 23 Benutzer Admin, 45 aktive Sitzungen. Nach Abschluss der Prüfungen Testbenutzer entfernen (Skripte räumen per SUPABASE_DB_URL auf) und Sitzungen widerrufen;
- **F93** Redirect-Allowlist der Staging-Auth enthält localhost:3000; Site-URL ist eine vercel.app-Adresse. Beim Einrichten der Produktion nur die Produktionsdomain eintragen und in docs/uebergabe.md als Prüfpunkt aufnehmen.
- **F94** Persönliches Supabase-Access-Token liegt in .env.local (wirkt für alle Projekte der Organisation, auch Produktion). Token nur bei Bedarf setzen bzw. mit Ablaufdatum erzeugen; nach dem Go-live und vor der Übergabe widerrufen. Bei der Liste zu erneuernder Schlüssel berücksichtigen.
- **F100** Historie-Funktion gibt Konto-Ereignisse beliebiger Benutzer an alle Benutzer heraus. 'konto' in die Admin-Liste von app.historie aufnehmen (eigene Ereignisse ggf. zusätzlich für p_id = auth.uid()).
- **F101** Lexware-Fehlertexte aus der API-Antwort werden unverändert angezeigt. So belassen oder Rohtext auf eine Länge begrenzen; keine Änderung nötig für ASVS L1.
- **F102** Keine eigenen Fehlerseiten (error.tsx, global-error.tsx, not-found.tsx). src/app/(app)/error.tsx und src/app/global-error.tsx mit deutscher Meldung, Digest als Referenznummer und „Erneut versuchen“; optional instrumentation.ts mit onRequestError für einheitliches Logging (ohne PII).
- **F109** abzug_beleg_id an beleg_position wird in der Datenbank nur in beleg_speichern geprüft, nicht bei direktem INSERT/UPDATE. In position_sperre (bzw. in einem eigenen Trigger) prüfen: abzug_beleg_id nur bei art='rechnung' AND NOT teil, gleicher Auftrag, Abzugsbeleg ist Abschlag oder Teilrechnung und nicht Entwurf oder storniert.
- **F110** Funktionen im Schema app (naechste_nummer, zahlstand, auftrag_auto_abschluss) sind für authenticated ausführbar; erreichbar wären sie nur, wenn das Schema app über die API freigegeben würde. Im Supabase-Dashboard (API › Exposed schemas) für Staging und Produktion bestätigen, dass nur public und graphql_public freigegeben sind, und das in docs/uebergabe.md festhalten.
- **F111** Service-Ticket: „Abgerechnet“ lässt sich von Hand nicht setzen, aber wieder auf einen anderen Status zurücksetzen. Fachlich klären. Falls nicht gewollt, in ticket_regeln old.status='abgerechnet' AND new.status<>'abgerechnet' für auth.uid() IS NOT NULL ablehnen.
- **F118** admin-einladen.mjs: Anlage des Admins ohne handelnde Person im Audit-Log. Vor dem Insert app.handelnder bzw. einen Kommentar setzen (z. B. per RPC mit Parameter „durch“) oder einen konto_ereignis-Eintrag schreiben. Das Skript nur zulassen, wenn noch kein aktiver Admin existiert.
- **F119** supabase-db.mjs übergibt die DB-Verbindungszeichenkette mit Passwort als Kommandozeilenargument. Die Verbindung über die Umgebung übergeben (z. B. env: { ...process.env, SUPABASE_DB_PASSWORD } mit --db-url ohne Passwort bzw. PGPASSWORD) oder supabase link nutzen.
- **F120** Persönliches SUPABASE_ACCESS_TOKEN in .env.local mit kontoweiten Rechten. Token nur bei Bedarf setzen und danach widerrufen, oder ein Token mit Ablaufdatum verwenden. In docs/uebergabe.md vermerken. In die Liste der zu erneuernden Schlüssel aufnehmen, falls es länger in .env.local lag.
- **F121** Staging ist an Sawins echte SharePoint-Bibliothek angebunden (dieselbe Berechtigung wie Produktion). Für Staging eine eigene Test-Bibliothek oder eigene Website mit eigener Freigabe (Lists.SelectedOperations.Selected nur auf diese) verwenden. Bis dahin den Schutz in ablage.ts nicht lockern.
- **F126** Access-Control-Allow-Origin: * auf HTML- und RSC-Antworten (Vercel-Standard). Kann bleiben. Wer es strikter will, setzt im Proxy für App-Pfade keinen ACAO-Header bzw. entfernt ihn (`response.headers.delete('Access-Control-Allow-Origin')`) und prüft nach dem Deploy, ob Vercel ihn trotzdem ergänzt.
- **F127** Umgangene Pfade liefern ohne Anmeldung HTTP 200 mit Shell und Umleitung im Stream statt 307. Mit dem eingeengten Matcher aus Fund 1 erledigt.
- **F131** Realtime: öffentliche Broadcast- und Presence-Kanäle möglicherweise mit dem öffentlichen Schlüssel nutzbar (Projekteinstellung nicht per SQL prüfbar). In Staging und Produktion unter Realtime > Settings 'Allow public access' ausschalten (nur private Kanäle) und das in docs/uebergabe.md als manuellen Schritt festhalten.
- **F139** public.suche begrenzt die Länge des Suchbegriffs nur in der App, nicht in der Datenbank. In public.suche zusätzlich `if length(p_q) > 100 then p_q := left(p_q, 100)` setzen; bei wachsendem Datenbestand pg_trgm-Indizes für die ILIKE-Spalten anlegen.
- **F140** Keine ausdrückliche maxDuration bzw. kein Speicherlimit für PDF-Routen und Server-Actions. In den PDF-Routen `export const maxDuration = 30` bzw. 60 setzen. Für Seiten mit Lexware-Aktionen eine angemessene Grenze über das Segment festlegen.

## Nach Gegenprüfung verworfen

- **F13** chat_nachricht.foto_pfad und Bucket ablage-puffer ohne Einschränkung in der Datenbank: Ich halte den Fund in der beschriebenen Form für widerlegt. Die Beobachtungen stimmen zwar, der behauptete Angriff wird aber schon abgefangen. Ein eigener Fund bleibt nicht übrig, höchstens ein Härtungshinweis.
- **F31** Lokales Skript gibt vollständiges Fehlerobjekt aus: Der Beleg stimmt: In scripts/staging-leeren.mjs:103-106 gibt `catch (e) { await db.query("rollback")…; console.error(e); … }` das ganze Fehlerobjekt aus. Ein Sicherheitsfund ist das aber nicht, denn dabei wird keine Vertrauensgrenze überschritten.

## Schlüssel, die du erneuern musst

**Kein Schlüssel muss sofort erneuert werden.** Keiner wurde offengelegt: nicht in der Git-Historie (alle Branches, alle
Fassungen, einschließlich gelöschter Dateien geprüft), nicht im Client-Bundle und nicht in Logs. Eingecheckt wurde nur
`.env.example` mit leeren Werten.

Vor bzw. bei der Übergabe erneuern, weil du sie kennst oder weil sie über Echtdaten verfügen:

| Schlüssel | Dienst | Wann | Hinweis |
|---|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` (Secret Key) | Supabase Staging und Produktion | vor der Übergabe | neuen Secret Key anlegen, in Vercel setzen, alten widerrufen (neues Schlüsselformat, kein JWT-Secret-Wechsel nötig) |
| `SUPABASE_DB_URL` (Datenbankpasswort) | Supabase | vor der Übergabe | voller Datenbankzugriff am RLS vorbei |
| `SUPABASE_ACCESS_TOKEN` (persönlich, `sbp_`) | dein Supabase-Konto | nach der Übergabe widerrufen | wirkt für alle Projekte der Organisation, auch Produktion (F94, F120); nicht übergeben, deine Mitgliedschaft beenden |
| `MS_GRAPH_CLIENT_SECRET` | Microsoft Entra | vor der Übergabe, mit Ablaufdatum | hat Schreibzugriff auf Sawins echte Bibliothek und liegt auch für Staging auf deinem Rechner (M9) |
| `MS_TOKEN_SCHLUESSEL` | AES-Schlüssel des Graph-Tokens | vor der Übergabe | Wechsel unkritisch, das Token wird neu geholt |
| `CRON_SECRET` | Vercel-Cron | vor der Übergabe | von dir erzeugt |
| `LEXWARE_API_KEY` (Produktion) | Sawins Lexware | beim Go-live von Sawin selbst erzeugen lassen; falls du ihn gesehen hast, bei der Übergabe erneuern | Staging-Schlüssel (dein Testkonto) unkritisch |
| `AIRTABLE_TOKEN` | Airtable | nach der Übernahme widerrufen | so in `docs/uebergabe.md` vorgesehen |
| SMTP-Zugang der Auth-E-Mails | Supabase › Auth | vor der Übergabe, falls du ihn eingerichtet hast | Go-live-Kriterium |

In Ordnung, da öffentlich oder nur Kennungen: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
`NEXT_PUBLIC_CUSTOMER_ID`, `MS_GRAPH_TENANT_ID`, `MS_GRAPH_CLIENT_ID`, der öffentliche Lexware-Webhook-Schlüssel im Code.

## ASVS 5.0 Level 1: alle Anforderungen

Ergebnis: **41 erfüllt, 22 nicht erfüllt, 7 nicht relevant**.
- Durchgestrichene Fund-IDs sind behoben.
- V8.2.1, V8.3.1 und V2.3.1 bleiben trotzdem nicht erfüllt, wegen der übrigen Funde M1, M2 und der Niedrig-Funde zu
  Zustandsübergängen.
- V6.2.5 (keine Kompositionsregeln für Passwörter) widerspricht der bewusst festgelegten Passwortregel (Groß/klein,
  Ziffer) und ist eine Entscheidung (siehe `docs/status.md`).

| ID | Anforderung | Status | Begründung | Funde |
|---|---|---|---|---|
| V1.2.1 | Kontextgerechte Ausgabekodierung (HTML, Attribute, Header) | ✅ erfüllt | React escaped alle Text- und Attributwerte, dangerouslySetInnerHTML nur für die feste Konstante DARSTELLUNG_SKRIPT (layout.tsx:21). Dateinamen in Content-Disposition werden auf ASCII bereinigt und per encodeURIComponent als filename* gesetzt (pdf/beleg/[id]/route.ts:64, formular:25, wochenplan:31). |  |
| V1.2.2 | URL-Bestandteile kontextgerecht kodieren, nur sichere Protokolle | ❌ nicht erfüllt | Drive- und Item-IDs gehen ohne encodeURIComponent in Graph-Pfade, und eine davon kann jeder Benutzer schreiben (F65). Dazu kommt die offene Weiterleitung über ?weiter= mit Tab oder Zeilenumbruch (F15/F39). Lieferanten-URLs werden nur in der Server-Aktion auf https geprüft, die Datenbank prüft sie nicht (F43). | F65, F15, F39, F43 |
| V1.2.3 | Kodierung beim Erzeugen von JavaScript/JSON | ✅ erfüllt | JSON entsteht nur über Response.json bzw. JSON.stringify (z. B. api/cron/ablage/route.ts:13). Es gibt kein dynamisch gebautes Skript; das einzige Inline-Skript ist eine feste Konstante ohne Benutzerdaten. |  |
| V1.2.4 | Parametrisierte Datenbankabfragen, Schutz vor SQL-Injection | ✅ erfüllt | Laut den positiven Prüfergebnissen sind die PostgREST-Filter (.or/.ilike) gegen Injection geschützt, und dynamisches SQL in den Funktionen nutzt format('%I') mit $1-Parametern (app.loeschen). public.suche maskiert ILIKE-Platzhalter. Für die Filterbereinigung fehlen nur Unit-Tests (F51, info). | F51 |
| V1.2.5 | Schutz vor OS-Command-Injection | ✅ erfüllt | grep nach child_process, execSync und spawn( in src ergibt keinen Treffer. Nur das lokale Skript scripts/supabase-db.mjs ruft spawnSync mit einem Argument-Array ohne Shell auf, nicht mit Benutzereingaben. |  |
| V1.3.1 | HTML aus WYSIWYG-Editoren mit bewährter Bibliothek bereinigen | ❌ nicht erfüllt | htmlBereinigen (sanitize-html, enge Whitelist) läuft nur in der Server-Aktion. public.beleg_speichern speichert beschreibung_html bei direktem RPC-Aufruf unbereinigt, und die Datenbank hat keinen CHECK (F108, F43). Die Ausgabestellen sind derzeit sicher (TipTap, eigener PDF-Umsetzer). | F108, F43, F50 |
| V1.3.2 | Kein eval() bzw. keine dynamische Codeausführung | ✅ erfüllt | grep nach eval( und new Function( in src ergibt keinen Treffer. Das bestätigen die positiven Prüfergebnisse (header-csp: kein innerHTML, eval, new Function, document.write). |  |
| V1.5.1 | XML-Parser restriktiv konfiguriert (kein XXE) | ➖ nicht relevant | Die App parst kein XML: grep nach xml2js, fast-xml, DOMParser und xmldom in src und package.json ergibt nichts. Webhook und APIs arbeiten mit JSON. |  |
| V2.1.1 | Dokumentierte Regeln für die Eingabevalidierung | ✅ erfüllt | docs/datenmodell.md legt Prüfregeln fest: Status per CHECK (Zeile 20), Bezug genau einer (21), HTML-Whitelist (111), Einsatzfarbe plan-1…10 oder #RRGGBB, ende > beginn (128). CLAUDE.md nennt die Lexware-Grenzen, die Passwortregeln und die Upload-Typen und -Größen. |  |
| V2.2.1 | Eingaben gegen fachliche Erwartungen prüfen (Allowlist, Bereiche) | ❌ nicht erfüllt | Der Webhook vergleicht die organizationId nicht mit dem eigenen Konto (F32). Die Datenbank prüft chat_nachricht.foto_pfad nicht (F128). Viele Freitexte haben keine Längengrenze (F45), und /pdf/vorschau hat keine Body-Grenze (F135). | F32, F128, F45, F135, F49, F67, F139 |
| V2.2.2 | Validierung auf vertrauenswürdiger Serverschicht erzwingen | ❌ nicht erfüllt | Fachliche Prüfungen stehen nur in Next-Server-Aktionen bzw. RPCs, und PostgREST erreicht man direkt mit dem Benutzer-JWT. Ein direktes INSERT in zahlung umgeht zahlung_erfassen (F107). beleg_speichern übernimmt Summen und HTML ungeprüft (F108). Eine HTML- oder URL-Prüfung in der Datenbank fehlt (F43, F128). | F107, F108, F43, F128 |
| V2.3.1 | Geschäftsabläufe nur in vorgesehener Reihenfolge ohne Überspringen | ❌ nicht erfüllt | Über die Art „krank“ kann ein Nicht-Admin eine Abwesenheit ohne Genehmigung durch einen Admin auf „genehmigt“ setzen (F14/F05). Belegart, Kette und Vorgänger eines Entwurfs sind frei änderbar, und damit lässt sich die AB-Sperre umgehen (F104). Eingefrorene Versionen lassen sich ohne neue Version ändern (F106). | ~~F14~~ behoben, ~~F05~~ behoben, F104, F106, F103, F105, F107, F109, F111 |
| V3.2.1 | Inhalte nicht im falschen Kontext rendern (direkt aufgerufene Dateien) | ✅ erfüllt | PDFs werden mit Content-Type application/pdf, Content-Disposition, X-Content-Type-Options nosniff und frame-ancestors bzw. SAMEORIGIN ausgeliefert. Chat-Fotos kommen nur über signierte URLs von der Supabase-Domain, nicht vom Ursprung der App. Alle Buckets sind privat. |  |
| V3.2.2 | Als Text gedachte Inhalte sicher rendern (textContent statt HTML) | ✅ erfüllt | Benutzertexte rendert React als Textknoten. Es gibt kein innerHTML und kein insertAdjacentHTML, dangerouslySetInnerHTML nur für die feste Konstante. F04 (freier Link in Benachrichtigungen, React blockiert javascript:) und F52 (CSP ohne script-src) betreffen Linkziele bzw. | F04, F52 |
| V3.3.1 | Cookies mit Secure und __Host-/__Secure-Präfix | ❌ nicht erfüllt | Die Supabase-Sitzungscookies werden ohne Secure gesetzt (Standard von @supabase/ssr 0.12.7, ohne cookieOptions in proxy.ts:16 und server.ts:16), und keines der Cookies hat das Präfix __Host- oder __Secure-. Auch AKTIV_COOKIE hat kein Präfix. | F53, F18, F44 |
| V3.4.1 | HSTS auf allen Antworten, max-age ≥ 1 Jahr | ✅ erfüllt | next.config.ts:9 setzt max-age=63072000; includeSubDomains; preload. Live ist das bestätigt, auch auf Antworten ohne Proxy (/kunden/x.png). F60 ist nur ein Hinweis zu preload. | F60 |
| V3.4.2 | CORS-Allow-Origin fest bzw. Allowlist, * nur ohne sensible Daten | ✅ erfüllt | Der Code setzt kein Access-Control-Allow-Origin, den Wert * fügt Vercel hinzu (F55, F126). Die Shells mit * enthalten nachweislich keine Fachdaten (291 Dateien gescannt). Mit * gibt der Browser keine Antworten auf Anfragen mit Anmeldedaten frei. | F55, F126 |
| V3.5.1 | Schutz vor Cross-Site-Anfragen (Anti-CSRF) ohne Verlass auf Preflight | ❌ nicht erfüllt | Server-Aktionen sind über die Origin- und Host-Prüfung von Next und SameSite=Lax geschützt. /abmelden führt die Abmeldung aber auch per GET ohne Herkunftsprüfung aus (route.ts:21-22, Logout-CSRF). | F19, F36 |
| V3.5.2 | Kein Aufruf sensibler Funktionen ohne CORS-Preflight möglich | ✅ erfüllt | Die App verlässt sich nicht auf Preflight, sondern auf die Origin-Prüfung der Server-Aktionen und auf SameSite=Lax. Ein fremdes POST (z. B. text/plain an /pdf/vorschau) schickt keine Sitzungscookies mit. Die Maschinen-Endpunkte prüfen Signatur bzw. CRON_SECRET. |  |
| V3.5.3 | Sensible Funktionen nicht über sichere Methoden (GET/HEAD) | ❌ nicht erfüllt | src/app/abmelden/route.ts:21-22 exportiert GET = abmelden, die Abmeldung läuft also per GET und ohne Prüfung von Sec-Fetch-*. | F57 |
| V4.1.1 | Content-Type passend zum Inhalt, mit charset | ✅ erfüllt | PDFs werden als application/pdf ausgeliefert, Textantworten über new Response(string) als text/plain;charset=UTF-8, JSON über Response.json, HTML von Next als text/html; charset=utf-8. Hinweis: RSC-Antworten nutzen den Framework-Standard text/x-component ohne charset (app-router-headers.js:102). |  |
| V4.4.1 | WebSockets nur über TLS (WSS) | ➖ nicht relevant | Die App nutzt keine WebSockets: grep nach WebSocket und wss: in src ergibt nichts, Supabase Realtime wird nicht verwendet (F131). Der Chat fragt alle 10 s per HTTPS ab. | F131 |
| V5.2.1 | Nur verarbeitbare Dateigrößen annehmen (kein DoS) | ❌ nicht erfüllt | Je Datei gelten Größengrenzen der Buckets (belege 10 MB, chat-fotos 15 MB, ablage-puffer 50 MB). Upload-URLs lassen sich aber ohne Mengengrenze erzeugen, und abgebrochene Uploads räumt niemand auf, sodass sich der Speicher füllen lässt (F46, F130). | F46, F130, F86 |
| V5.2.2 | Dateiendung und Inhalt (Magic Bytes) passen zusammen | ❌ nicht erfüllt | Office-Dateien werden nur an der ZIP-Signatur plus Endung erkannt, deshalb wird auch ein beliebiges ZIP mit .docx angenommen (F47). Die Fotoprüfung lässt sich per direktem INSERT von foto_pfad umgehen (F128). Bei Chat-Fotos und Ablage-Uploads prüft der Server sonst die Magic Bytes. | F47, F128, F86 |
| V5.3.1 | Hochgeladene Dateien in öffentlichen Ordnern nicht ausführbar | ✅ erfüllt | Uploads landen nur in privaten Supabase-Buckets bzw. in OneDrive. public/ enthält nur public/brand/schrickel-logo.png, und nichts wird vom Server ausgeführt. F02 (Überschreiben im Bucket belege) betrifft die Integrität, nicht die Ausführung. | F02 |
| V5.3.2 | Dateipfade intern erzeugt, Benutzer-Dateinamen streng bereinigt | ✅ erfüllt | Speicherpfade erzeugt der Server mit crypto.randomUUID() + '/foto' bzw. + Dateiname nach sharepointName (entfernt / \ : * ? " < > | # % und Steuerzeichen sowie führende Punkte). Der Bucket ist fest vorgegeben, ein Pfad-Traversal ist nicht möglich (positive Prüfergebnisse). |  |
| V6.1.1 | Dokumentation von Ratenbegrenzung und Anti-Automation gegen Credential Stuffing und Brute Force | ❌ nicht erfüllt | Weder CLAUDE.md noch docs/ beschreiben, wie Anmeldeversuche begrenzt werden. Eine Suche nach brute|rate.limit|Anmeldeversuch|sign_in_sign_ups trifft nur auf die Lexware-Drosselung (CLAUDE.md:879). Auch die Übergabe-Anleitung nennt die Grenzwerte von Supabase nicht (F85). | F80, F20, F85 |
| V6.2.1 | Passwörter mindestens 8 Zeichen (15 empfohlen) | ✅ erfüllt | Der Server verlangt mindestens 12 Zeichen: src/lib/auth/aktionen.ts:99 (passwortRegelVerletzt) und src/lib/passwort.ts:10. Supabase setzt dazu minimum_password_length = 12 (supabase/config.toml:186). |  |
| V6.2.2 | Benutzer können ihr Passwort ändern | ✅ erfüllt | Unter /konto/passwort ändert jeder Benutzer sein Passwort (src/app/(app)/konto/aktionen.ts:16-51). Laut positivem Prüfergebnis „Passwort ändern im Konto“ geht das nur mit aal2. |  |
| V6.2.3 | Passwortänderung verlangt aktuelles und neues Passwort | ❌ nicht erfüllt | Die Kontoseite fragt das aktuelle Passwort ab. Über /passwort-setzen (passwortSetzen, src/lib/auth/aktionen.ts:106-126) kann aber jede aal2-Sitzung das Passwort ohne das aktuelle ändern. Supabase verlangt ebenfalls keine erneute Anmeldung (secure_password_change = false). | F16, F91 |
| V6.2.4 | Prüfung neuer Passwörter gegen mindestens die 3000 häufigsten Passwörter | ❌ nicht erfüllt | Der Schutz vor geleakten Passwörtern ist auf Staging aus (Advisor WARN, password_hibp_enabled=false). Die App prüft nur Länge und Zeichenklassen. | F79, F21, F03 |
| V6.2.5 | Keine Kompositionsregeln (keine Pflicht für Groß-/Kleinbuchstaben, Ziffern, Sonderzeichen) | ❌ nicht erfüllt | Groß- und Kleinbuchstaben sowie eine Ziffer sind Pflicht: src/lib/passwort.ts:11-12, src/lib/auth/aktionen.ts:101 und supabase/config.toml:189 (password_requirements = 'lower_upper_letters_digits'). | F21 |
| V6.2.6 | Passwortfelder mit type=password maskiert | ✅ erfüllt | Der Baustein PasswortInput rendert type="password" und wechselt nur über das Augen-Symbol kurz auf text (src/components/ui/field.tsx:24). Alle Passwortfelder nutzen ihn: Anmeldung, Passwort setzen und Konto. |  |
| V6.2.7 | Einfügen, Browser-Passworthelfer und Passwortmanager erlaubt | ✅ erfüllt | Kein Passwortfeld blockiert das Einfügen. Das einzige onPaste-Ereignis gehört zum TOTP-Codefeld und übernimmt den eingefügten Text (formulare.tsx:106-109). Die Passwortfelder tragen autoComplete="current-password" bzw. "new-password" und username (formulare.tsx:124-127, 236-239). |  |
| V6.2.8 | Passwort wird exakt wie eingegeben geprüft (keine Kürzung, keine Umwandlung der Groß-/Kleinschreibung) | ✅ erfüllt | Passwörter werden ohne trim und ohne Umwandlung übernommen: String(fd.get("passwort")) in src/lib/auth/aktionen.ts:17 und :107, src/app/(app)/konto/aktionen.ts:18-20. Getrimmt und klein geschrieben wird nur die E-Mail-Adresse. |  |
| V6.3.1 | Schutz gegen Credential Stuffing und Brute Force wie dokumentiert umgesetzt | ❌ nicht erfüllt | Es gibt nur die IP-Begrenzung von Supabase. Weil die Anmeldung serverseitig läuft, sieht Supabase dabei die IP von Vercel. Captcha und eine Sperre je Konto fehlen, eine Dokumentation dazu ebenfalls. | F80, F20, F136, F137, F24 |
| V6.3.2 | Keine Standardkonten (root, admin, sa) bzw. deaktiviert | ✅ erfüllt | Anmeldung nur per Einladung (disable_signup=true). Es gibt kein fest angelegtes Standardkonto, und admin-einladen.mjs legt den ersten Admin mit der echten Adresse per Einladungslink an. Hinweis: Die verwaisten Test-Admins e2e-*@example.com auf Staging (F115/F92) sind keine Standardkonten, sollten aber entfernt werden. |  |
| V6.4.1 | Anfangspasswörter/Aktivierungscodes zufällig, kurzlebig, einmalig, nicht als Dauerpasswort | ✅ erfüllt | Supabase erzeugt Einladungs- und Recovery-Token zufällig. Sie werden einmalig per verifyOtp eingelöst (aktionen.ts:89-97), danach muss der Benutzer ein eigenes Passwort nach den Regeln setzen (passwortSetzen). Laut supabase/config.toml:243 gilt otp_expiry = 3600 s. |  |
| V6.4.2 | Keine Passworthinweise oder Sicherheitsfragen | ✅ erfüllt | Es gibt keine Passworthinweise und keine Sicherheitsfragen. Eine Suche nach Sicherheitsfrage|Passworthinweis|secret question in src findet nichts, die Wiederherstellung läuft nur über den E-Mail-Link und den zweiten Faktor. |  |
| V7.2.1 | Prüfung der Sitzungstoken in einem vertrauenswürdigen Backend | ✅ erfüllt | pruefeSitzung prüft auf dem Server per getClaims (Signatur über JWKS bzw. getUser bei Supabase, src/lib/auth/sitzung.ts:21-41). Zusätzlich prüft PostgREST das JWT, und die RLS-Funktionen verlangen aal2 und ein aktives Konto. Im Browser gibt es keinen Supabase-Client. |  |
| V7.2.2 | Dynamisch erzeugte Sitzungstoken statt statischer API-Schlüssel | ✅ erfüllt | Sitzungen bestehen aus Access-JWTs mit jwt_exp=3600 und rotierenden Refresh-Tokens, die Supabase Auth je Anmeldung ausstellt. Der Publishable Key dient nicht der Sitzung, der Zugriff hängt am Benutzer-JWT (RLS). |  |
| V7.2.3 | Referenztoken eindeutig, per CSPRNG, mindestens 128 Bit Entropie | ✅ erfüllt | Die einzigen Referenztoken sind die Refresh-Tokens von Supabase Auth. Sie werden serverseitig zufällig erzeugt und bei jeder Nutzung rotiert (refresh_token_rotation_enabled=true laut F82). Eigene Referenztoken erzeugt die App nicht. Das AKTIV_COOKIE ist nur ein Zeitstempel und kein Sitzungstoken. |  |
| V7.2.4 | Neues Sitzungstoken bei Anmeldung und erneuter Authentifizierung, altes beendet | ✅ erfüllt | signInWithPassword und mfa.challengeAndVerify stellen neue Access- und Refresh-Tokens aus, die das Cookie ersetzen. linkEinloesen meldet vor verifyOtp lokal ab (aktionen.ts:93). Die Prüfanmeldung bei der Passwortänderung läuft in einer eigenen Sitzung, die sofort beendet wird. |  |
| V7.4.1 | Nach Abmeldung/Ablauf keine weitere Nutzung der Sitzung | ❌ nicht erfüllt | Ein Access-JWT bleibt nach der Abmeldung bis zu 3600 s gültig: signOut({scope:'local'}) (abmelden/route.ts:11) widerruft nur die Supabase-Sitzung bzw. das Refresh-Token. Es gibt keine Sperrliste, und app.ist_benutzer/ist_admin prüfen nur aal und benutzer.aktiv, nicht auth.sessions (eigene SQL-Prüfung auf Staging). | F54, F17, F123, F82 |
| V7.4.2 | Alle Sitzungen enden, wenn ein Konto deaktiviert oder gelöscht wird | ✅ erfüllt | Die Datenbank verweigert sofort jeden Zugriff, weil ist_benutzer benutzer.aktiv und deleted_at prüft. pruefeSitzung leitet dann auf /abmelden?grund=gesperrt um, und ban_duration in Supabase Auth verhindert jeden weiteren Token-Refresh (positives Prüfergebnis „Deaktivierte Benutzer verlieren sofort den Zugriff“). |  |
| V8.1.1 | Autorisierungsdokumentation mit Regeln für Funktions- und Datenzugriff | ✅ erfüllt | CLAUDE.md (Sicherheit Nr. 1 und 6, Einstellungen, Abwesenheiten, Konditionen) legt die Regeln fest: gleiche Rechte für alle Büro-Benutzer, Einzelrechte Admin und „Konditionen sehen“, Go-live-Datum nur für Admin, Prüfung per RLS. |  |
| V8.2.1 | Zugriff auf Funktionen nur mit ausdrücklicher Berechtigung | ❌ nicht erfüllt | Nicht-Admins können per PostgREST Admin-Einstellungen ändern (einstellung, belegart_einstellung) und über den Krank-Umweg Abwesenheiten genehmigen und löschen. Außerdem darf jeder Benutzer Dateien im Bucket „belege“ anlegen und überschreiben. | ~~F01~~ behoben, ~~F61~~ behoben, ~~F14~~ behoben, ~~F05~~ behoben, F81, ~~F41~~ behoben, F42, F35, F123 |
| V8.2.2 | Datenzugriff nur auf berechtigte Datensätze (IDOR/BOLA) | ❌ nicht erfüllt | Fremde Benachrichtigungen lassen sich mit frei gewähltem Link anlegen. historie('konto', <id>) gibt Konto-Ereignisse anderer Benutzer heraus, und Beleg-PDFs bzw. pdf_pfad fertiger Belege sind frei überschreibbar. | F04, F06, F100, F02, ~~F61~~ behoben |
| V8.3.1 | Autorisierung in vertrauenswürdiger Serviceschicht, nicht im Client | ❌ nicht erfüllt | Mehrere Regeln liegen nur in Server-Actions oder RPCs und lassen sich per direktem PostgREST-Zugriff umgehen. Betroffen sind die Admin-Pflicht in einstellung, pdf_pfad bei fertigen Belegen, art, kette_id und vorgaenger_id an Entwürfen sowie die Versionslogik. | ~~F01~~ behoben, ~~F61~~ behoben, F103, F104, F106, ~~F14~~ behoben, F07, ~~F41~~ behoben |
| V9.1.1 | Self-contained Token vor Nutzung über Signatur/MAC geprüft | ✅ erfüllt | getClaims prüft die Signatur per WebCrypto mit dem JWKS-Schlüssel. Bei HS-Algorithmus oder ohne kid fragt es serverseitig per getUser nach (node_modules/@supabase/auth-js/dist/main/GoTrueClient.js:5599-5630), erst danach nutzt pruefeSitzung die Claims. |  |
| V9.1.2 | Nur Algorithmen einer Allowlist, kein 'none' | ✅ erfüllt | helpers.js:463-480 (getAlgorithm) lässt lokal nur RS256 und ES256 zu, alles andere löst „Invalid alg claim“ aus. HS-Token und Token ohne alg bzw. kid werden nicht lokal angenommen, sondern von Supabase Auth per getUser geprüft. Ein Token mit alg 'none' wird damit nie ungeprüft akzeptiert. |  |
| V9.1.3 | Schlüsselmaterial nur aus vertrauenswürdigen, vorkonfigurierten Quellen (jku/x5u/jwk geprüft) | ✅ erfüllt | fetchJwk lädt Schlüssel nur von `${this.url}/.well-known/jwks.json` des fest konfigurierten Supabase-Projekts (GoTrueClient.js:5495, URL aus NEXT_PUBLIC_SUPABASE_URL). Die Header jku, x5u und jwk werden nicht ausgewertet. Der Lexware-Webhook nutzt einen fest im Code hinterlegten öffentlichen Schlüssel. |  |
| V9.2.1 | Gültigkeitszeitraum (exp/nbf) des Tokens wird geprüft | ✅ erfüllt | getClaims ruft validateExp auf, das bei fehlendem oder abgelaufenem exp ablehnt (GoTrueClient.js:5593, helpers.js:454-462). PostgREST und Supabase Auth lehnen abgelaufene JWTs ebenfalls ab. Die Laufzeit beträgt jwt_exp=3600. |  |
| V10.4.1 | Autorisierungsserver: Redirect-URIs per exakter Allowlist | ➖ nicht relevant | Die App betreibt keinen OAuth-Autorisierungsserver und nutzt keine OAuth-Anbieter, nur die E-Mail-Anmeldung bei Supabase. Die Redirect-Allowlist von Supabase gilt nur für E-Mail-Links (Hinweis F93: localhost:3000 in der Staging-Allowlist). | F93 |
| V10.4.2 | Autorisierungscode nur einmal einlösbar | ➖ nicht relevant | Es gibt keinen OAuth-Authorization-Code-Flow, weder als Autorisierungsserver noch als Client. Microsoft Graph wird nur per Client-Credentials angesprochen. |  |
| V10.4.3 | Autorisierungscode kurzlebig (max. 10 min) | ➖ nicht relevant | Es gibt keinen OAuth-Authorization-Code-Flow und damit keine Autorisierungscodes. |  |
| V10.4.4 | Nur benötigte Grants je Client, keine Implicit- oder Password-Grants | ➖ nicht relevant | Die App ist kein OAuth-Autorisierungsserver mit fremden Clients. Die Erstanbieter-Anmeldung bei Supabase per signInWithPassword ist kein OAuth-Grant an Dritte, und gegenüber Microsoft wird nur der Client-Credentials-Grant genutzt. |  |
| V10.4.5 | Schutz gegen Replay von Refresh-Tokens öffentlicher Clients (Rotation/DPoP) | ➖ nicht relevant | Die App betreibt keinen Autorisierungsserver für öffentliche OAuth-Clients. Für die eigenen Supabase-Sitzungen ist die Rotation der Refresh-Tokens trotzdem aktiv (refresh_token_rotation_enabled=true, F82; config.toml:174-177). |  |
| V11.3.1 | Keine unsicheren Blockmodi (z. B. ECB) und keine schwachen Padding-Verfahren (z. B. PKCS#1 v1.5) | ✅ erfüllt | Die App verschlüsselt nur an einer Stelle selbst: AES-256-GCM in src/lib/onedrive/krypto.ts:16. Im Quellcode kommen weder ECB noch CBC, publicEncrypt oder privateDecrypt vor (grep über src und scripts). RSA dient nur zur Prüfung der Lexware-Webhook-Signatur (RSA-SHA512, webhook-pruefung.ts:42). |  |
| V11.3.2 | Nur zugelassene Verschlüsselungsverfahren und Modi wie AES-GCM | ✅ erfüllt | Das Graph-Token wird mit AES-256-GCM verschlüsselt. Dazu gehören ein zufälliger 12-Byte-IV aus randomBytes, ein geprüftes Auth-Tag (setAuthTag, krypto.ts:25) und ein 32-Byte-Schlüssel mit Längenprüfung (krypto.ts:10). Für TLS sorgen Plattform und Node (geprüft: TLS 1.3). | F10 |
| V11.4.1 | Nur zugelassene Hashfunktionen, kein MD5 und kein SHA-1 für kryptografische Zwecke | ✅ erfüllt | Im Code kommen nur sha256 vor (kontakt-daten.ts:63 als Prüfsumme, webhook-pruefung.ts:72 als Schlüssel gegen Doppelzustellung) und sha512 für die Signaturprüfung (webhook-pruefung.ts:42). Eine Suche nach md5, sha1 und Math.random in src und scripts findet nichts. |  |
| V12.1.1 | Nur aktuelle TLS-Versionen (1.2, 1.3), TLS 1.3 bevorzugt | ✅ erfüllt | Live gegen sawin-bauelemente-app.vercel.app getestet: Verbindungen mit TLS 1.0 und 1.1 scheitern, TLS 1.2 und 1.3 liefern 200. Ohne Vorgabe handelt der Server TLS 1.3 aus. Mit Supabase-Staging, api.lexware.io und den Microsoft-Endpunkten kam TLS 1.3 zustande (dort nur der Handshake, keine API-Aufrufe). |  |
| V12.2.1 | TLS für alle Verbindungen zu extern erreichbaren HTTP-Diensten, kein Rückfall auf unverschlüsselt | ✅ erfüllt | Ein Aufruf über http:// bekommt 308 auf https://. Dazu kommen HSTS mit 2 Jahren, includeSubDomains und preload (next.config.ts:9). Ausgehende Verbindungen nutzen nur https: Lexware ist fest auf https://api.lexware.io eingestellt (client.ts:12), Graph und Login haben https als Standard (graph.ts:13-14), und die Supabase … | F60, F64, F28 |
| V12.2.2 | Öffentlich vertrauenswürdige TLS-Zertifikate für extern erreichbare Dienste | ✅ erfüllt | Live mit Node tls.connect geprüft: Das Zertifikat der App stammt von Google Trust Services (WR1), das von Supabase-Staging ebenfalls von Google Trust Services (WE1). Node hat beide als vertrauenswürdig akzeptiert (authorized=true). |  |
| V13.4.1 | Keine Versionsverwaltungs-Metadaten (.git, .svn) ausgeliefert oder erreichbar | ✅ erfüllt | Live liefern /.git/config, /.git/HEAD, /.svn/entries, /.env, /.env.local und /package.json keinen Inhalt, sondern 307 mit Location /anmelden. Vercel liefert nur die Build-Ausgabe aus. public/ enthält nur das Logo, und in .next gibt es kein .git-Verzeichnis (find ohne Treffer). |  |
| V14.2.1 | Sensible Daten nur im Body oder in Headern, nicht in URL oder Query-String | ✅ erfüllt | Die Sitzung läuft nur über Cookies. Lexware- und Graph-Token gehen als Authorization-Header mit (client.ts, graph.ts), und Server-Aktionen schicken Daten im POST-Body. Der Einmal-Token aus dem Einladungs- bzw. | F129 |
| V14.3.1 | Daten aus der angemeldeten Sitzung werden beim Abmelden aus dem Client-Speicher gelöscht (z. B. Clear-Site-Data) | ❌ nicht erfüllt | /abmelden (src/app/abmelden/route.ts:15-18) setzt keinen Clear-Site-Data-Header, und der Client löscht beim Abmelden nichts. Im sessionStorage bleibt „sawin-verlauf“ mit Masken-Titeln stehen, die Kunden- oder Belegbezeichnungen enthalten können (verlauf.tsx:32). | F58 |
| V15.1.1 | Die Dokumentation legt risikobasierte Fristen fest, in denen verwundbare Drittkomponenten behoben und Bibliotheken allgemein aktualisiert werden. | ❌ nicht erfüllt | Es gibt keine dokumentierten Update- oder Behebungsfristen. CLAUDE.md (Sicherheit, Punkt 8) verlangt nur „Dependabot aktiv, npm audit --omit=dev ohne hohe Befunde“, und eine Suche in docs/ findet nur docs/status.md:161 (F71). | F71, F70 |
| V15.2.1 | Die Anwendung enthält nur Komponenten, die die dokumentierten Update- und Behebungsfristen einhalten. | ❌ nicht erfüllt | Weil keine Fristen dokumentiert sind (F71), lässt sich die Anforderung nicht nachweisen. Dazu kommt next 16.4.2: Den Sicherheits-Release 16.4.5 vom 03.11.2026 mit 7 Advisories hat das Projekt nicht übernommen, npm audit zeigt ihn nicht an (F70). | F70, F71, F72, F73, F74, F75, F77 |
| V15.3.1 | Die Anwendung gibt von einem Datenobjekt nur die benötigten Felder zurück, nicht das ganze Objekt mit Feldern, die Benutzer nicht sehen dürfen. | ✅ erfüllt | Ausdrücklich ausgewählte Spalten nutzen die Lader fast überall. Ein vollständiges Objekt lädt nur ladeBeleg (src/lib/belege.ts:163 select `*`, über RLS). Die Belegspalten sind laut Rechtemodell für alle Büro-Benutzer gleich sichtbar, und die nur eingeschränkt sichtbaren Konditionen liegen in eigenen Tabellen, die nur g … | F06, F100 |

## Anhang: geprüft und in Ordnung

Positive Prüfergebnisse je Bereich, Kurzfassung. Die vollständigen Belege (SQL-Ergebnisse, Dateistellen) liegen im
Prüfprotokoll der Sitzung.

#### Datenbank, RLS und Storage

- RLS auf allen Tabellen: erfüllt bis auf app.basis (siehe Fund): Alle 49 Tabellen in public und audit.log haben relrowsecurity=true. Event-Trigger ensure_rls (rls_auto_enable) schaltet RLS bei neuen Tabellen automatisch ein.
- Kein Zugriff für anon: erfüllt: Keine Tabellen-, Spalten- oder Sequenzrechte für anon bzw. PUBLIC in public, app und audit. Keine Policy für die Rolle anon, alle Policies TO authenticated.
- Zweiter Faktor (aal2) in der Datenbank erzwungen: erfüllt: app.ist_benutzer(), app.ist_admin() und app.darf_konditionen() verlangen auth.jwt()->>'aal' = 'aal2' sowie benutzer.aktiv und deleted_at IS NULL.
- Policies ohne USING(true), mit WITH CHECK: erfüllt: Kein Policy-Ausdruck ist pauschal true. Alle UPDATE-Policies haben WITH CHECK, alle INSERT-Policies eine Bedingung.
- Kein hartes Löschen: erfüllt: Weder authenticated noch service_role hat DELETE auf Fachtabellen. Gelöscht wird nur über public.loeschen() → app.loeschen(), das deleted_at setzt und Sonderregeln prüft (benutzer nur Admin,  …
- Nur Admin verwaltet Benutzer: erfüllt: Policies benutzer anlegen und aendern verlangen app.ist_admin(). Der Trigger admin_bleibt (AFTER UPDATE/DELETE) verhindert, dass der letzte aktive Admin wegfällt.
- Nur Admin genehmigt Abwesenheiten: erfüllt bis auf die Lücke beim Wechsel auf „krank“ (siehe Fund): Der Trigger abwesenheit_status verlangt app.ist_admin() für jeden Statuswechsel und für ein INSERT mit Status ≠ beantragt.
- Konditionen nur mit Recht: erfüllt: Eigene Tabellen kunde_kondition und lieferant_kondition, alle Policies über app.darf_konditionen().
- Service-Funktionen nur für die Service-Rolle: erfüllt: lexware_start/_fertig/_fehler/_pdf/_kunde/_zahlungen/_abgleich_beginnen/_ereignis_eingang/_ereignis_ende, ablage_ordner_setzen, ablage_datei_setzen und konto_ereignis haben EXECUTE nur für po …
- search_path in Funktionen: erfüllt: Alle Funktionen in public, app und audit haben SET search_path = '' (rls_auto_enable: pg_catalog).
- Sichten und security_invoker: nicht relevant: In public, app und audit gibt es keine Sichten (relkind v/m).
- API-Oberfläche: erfüllt: Über PostgREST ist nur public erreichbar. Die Schemata app, audit und storage antworten mit 406 PGRST106. pg_graphql ist nicht aktiviert.
- Storage-Buckets: erfüllt bis auf das Überschreiben in 'belege' (siehe Fund): Alle drei Buckets sind privat. belege: nur application/pdf, 10 MB, Policies mit ist_benutzer (aal2).
- Audit-Log vollständig und unveränderbar: erfüllt: Alle 48 Fachtabellen haben den AFTER-Trigger protokoll (audit.protokoll, SECURITY DEFINER). audit.log: keine Rechte für authenticated oder anon, keine USAGE auf audit für authenticated;
- Server-Felder vor Benutzerschreibzugriff geschützt: erfüllt für Belege, Zahlungen, Kunden und Import-Felder: beleg_status_regeln setzt Lexware-Felder, steuern, abschlag_nr und Version zurück.
- Supabase-Advisors: Security: nur INFO rls_enabled_no_policy für audit.log und ms_token (gewollt, ohne Rechte) und WARN auth_leaked_password_protection (siehe Fund).
- RLS-Testsuite ausgeführt: erfüllt: npm run test:rls gegen Staging, 92 Tests bestanden, 0 fehlgeschlagen.

#### Anmeldung, Zwei-Faktor, Sitzung

- aal2 in jeder Server-Aktion (alle 28 Dateien mit "use server"): Erfüllt: Jede exportierte Funktion ruft vor jedem Daten- oder Seiteneffekt pruefeSitzung() bzw. pruefeAdmin() auf, direkt oder über einen Helfer, der das als Erstes tut: ladeBeleg, ladeKundeFuerBeleg, …
- pruefeSitzung prüft Anmeldung, aal2 und aktives Konto: Erfüllt: getClaims() prüft die JWT-Signatur, claims.aal muss 'aal2' sein (sonst Umleitung zu Code bzw. Einrichtung), und die Zeile in benutzer wird per RLS gelesen (nur aktive Konten).
- Admin-Aktionen nur mit pruefeAdmin: Erfüllt: einladen, aendern, aktivSetzen, zweiFaktorZuruecksetzen, erneutEinladen, bccSpeichern, stichtagSpeichern, fremdbelegeJetztPruefen und verbindungSpeichern (OneDrive) prüfen Admin.
- createAdminClient (Service-Rolle) nur nach Sitzungsprüfung bzw. in Maschinen-Endpunkten: Erfüllt: Alle Aufrufe in src/lib/lexware, src/lib/onedrive, formular-ablage und chat erfolgen nach pruefeSitzung, in Cron-Routen nach cronErlaubt oder im Webhook nach der Signaturprüfung.
- Route-Handler außerhalb von (app): Erfüllt: /pdf/beleg/[id] über ladeBeleg → pruefeSitzung, /pdf/formular/[id], /pdf/vorschau (POST) und /pdf/wochenplan rufen pruefeSitzung als Erstes auf. /auth/aktiv gibt nur 204 ohne Daten zurück.
- Datenbank verlangt aal2 (Umgehung des zweiten Faktors per REST mit Publishable Key): Erfüllt: app.ist_benutzer(), app.ist_admin() und app.darf_konditionen() verlangen auth.jwt()->>'aal' = 'aal2' sowie ein aktives, nicht gelöschtes Benutzerkonto.
- RPC-Funktionen und Schema app: Erfüllt: Alle für authenticated ausführbaren Funktionen in public sind SECURITY INVOKER (RLS greift). Die SECURITY-DEFINER-Funktionen lexware_*, ablage_*_setzen, konto_ereignis und rls_auto_enable sin …
- Storage-Buckets: Erfüllt: belege (privat, nur PDF, 10 MB), ablage-puffer (privat, 50 MB) und chat-fotos (privat, JPEG/PNG/HEIC/HEIF, 15 MB). Die 3 Storage-Policies beruhen auf ist_benutzer.
- Genehmigen von Abwesenheiten nur durch Admin (regulärer Weg): Erfüllt (mit Ausnahme des Krank-Umwegs, siehe Fund): Der Trigger app.abwesenheit_status verlangt app.ist_admin() für jeden Statuswechsel und für INSERT mit einem Status ungleich 'beantragt'.
- Benutzer verwalten nur durch Admin (Datenbank): Erfüllt: Die Policies benutzer.aendern und benutzer.anlegen verlangen app.ist_admin(), lesen benutzer.lesen ist_benutzer. benutzer_einstellung nur für die eigene Zeile.
- Deaktivierte Benutzer verlieren sofort den Zugriff: Erfüllt: Datenbankseitig sofort, weil ist_benutzer b.aktiv prüft (ein noch gültiges JWT von bis zu 1 h liest nichts mehr). Die App leitet über pruefeSitzung auf /abmelden?grund=gesperrt um.
- Keine offene Registrierung, nur E-Mail-Anmeldung: Erfüllt: Die öffentliche GET /auth/v1/settings (Staging) ergibt disable_signup = true, mailer_autoconfirm = false, phone_autoconfirm = false, saml_enabled = false und als einzigen aktiven Anbieter 'em …
- Keine Benutzer-Enumeration bei Anmeldung und „Passwort vergessen“: Erfüllt: Falsche Adresse, falsches Passwort und gesperrter Zugang ergeben dieselbe Meldung. Nur 429 wird eigens gemeldet.
- Einladungs- und Recovery-Link: Erfüllt: Der Link wird erst per Knopf (POST) eingelöst und dadurch nicht von Link-Scannern verbraucht. Nur die Typen invite und recovery mit token_hash sind erlaubt. Vorher wird lokal abgemeldet.
- Zwei-Faktor-Einrichtung: Erfüllt: Ein TOTP-Faktor wird nur ohne bereits bestätigten Faktor angelegt, unbestätigte alte werden entfernt. faktorBestaetigen akzeptiert nur die ID eines eigenen offenen Faktors.
- Passwort ändern im Konto: Erfüllt: Nur mit aal2. Das aktuelle Passwort wird mit einer separaten, sofort wieder beendeten Anmeldung geprüft. Die Regeln gelten serverseitig, das neue Passwort muss sich unterscheiden.
- Abmelden: Erfüllt: signOut({scope:'local'}) widerruft die Sitzung bei Supabase und löscht die Auth-Cookies, AKTIV_COOKIE wird gelöscht, Cache-Control no-store, Umleitung 303 nur mit festen Gründen aus ANMELDE_G …
- Inaktivitäts-Abmeldung (Browser und Proxy): Teilweise erfüllt: Der Proxy meldet nach 60 min ohne Anfrage ab, auch für Server-Actions (der Matcher erfasst alle Pfade außer statischen Dateien).
- CSRF für Server-Actions und Route-Handler: Erfüllt: Next 16.4.2 vergleicht Origin und Host und bricht bei Abweichung ab. In next.config.ts ist kein serverActions.allowedOrigins gesetzt.
- Offene Weiterleitungen sonst: Erfüllt bis auf ?weiter= (siehe Fund): Alle übrigen redirect()-Aufrufe nutzen feste Pfade oder App-Pfade mit geprüfter UUID bzw. Datenbank-ID. Der Proxy leert search bei der Umleitung auf /anmelden.
- Daten in Seiten nur über die Sitzung: Erfüllt: createClient() mit der Sitzung wird außerhalb von src/lib/auth und /abmelden nirgends direkt genutzt.

#### Geheimnisse

- Umgebungsvariablen: Bestand und Einordnung: Erfüllt. Alle Variablen sind eingeordnet. Öffentlich (NEXT_PUBLIC_): NEXT_PUBLIC_CUSTOMER_ID, NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (src/lib/supabase/env.ts, src/proxy.ts).
- Geheime Module bleiben serverseitig: Erfüllt. Alle Module, die geheime Variablen lesen, importieren "server-only": src/lib/supabase/admin.ts:1, src/lib/lexware/client.ts:1, fremdbelege.ts, uebertragung.ts, zahlungen.ts, webhook.ts, src/l …
- Client-Bundle (.next/static) frei von Geheimnissen: Erfüllt. 81 Dateien in .next/static (Build 13.11. 02:09) gegen alle 14 Werte aus .env.local durchsucht, einschließlich des aus SUPABASE_DB_URL gelösten Datenbankpassworts: kein Treffer.
- Git-Historie: eingecheckte Schlüsseldateien: Erfüllt. Über alle Branches, Remote-Branches und Reflog (428 je hinzugefügte Pfade) wurde nie eine .env-Datei außer .env.example eingecheckt, ebenso kein *.pem, *.key, *.p12, *.pfx, kein Zugangsdaten- …
- Git-Historie: aktuelle Geheimniswerte: Erfüllt. Alle 2073 Git-Objekte (git cat-file --batch-all-objects, auch unerreichbare Commits und Blobs) wurden gegen die Werte aus .env.local durchsucht.
- Git-Historie: Mustersuche: Erfüllt. Kein echtes Geheimnis gefunden. Ohne Treffer: sb_secret_, eyJhbGciOi (JWT), api_key=, password=, Bearer <Token>, AccountKey=, xox[bp]- und postgres://user:pw@.
- Testzugangsdaten im Repository: Erfüllt. Es stehen keine festen Passwörter oder TOTP-Secrets im Repository. Testbenutzer erhalten zufällige Passwörter (tests/rls/rls.test.mjs:61 randomBytes(18), tests/e2e/hilfen.mjs:57, anmeldung.e2 …
- Logs ohne Schlüssel und Header: Erfüllt, mit Ausnahme des niedrigen Funds zu Kundennamen. Alle 16 console-Aufrufe in src geben nur e.message bzw. eigene Texte aus, keine Request-Header und kein Authorization.
- Microsoft-Graph-Token verschlüsselt gespeichert: Erfüllt. Das Zugriffstoken wird mit AES-256-GCM verschlüsselt (src/lib/onedrive/krypto.ts: zufälliger 12-Byte-IV, Auth-Tag, Format v1.<iv>.<tag>.<daten>).
- Cron-Geheimnis wird sicher verglichen: Erfüllt. cronErlaubt (src/lib/lexware/webhook-pruefung.ts:79-85) lehnt fehlende Geheimnisse oder solche unter 16 Zeichen ab (fail closed) und vergleicht mit timingSafeEqual.
- Supabase-Schlüsselformat und Konfiguration: Erfüllt. Die App nutzt die neuen, einzeln widerrufbaren Supabase-Schlüssel: Secret Key mit Präfix sb_secret_, Publishable Key mit sb_publishable_, keine alten JWT-Schlüssel (anon/service_role).
- .gitignore: Weitgehend erfüllt. Abgedeckt sind .env* (mit Ausnahme !.env.example), *.pem, /berichte/ (Prüfberichte mit Belegnummern und Beträgen), /.next/, .vercel, supabase/.temp und .branches sowie in supabase/ …

#### Webhooks und Crons

- Lexware-Webhook: Signaturprüfung vor jeder Verarbeitung: Erfüllt. RSA-SHA512 über den empfangenen Body (ersatzweise über dessen kompakte JSON-Form) mit dem öffentlichen Lexware-Schlüssel (RSA 4096), der fest im Code steht.
- Lexware-Webhook: Inhalt wird nicht vertraut: Erfüllt. Aus dem Ereignis zählt nur die resourceId. Gesucht wird nur ein App-Beleg der Art Rechnung, Abschlag oder Gutschrift, und der Zahlungsstand wird mit dem eigenen API-Schlüssel bei Lexware nach …
- Lexware-Webhook: strenge Eingabeprüfung: Erfüllt. resourceId und organizationId müssen UUIDs sein, eventType muss dem Muster ^[a-z-]+(\.[a-z-]+)+$ folgen und eventDate ein gültiges Datum sein, sonst 400.
- Lexware-Webhook: Doppelzustellung und Replay: Erfüllt. Der Schlüssel ist ein SHA-256-Hash aus Organisation, Ereignis, Ressource und Zeitpunkt, mit UNIQUE(schluessel) und INSERT … ON CONFLICT DO NOTHING.
- Lexware-Webhook: DB-Funktionen und Tabelle: Erfüllt. lexware_ereignis_eingang, lexware_ereignis_ende, lexware_abgleich_beginnen und lexware_zahlungen sind SECURITY DEFINER mit search_path ''.
- Webhook: Größenbegrenzung und Methoden: Teilweise erfüllt. Ein Body über 16 KB wird mit 413 abgelehnt (allerdings erst nach dem Lesen, siehe Fund). Exportiert sind nur POST und HEAD, für HEAD prüft Lexware die Erreichbarkeit.
- Cron: CRON_SECRET-Prüfung: Erfüllt. Der Vergleich von 'Bearer <CRON_SECRET>' läuft mit crypto.timingSafeEqual nach Längenvergleich.
- Cron Zahlungsabgleich: Idempotenz: Erfüllt. lexware_zahlungen sperrt den Beleg (SELECT … FOR UPDATE), überspringt bekannte Zahlungsposten, und der Unique-Index zahlung_lexware_uk (lexware_id) verhindert doppelte Zahlungen auch bei para …
- Cron Ablage: keine doppelten Ordner oder Dateien: Erfüllt (bis auf die Statusanzeige, siehe Fund). Unique-Indizes je Bezug (ablage_ordner_anfrage/_auftrag/_ticket) und je Beleg-Version (ablage_datei_beleg).
- Fehlerantworten ohne interne Details: Erfüllt. Webhook und Crons antworten im Fehlerfall nur mit {status:'fehler'} bzw. {fehler:'Nicht berechtigt'} und schreiben die Details nur ins Server-Log.
- Proxy: Pfadnormalisierung der Maschinen-Pfade: Erfüllt. ../ und %2e%2e werden vor dem Präfixvergleich aufgelöst und landen außerhalb von /api/cron/. Groß- und Kleinschreibung wird nicht umgangen.
- /pdf/* nur mit vollständiger Sitzung (aal2, aktives Konto): Erfüllt. /pdf/formular, /pdf/wochenplan und /pdf/vorschau rufen pruefeSitzung() als Erstes auf. /pdf/beleg/[id] lädt über ladeBeleg(), das nach der UUID-Prüfung pruefeSitzung() aufruft, und auch pdfLa …
- /auth/aktiv und /abmelden: Erfüllt. /auth/aktiv (nur POST) liefert 204 ohne Daten, nur der Proxy erneuert bei bestehender Sitzung den Aktivitätszeitpunkt.
- Service-Rolle nur serverseitig: Erfüllt. createAdminClient importiert 'server-only' und liest SUPABASE_SERVICE_ROLE_KEY ohne NEXT_PUBLIC. Webhook und Crons schreiben nur über die lexware_* bzw. ablage_*-Funktionen.
- Region und Cron-Konfiguration: Erfüllt. vercel.json setzt die Region fra1, Zahlungsabgleich läuft alle 30 Minuten, Ablage zu den Minuten 15 und 45.

#### Eingaben, Injection, XSS, Uploads

- PostgREST-Filter-Injection (.or/.ilike mit Suchbegriffen): erfüllt
- Dynamisches SQL in Postgres-Funktionen (Staging ufopfstnqhitiyvelhjn): erfüllt
- Globale Suche public.suche: erfüllt
- Serverseitige Validierung und Mass Assignment in Server-Aktionen: überwiegend erfüllt (siehe Fund Längenbegrenzung)
- XSS: Ausgabe von HTML: erfüllt
- HTML-Bereinigung htmlBereinigen (sanitize-html 2.18.1): erfüllt
- Links mit Benutzer-URLs, target=_blank: erfüllt
- PDF-Erzeugung (react-pdf): Injection und SSRF: erfüllt
- Chat-Foto-Uploads: erfüllt
- Ablage-/Scan-Uploads und Dateinamen: erfüllt
- Route-Handler /pdf/* (Parameter, Weiterleitungen): erfüllt
- Weiterleitungen in proxy.ts, /abmelden und Server-Aktionen: erfüllt (Ausnahme: sicheresZiel, siehe Fund)
- Admin-Client (Service-Rolle) mit benutzergesteuerten IDs (IDOR): erfüllt (Kleinigkeiten als info)
- CSRF bei Server-Aktionen und Route-Handlern: erfüllt
- CSV-/Formel-Injection in Exporten: nicht relevant
- Fehlertexte der Datenbank in Beleg-Aktionen: erfüllt

#### HTTP-Header und CSP

- HSTS: erfüllt: max-age 2 Jahre (≥ 1 Jahr), includeSubDomains, auf allen Antworten
- X-Content-Type-Options: erfüllt: nosniff auf allen Antworten einschließlich der PDF-Routen
- Clickjacking-Schutz (X-Frame-Options und frame-ancestors): erfüllt: App-Seiten DENY bzw. frame-ancestors 'none'; PDFs nur in derselben Herkunft (SAMEORIGIN bzw. 'self') für die Vorschau
- Referrer-Policy: erfüllt: strict-origin-when-cross-origin; externe Ziele (OneDrive, Lexware, Lieferanten-Portale) erhalten nur die Herkunft, keine Pfade mit IDs
- Permissions-Policy: erfüllt: camera, microphone, geolocation und payment gesperrt; die App nutzt kein getUserMedia (grep leer)
- Teil-CSP vorhanden (object-src, base-uri, form-action): teilweise erfüllt: object-src 'none', base-uri 'self', form-action 'self' gesetzt; script-src fehlt (siehe Fund)
- Kein Server-Fingerprint: erfüllt: poweredByHeader false, kein X-Powered-By in den Live-Antworten
- PDF-Antworten: Caching und Content-Disposition: erfüllt: Cache-Control private, no-store auf allen PDF-Routen; Dateinamen bereinigt (nur Buchstaben, Ziffern, Bindestrich bzw. ASCII), keine Header-Injektion
- Inline-Skripte und HTML-Senken im Frontend: erfüllt: dangerouslySetInnerHTML nur für das Darstellungs-Skript (feste Konstante ohne Benutzerdaten); kein innerHTML, insertAdjacentHTML, document.write, srcdoc, eval oder new Function in src;
- Externe Links: erfüllt: alle target="_blank" mit rel=noopener; Konfigurator- und Händlerportal-Adressen der Lieferanten serverseitig auf https:// geprüft (javascript:-URLs blockiert zusätzlich React 19)
- Aktivitäts-Cookie (AKTIV_COOKIE): erfüllt bei den Flags: HttpOnly, SameSite=Lax, Secure bei HTTPS, Path=/ (zur fehlenden Lebensdauer siehe Fund Inaktivität)
- CSRF-Schutz der Server-Aktionen: erfüllt: keine serverActions.allowedOrigins konfiguriert, damit greift die eingebaute Origin/Host-Prüfung von Next nur für dieselbe Herkunft; zusätzlich SameSite=Lax an allen Sitzungscookies;
- CORS in eigenen Endpunkten: erfüllt: kein Route-Handler setzt Access-Control-Allow-*; nur Vercel setzt * auf statische Seiten (siehe niedriger Fund)
- Offene Weiterleitungen: erfüllt: Rücksprungziele nur intern (beginnt mit /, nicht // oder /\); Abmeldegrund nur aus fester Liste
- Zugriff ohne Anmeldung auf Seiten und PDFs (Header-Sicht): erfüllt: / und /pdf/beleg/<id> leiten ohne Sitzung mit 307 auf /anmelden um, ohne Inhalt
- Kein Supabase-Client und keine Schlüssel im Browser für die CSP-Planung: erfüllt: kein createBrowserClient; der Browser spricht Supabase nur über serverseitig signierte Upload- und Download-Adressen an, daher genügt connect-src/img-src mit genau der Projekt-URL aus NEXT_PU …

#### Microsoft Graph, OneDrive, Lexware

- Graph-Berechtigung: Client-Credentials mit Scope .default, keine Benutzer- oder Mailrechte: erfüllt
- Übergabe-Anleitung zur App-Registrierung: erfüllt
- Graph-Zugriffstoken verschlüsselt gespeichert, nur Service-Rolle: erfüllt
- Weitere gespeicherte Geheimnisse in der Datenbank: keine gefunden
- Lexware-API-Schlüssel nur aus der Umgebung, nur an https://api.lexware.io, nicht in Meldungen oder Logs: erfüllt
- Git-Historie auf eingecheckte Graph- und Lexware-Schlüssel: keine echten Werte
- Benutzergesteuerte Teile in Lexware-URLs: erfüllt
- Ordner- und Dateinamen (Kundennamen) in Graph-Pfaden: erfüllt
- Uploads in die Ablage: Typ und Größe serverseitig, privater Speicher: erfüllt
- Ablage-Tabellen nur über Service-Rolle schreibbar: erfüllt
- Altbestand-Schalter standardmäßig aus: erfüllt
- Cron der Ablage nur mit CRON_SECRET: erfüllt
- Graph-Fehlermeldungen ohne Geheimnisse: erfüllt
- Webhook-Herkunft und Doppelzustellung (Teilaspekt Lexware-Anbindung): erfüllt (bis auf organizationId, siehe Fund)
- TLS zu externen Diensten: erfüllt (Standardkonfiguration)

#### Abhängigkeiten

- npm audit für Produktivabhängigkeiten (npm audit --omit=dev --json): Erfüllt: 0 Befunde (info 0, low 0, moderate 0, high 0, critical 0) bei 200 Produktivabhängigkeiten.
- npm audit für alle Abhängigkeiten (npm audit --json): Keine hohen oder kritischen Befunde. 7 moderate, alle nur in der Entwicklung (typescript-eslint/minimatch) und ohne --force behebbar.
- Herkunft und Integrität der Pakete (npm audit signatures): Erfüllt: Alle installierten Pakete haben gültige Registry-Signaturen.
- package-lock.json vorhanden, versioniert und konsistent: Erfüllt: lockfileVersion 3 ist eingecheckt (git ls-files) und stimmt mit package.json überein. npm ls --omit=dev --depth=0 und npm ls --depth=0 laufen ohne Fehler (exit 0).
- Install-Skripte (preinstall/postinstall) in Abhängigkeiten: Unauffällig: Nur ein Paket hat ein Install-Skript, unrs-resolver@1.12.2. Es ist eine Entwicklungsabhängigkeit (ESLint-Import-Resolver mit nativen Binärdateien) und bekannt.
- Next.js: kritische Advisories vom Oktober 2026 und CVE-2025-29927 (Middleware-Bypass): Erfüllt: Next 16.4.2 enthält die Korrekturen aus 16.4.1 (14.10.2026) für GHSA-2464-fhr4-w9xw (RCE im Image Optimizer über SVG, kritisch), GHSA-673q-mjm6-r5xr (RCE bei 'use cache', kritisch) und GHSA-p …
- sharp (Bildoptimierung) auf gepatchtem Stand: Erfüllt: sharp 0.35.5 entspricht dem Workaround aus GHSA-2464-fhr4-w9xw (mindestens 0.35.5).
- Voraussetzungen der offenen Next-Advisories aus 16.4.5 im Projekt: Weitgehend nicht erfüllt: Es gibt keine 'use cache'- oder unstable_cache-Funktionen und keine Edge-Runtime-Routen. partialPrefetching: true ist der Workaround für GHSA-vvgp-ww4w-46vf.
- @tiptap/* auf dem Stand der Korrekturen von 2026: Erfüllt: Installiert ist 3.33.1, also neuer als die Fixes für GHSA-cp6q-959q-f8rh (3.30.4) und GHSA-j95f-988m-3j2f (3.30.5).
- sanitize-html: Version und enge Konfiguration: Erfüllt: 2.18.1 enthält die Fixes für CVE-2026-113650 und CVE-2026-113654. Die Whitelist ist eng: keine textarea, xmp, svg, meta oder iframe-Tags, keine URL-Attribute, allowedSchemes leer.
- Supabase-, PDF- und weitere Produktivpakete: Keine bekannten Advisories gefunden: @supabase/ssr 0.12.7 (aktuell), @supabase/supabase-js 2.119.0 (aktuell), @react-pdf/renderer 4.9.0 (aktuell). pdf-lib ist nicht installiert.
- Dependabot-Konfiguration (.github/dependabot.yml): Erfüllt: Für npm (directory /) und github-actions sind wöchentliche Updates eingerichtet, open-pull-requests-limit 10.
- GitHub-Workflows: Rechte, Secrets, pull_request_target: Nicht relevant bzw. kein Risiko: Es gibt keine Workflows, also weder pull_request_target noch Secrets in der CI oder zu weite GITHUB_TOKEN-Rechte. Auch in der Historie gab es nie einen Workflow.
- Versions-Pinning des Frameworks: Erfüllt: next, react, react-dom und eslint-config-next sind exakt gepinnt, die übrigen Pakete über Caret-Ranges mit Lockfile.
- Framework-Fingerprinting: Erfüllt: Der X-Powered-By-Header ist abgeschaltet.

#### Supabase-Advisors und Plattform

- Selbstregistrierung abgeschaltet (nur Einladung): erfüllt
- Keine weiteren Anmeldewege offen: erfüllt
- MFA (TOTP) aktiv und in der Datenbank erzwungen: erfüllt
- Passwortrichtlinie: erfüllt (ohne Leak-Prüfung, siehe Fund)
- Token-Lebensdauer und Refresh-Rotation: erfüllt
- Nicht angemeldete Aufrufer sehen keine Daten (REST, GraphQL, OpenAPI, Storage): erfüllt
- RLS auf allen Tabellen: erfüllt bis auf app.basis (nicht erreichbar, siehe Fund)
- Funktionen: keine aufrufbaren SECURITY-DEFINER-Funktionen im API-Schema, search_path fest: erfüllt
- Standardrechte für neue Objekte: erfüllt
- Erweiterungen und Hintergrundjobs in Postgres: erfüllt
- Datenbankrollen mit LOGIN: erfüllt
- Storage-Buckets privat mit Grenzen: erfüllt (Hinweise siehe Funde belege/ablage-puffer)
- Supabase-Advisors ohne ERROR: erfüllt; eine WARN offen (Leaked-Password-Schutz)
- Region und Datenstandort: erfüllt
- Vercel-Konfiguration: Crons nur mit CRON_SECRET: erfüllt
- API-Schlüssel im neuen Format und richtig zugeordnet: erfüllt
- Pro-Tarif verfügbar für Plattform-Härtung: info

#### Fehlermeldungen, Logging, Audit

- Audit-Trigger auf allen Fachtabellen (Staging ufopfstnqhitiyvelhjn): erfüllt: alle 47 Tabellen in public mit Fachdaten haben den Trigger protokoll (AFTER INSERT OR DELETE OR UPDATE → audit.protokoll).
- Inhalt des Audit-Logs (wer, wann, was, vorher, nachher): erfüllt: audit.log speichert zeit (timestamptz), benutzer_id (app.handelnder()), db_rolle, tabelle, datensatz_id, aktion (insert/update/soft_delete/restore/delete), vorher, nachher (vollständige Zeile …
- Handelnder bei Service-Rolle: erfüllt: app.handelnder() = coalesce(auth.uid(), app.im_namen_von nur bei role=service_role). Die Serverfunktionen lexware_*, ablage_*_setzen, Zahlungs- und Formularfunktionen setzen set_config('app.i …
- Schutz des Audit-Logs vor Änderung/Löschung durch Benutzer: erfüllt: Schema audit ohne USAGE für anon und authenticated, audit.log RLS aktiv ohne Policies, einzige Berechtigung service_role:SELECT (kein INSERT/UPDATE/DELETE).
- Fehlermeldungen der Anmeldung (keine Benutzer-Enumeration): erfüllt: einheitlich „E-Mail oder Passwort ist falsch.“, eigener Text nur bei 429; „Passwort vergessen“ antwortet immer gleich; MFA-Fehler ohne Details; Passwortänderung ohne Rohtexte.
- Maschinen-Endpunkte geben keine internen Fehler preis: erfüllt: Webhook und Crons antworten nur mit Status ("fehler", "Signatur ungültig", "Nicht berechtigt"); Details nur in console.error bzw. lexware_ereignis.
- Microsoft-Graph-Fehlertexte: erfüllt: GraphFehler enthalten nur eigene deutsche Texte plus HTTP-Status und Fehlercode (z. B. AADSTS…), keine Antwortkörper, Token oder Client-Secret.
- Route-Handler für PDFs: erfüllt: nur feste Texte ("Beleg nicht gefunden", "Ungültige Daten", eigene Prüfmeldungen); unbehandelte Ausnahmen liefert Next in Produktion als generische 500.
- Geheimnisse in Logs: erfüllt: alle 16 console-Aufrufe in src geben nur Fehlermeldungen, IDs, Ereignistyp oder Zählwerte aus; keine Header, Tokens, Schlüssel oder Request-Bodies.
- Debug-Endpunkte, Test-Bypässe: erfüllt: einzige API-Routen sind /api/cron/ablage, /api/cron/zahlungsabgleich, /api/lexware/webhook; keine von NODE_ENV/E2E/DEBUG abhängigen Umgehungen im Code;
- /styleguide in Produktion: erfüllt: liegt in der Gruppe (app), Shell ruft pruefeSitzung() (aal2 + aktives Konto), der Proxy leitet ohne Sitzung um.
- Source-Maps im Produktions-Build: erfüllt: productionBrowserSourceMaps nicht gesetzt (Standard aus), keine *.map unter .next/static; poweredByHeader: false.
- Protokollierung von Anmeldung, MFA und Passwortänderung: teilweise erfüllt: Supabase-Auth-Logs enthalten Anmeldungen, Fehlversuche und MFA (Staging, letzte 24 h: 32 invalid_credentials, 534 MFA-Ereignisse);
- Eigene fachliche Fehlermeldungen der Datenbankfunktionen: erfüllt: Lösch- und Regelprüfungen werfen deutsche, fachliche Texte mit eigenen SQLSTATEs (z. B. kunde_loeschen_pruefen 23503, kolonne_monteur 23505, einsatz_speichern 23514, abwesenheit_status 42501) …

#### Nachprüfung: Fachliche Abläufe und Zustandsübergänge direkt per PostgREST

- Fall 1: Fertiggestellte Rechnung, Abschlag oder Gutschrift sowie Teil-AB, Lieferschein und Zahlungsbestätigung direkt ändern (Kopf, Positionen, Datum, Kunde, Steuerart, deleted_at): Verhindert (Ausnahme pdf_pfad, siehe Fund).
- Fall 1/4: Status und Lexware-Felder von Lexware-Belegen direkt setzen (offen, bezahlt, storniert, lexware_id, lexware_offen, steuern, abschlag_nr, offen_betrag, fertiggestellt_*): Verhindert.
- Fall 2: Belegnummer ändern oder frei setzen, Auftragsnummer ändern, Nummernkreis manipulieren, app.naechste_nummer aufrufen: Verhindert (Ausnahme: art-Wechsel am Entwurf, siehe Fund).
- Fall 3: beleg_version ändern oder löschen: Verhindert (Einfügen ist offen, siehe Fund).
- Fall 4: Zahlung mit quelle='lexware' oder abgeglichen einfügen, Zahlungen ändern, fremde oder abgeglichene Zahlung entfernen, Zahlungsbestätigung doppelt anlegen: Verhindert.
- Fall 5: Auftrag direkt einfügen; teil, abschlag_nr und Abzüge frei setzen; zweite Schlussrechnung: Verhindert (Ausnahmen kette_id/vorgaenger_id/art am Entwurf und abzug_beleg_id bei direktem INSERT, siehe Funde).
- Fall 6: service_ticket.status direkt auf 'abgerechnet' setzen: Verhindert.
- Fall 7: Freigegebene Zeitbuchung ändern oder löschen; Freigabe-Felder fälschen; Einsatz.fest: Zeitbuchung verhindert. Einsatz.fest ist nach Spezifikation für jeden Büro-Benutzer erlaubt.
- Fall 8: Angebotsstatus bei vorhandener AB zurücksetzen; „Nicht beauftragt“ setzen; Angebot oder AB nach Folgebeleg bearbeiten: Verhindert (Umgehung der AB-Sperre über kette_id am Folgebeleg-Entwurf, siehe Fund).
- Fall 9: Audit-Log für direkte Schreibwege: Erfüllt: Jeder direkte Schreibweg auf die geprüften Tabellen erzeugt einen Eintrag mit vorher/nachher. Das Log ist für Benutzer weder les- noch schreibbar, der Handelnde lässt sich nicht fälschen.
- Vorgangs-Kennzeichen app.beleg_vorgang: Kann ein Benutzer es außerhalb der vorgesehenen RPCs setzen?: Nein. Das Kennzeichen gilt nur innerhalb der Transaktion, und es gibt keinen Weg über die API, mehrere Anweisungen in einer Transaktion zu bündeln.

#### Nachprüfung: Werkzeuge, Skripte und Tests: Schutz gegen Produktion und echtes Lexware, Echtdaten in Staging

- .env.local zeigt auf Staging: erfüllt: NEXT_PUBLIC_SUPABASE_URL und SUPABASE_DB_URL gehören beide zu ufopfstnqhitiyvelhjn, LEXWARE_ALTBESTAND und ONEDRIVE_ALTBESTAND sind nicht aktiv, SUPABASE_AUTH_SITE_URL ist localhost
- Env-Dateien nicht im Repository: erfüllt: .gitignore schließt .env* aus, Ausnahme nur .env.example (enthält keine Werte); im Arbeitsverzeichnis gibt es nur .env.local und .env.example
- staging-leeren.mjs: Schutzmaßnahmen: teilweise erfüllt: --projekt ist Pflicht, Abbruch bei aktivem Altbestand-Schalter, ohne --ja nur Vorschau, Datenbank in einer Transaktion mit Rollback, OneDrive wird nur geleert, wenn der Basisordner  …
- airtable-import.mjs: Schutzmaßnahmen: erfüllt bis auf die Prüfung der DB-URL: Standard ist der Probelauf, --schreiben braucht --projekt, --lexware-lesen nur mit LEXWARE_ALTBESTAND=aktiv, Airtable wird nur gelesen (GET), an Lexware geht ke …
- golive-pruefung.mjs nur lesend: erfüllt: Lexware nur GET (profile, voucherlist, contacts) mit Drosselung und 429-Backoff, Datenbank nur SELECT
- lexware-webhook.mjs: Umgang mit dem Schlüssel: erfüllt: Schlüssel erscheint nie in der Ausgabe, Befehl „konto“ zeigt vor dem Anlegen Firma und organizationId, Callback-URL wird auf https://…/api/lexware/webhook geprüft, Drosselung 600 ms
- passwort-setzen.mjs: Umgang mit dem Passwort: erfüllt: Eingabe nur verdeckt im TTY, zweimal, nie als Argument oder in der Ausgabe, Passwortregeln geprüft; Projekt-Host und Benutzer werden vor der Eingabe angezeigt (Abbruch mit Strg+C möglich)
- admin-einladen.mjs: Umgang mit dem Einladungslink: erfüllt: Link wird nicht auf der Konsole ausgegeben, sondern in eine Datei im Temp-Ordner (Modus 0600) geschrieben; schlägt das Anlegen in public.benutzer fehl, wird der Auth-Benutzer wieder gelöscht
- Aufräumen der RLS-Tests: erfüllt: eigene Testbenutzer rls-test-*, Aufräumen über die DB-Verbindung und auth.admin.deleteUser; auf Staging sind 0 rls-test-Konten übrig
- Aufräumen der E2E-Tests: überwiegend erfüllt: 28 von 29 E2E-Tests rufen aufraeumen() im finally auf, nur uebergang.e2e.mjs nicht (siehe Fund); BEHALTEN=1 behält Daten nur bei lexware.e2e.mjs und nur auf Wunsch
- Lexware-Tests mit Sperre gegen Altbestand: teilweise erfüllt: kontakte, uebergang und altbestand brechen bei LEXWARE_ALTBESTAND=aktiv ab; lexware und zahlungen haben diese Sperre nicht (siehe Fund)
- App greift ohne Schalter nicht auf übernommene Lexware-IDs und OneDrive-Ordner zu: erfüllt: Fertigstellen mit übernommenem Vorgänger wird abgelehnt, Webhook und Zahlungsabgleich ignorieren übernommene Belege, Schreiben in übernommene Ordner ist gesperrt
- Audit-Log erfasst Änderungen an benutzer, auch über Service-Rolle und DB-Verbindung: erfüllt (ohne handelnde Person, siehe Info-Fund): Trigger „protokoll“ auf public.benutzer; audit.log enthält Inserts und Updates mit service_role sowie Deletes mit postgres
- Fremdschlüssel benutzer → auth.users: erfüllt: ON DELETE RESTRICT verhindert, dass ein Auth-Konto gelöscht wird, solange noch eine Benutzerzeile existiert;

#### Nachprüfung: Next.js 16: vorgerenderte Shells, RSC-/Segment-Antworten, Proxy-Matcher-Umgehung und Cache-Header

- Vorgerenderte Shells in .next/server/app (HTML, RSC, .segments, .meta, .body) auf eingebettete Fachdaten durchsucht: In Ordnung. 291 Dateien gescannt: 0 UUIDs, 0 IBAN, 0 JWT- oder sb_-Schlüssel, 0 Supabase-Projekt-URLs, 0 USt-IdNr.
- .meta-Dateien und prerender-manifest auf Cache-Header: In Ordnung. 48 von 49 .meta enthalten nur x-nextjs-prerender: 1, x-nextjs-stale-time: 300, x-next-cache-tags und link. Cache-Control hat nur favicon.ico.meta (public, max-age=0, must-revalidate).
- Datenzugriff in Server-Komponenten immer dynamisch, keine Daten im Build: In Ordnung. createClient() wartet auf connection() und cookies() (src/lib/supabase/server.ts:12-14). Es gibt weder „use cache“ noch unstable_cache, cacheLife/cacheTag, generateStaticParams, dynamic='f …
- Proxy deckt RSC-, Prefetch- und Segment-Anfragen ab: In Ordnung. Der kompilierte Matcher hängt das optionale Suffix `(\.json|\.rsc|\.segments\/.+\.segment\.rsc)` an.
- Dynamische Seiten und Route-Handler prüfen die Sitzung selbst (aal2, aktives Konto), unabhängig vom Proxy: In Ordnung. Alle Lader der [id]-Seiten rufen pruefeSitzung auf: ladeAnfrage (src/lib/anfragen.ts:79), ladeKunde (src/lib/kunden.ts:74), ladeBestellung/ladeBestellAuswahl/ladeLieferant (src/lib/einkauf …
- Server-Aktionen prüfen die Sitzung selbst: In Ordnung. Von 129 exportierten Server-Aktionen rufen 119 direkt pruefeSitzung/pruefeAdmin oder einen lade*-Lader mit Prüfung auf.
- Cache-Control und Vary für dynamische RSC-Antworten und PDFs: In Ordnung. Dynamische RSC-Antworten: live „private, no-store, no-cache, max-age=0, must-revalidate“ (/kunden/x.png und /anmelden mit RSC: 1).
- Sicherheits-Header auch auf Antworten ohne Proxy: In Ordnung. Auch die umgangenen Antworten (/kunden/x.png) tragen Strict-Transport-Security (max-age=63072000; includeSubDomains;
- Bekannte Umgehung über den Header x-middleware-subrequest: Nicht betroffen: Next.js 16.4.2. Die Lücke CVE-2025-29927 ist seit 15.2.3 geschlossen.

#### Nachprüfung: Supabase Realtime, Edge Functions und signierte Storage-Adressen

- Edge Functions auf Staging: Erfüllt: Auf Staging ist keine Edge Function deployt, und im Repository gibt es keinen Ordner supabase/functions.
- Realtime Postgres-Changes: Erfüllt: Die Publication supabase_realtime enthält keine Tabelle, über Realtime werden keine Fachdaten gestreamt.
- Realtime private Kanäle (realtime.messages): Erfüllt: Auf realtime.messages ist RLS aktiv und es gibt keine Policy. Private Broadcast- und Presence-Kanäle sind deshalb für anon und authenticated gesperrt.
- Kein Supabase-Client im Browser: Erfüllt: Der Publishable Key wird nur im Proxy und in Serverbausteinen verwendet. Es gibt kein createBrowserClient und kein Realtime-Abo im Client.
- Laufzeit und Überschreibschutz der signierten Upload-URLs: Erfüllt: Signierte Upload-URLs gelten 2 Stunden (Supabase-Standard). Beide Aufrufe erzeugen sie ohne upsert. Ein vorhandenes Objekt lässt sich darüber nicht ersetzen.
- Pfade für signierte URLs: Pfad-Traversal: Erfüllt: Den Upload-Pfad erzeugt der Server: crypto.randomUUID() + '/foto' bzw. + '/' + Dateiname nach sharepointName, das / \ : * ? " < > | # % und Steuerzeichen entfernt sowie führende Punkte und Ti …
- Lese-URLs nur für Nachrichten, die der Benutzer lesen darf: Erfüllt: ladeChat liest die Nachrichten mit der Sitzung des Benutzers. Die RLS-Policy 'lesen' verlangt deleted_at IS NULL und app.ist_benutzer().
- Signierte URLs in Logs, Fehlertexten und Audit-Log: Erfüllt: Kein console.* gibt eine signedUrl oder ein Token aus. Fehlertexte an den Client enthalten keine URL.
- Chat-Fotos: Größe und Typ serverseitig: Erfüllt im regulären Ablauf: Der Bucket chat-fotos ist privat, mit Grenze 15 MB und MIME-Liste. Der Server lädt die Datei vor dem Speichern herunter, prüft Magic Bytes und Größe und löscht ungültige D …
- Chat-Nachrichten unveränderlich: Erfüllt: Benutzer können Nachrichten nicht ändern. Die UPDATE-Policy steht auf false, gelöscht wird nur als Markierung über die RPC loeschen.

#### Nachprüfung: Ressourcenverbrauch und Anti-Automation eigener Endpunkte

- Wochenplan-PDF: Aufwand begrenzt: Erfüllt. Die Sitzung wird zuerst geprüft. Der Zeitraum ist immer genau eine Woche (wocheAus normalisiert auf den Montag, ungültige Werte werden zur aktuellen Woche).
- Formular-PDF und Aufmaß: Aufwand begrenzt: Erfüllt. Sitzung und UUID werden geprüft, die Daten mit RLS gelesen. Ein Aufmaß hat höchstens 500 Zeilen, alle Feldlängen sind gekürzt (Raum/Element 200, Bemerkung 1000, Hinweise 4000, Maße 6 Ziffern) …
- Beleg-PDF: kein wiederholtes Erzeugen bzw. Abholen bei fertigen Belegen: Erfüllt. ladeBeleg prüft UUID und Sitzung. Fertige App-Belege werden einmal erzeugt und abgelegt, danach aus dem Speicher geladen.
- Beleg-Eingabe: Mengen- und Längengrenzen serverseitig: Erfüllt. Höchstens 500 Positionen, Titel 300, Einheit 20, Kopftexte 4000, Adressfelder 80–200, Tags höchstens 30 mit je 40 Zeichen, Beschreibung nach Whitelist-Bereinigung höchstens 20.000 Zeichen.
- Body-Größe der Server-Actions: Erfüllt. serverActions.bodySizeLimit ist in next.config.ts nicht überschrieben, es gilt der Next-Standard von 1 MB.
- Globale Suche: Mindest- und Höchstlänge, Treffergrenze, Laufzeit: Erfüllt. Die Suche läuft ab 2 Zeichen, die App kürzt auf 100 Zeichen. In der Datenbank ist p_je_bereich auf 1–50 begrenzt, Vorschläge zeigen 3 je Bereich, die Ergebnisseite 50.
- Zahlungsabgleich beim Öffnen von Seiten: serverseitige Sperre: Erfüllt. Die Sperre von 5 Minuten liegt in der Datenbank (lexware_abgleich_beginnen mit SELECT … FOR UPDATE auf der einen Zeile in einstellung) und gilt damit für alle Instanzen.
- Fertigstellen von Lexware-Belegen: Sperre gegen Mehrfachklick bzw. doppelte Übertragung: Erfüllt. lexware_start sperrt den Beleg (FOR UPDATE), lehnt Belege ab, die schon fertig sind oder eine lexware_id haben, und blockiert eine laufende Übertragung für 3 Minuten.
- Lexware-Client: Umgang mit 429 und Zeitgrenzen: Teilweise erfüllt. Abstand 520 ms, Retry-After wird beachtet, exponentielles Backoff mit höchstens 6 Versuchen, Timeout 30 s je Aufruf, POST wird bei Fehlern nicht blind wiederholt.
- Fremdbelege-Prüfung (Lexware-Belegliste): Erfüllt. Ohne erzwingen gilt eine Sperre von 30 Minuten über einen Zeitstempel in der Datenbank. Erzwingen können nur Admins (pruefeAdmin), höchstens 20 Seiten.
- Chat-Polling und Senden: Erfüllt. Abfrage alle 10 s nur bei sichtbarem Tab, als günstige Count-Abfrage mit limit(1). Die Historie lädt höchstens 300 Nachrichten, der Text ist auf 4000 Zeichen begrenzt, der Fotopfad wird per R …
- OneDrive-Ablage: Idempotenz und Begrenzung der Hintergrundläufe: Erfüllt. Uploads nutzen conflictBehavior=replace, es entstehen also keine Duplikate. Ordner werden mit fail angelegt. Je Datei sind höchstens 20 Versuche erlaubt.
- Passwort ändern: kein Orakel für fremde Konten: Erfüllt. Die Prüfanmeldung nutzt fest die E-Mail des angemeldeten Benutzers und verlangt aal2. Die kurzlebige Prüfsitzung wird sofort beendet (signOut scope local).
- Kunden-Synchronisation mit Lexware beim Speichern: Läuft nur für Kunden, die schon in Lexware liegen, und laut Architektur nur bei geänderter Prüfsumme (lexware_hash). Die Interna von kontaktAktualisieren wurden nicht im Detail geprüft (info).
