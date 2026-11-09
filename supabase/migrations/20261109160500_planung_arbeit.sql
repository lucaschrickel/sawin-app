-- =====================================================================================================================
-- Einsätze, Zeiten, Aufgaben, Termine, Formulare, Chat, Notizen, Benachrichtigungen, Einkauf
-- =====================================================================================================================

create table public.einsatz (
  id uuid primary key default gen_random_uuid(),
  auftrag_id uuid references public.auftrag (id),
  ticket_id uuid references public.service_ticket (id),
  beginn timestamptz not null,
  ende timestamptz not null,
  fahrzeug_id uuid references public.fahrzeug (id),
  ressource_id uuid references public.ressource (id),
  fest boolean not null default false,
  farbe text check (farbe is null or farbe ~ '^plan-([1-9]|10)$' or farbe ~ '^#[0-9A-Fa-f]{6}$'),
  hinweis text,
  like app.basis including defaults,
  check (num_nonnulls(auftrag_id, ticket_id) = 1),
  check (ende > beginn)
);
comment on table public.einsatz is 'Termin in Montage- bzw. Service-Plan. fest = freigegeben (sonst vorgeplant). Beliebig viele je Auftrag oder Ticket.';
comment on column public.einsatz.farbe is 'Paletten-Token plan-1 … plan-10 oder frei gewählte Farbe #RRGGBB; leer = Standard nach Typ';
create index einsatz_zeit_idx on public.einsatz (beginn, ende);
select app.einrichten('einsatz', '(select app.ist_benutzer())', '(select app.ist_benutzer())');

create table public.einsatz_monteur (
  id uuid primary key default gen_random_uuid(),
  einsatz_id uuid not null references public.einsatz (id),
  mitarbeiter_id uuid not null references public.mitarbeiter (id),
  like app.basis including defaults
);
create unique index einsatz_monteur_uk on public.einsatz_monteur (einsatz_id, mitarbeiter_id) where deleted_at is null;
select app.einrichten('einsatz_monteur', '(select app.ist_benutzer())', '(select app.ist_benutzer())');
create trigger nur_monteur before insert or update on public.einsatz_monteur
  for each row execute function app.nur_monteur();

create table public.zeitbuchung (
  id uuid primary key default gen_random_uuid(),
  mitarbeiter_id uuid not null references public.mitarbeiter (id),
  auftrag_id uuid references public.auftrag (id),
  ticket_id uuid references public.service_ticket (id),
  datum date not null,
  beginn time not null,
  ende time not null,
  pause_min integer not null default 0 check (pause_min >= 0),
  art text not null check (art in ('montage', 'aufmass', 'service', 'lager', 'fahrt', 'buero')),
  taetigkeit text,
  freigabe text not null default 'offen' check (freigabe in ('offen', 'freigegeben')),
  freigegeben_von uuid references public.benutzer (id),
  freigegeben_am timestamptz,
  like app.basis including defaults,
  check (num_nonnulls(auftrag_id, ticket_id) <= 1),
  check (ende > beginn),
  check (pause_min < extract(epoch from (ende - beginn)) / 60)
);
comment on table public.zeitbuchung is 'Vom Büro erfasste Arbeitszeiten. Bezug Auftrag, Ticket oder ohne Bezug (Lager, Fahrt, Büro).';
create index zeitbuchung_datum_idx on public.zeitbuchung (mitarbeiter_id, datum);
select app.einrichten('zeitbuchung', '(select app.ist_benutzer())', '(select app.ist_benutzer())');

create table public.aufgabe (
  id uuid primary key default gen_random_uuid(),
  titel text not null check (length(trim(titel)) > 0),
  zustaendig_id uuid references public.mitarbeiter (id),
  faellig date,
  prioritaet text not null default 'normal' check (prioritaet in ('niedrig', 'normal', 'hoch')),
  status text not null default 'offen'
    check (status in ('offen', 'in_arbeit', 'wartet_zulieferer', 'wartet_kunde', 'erledigt')),
  notiz text,
  auftrag_id uuid references public.auftrag (id),
  ticket_id uuid references public.service_ticket (id),
  like app.basis including defaults,
  check (num_nonnulls(auftrag_id, ticket_id) <= 1)
);
select app.einrichten('aufgabe', '(select app.ist_benutzer())', '(select app.ist_benutzer())');

create table public.termin (
  id uuid primary key default gen_random_uuid(),
  titel text not null,
  art text not null default 'beratung' check (art in ('beratung', 'intern')),
  datum date not null,
  beginn time not null,
  ende time not null,
  kunde_id uuid references public.kunde (id),
  anfrage_id uuid references public.anfrage (id),
  auftrag_id uuid references public.auftrag (id),
  ort text,
  notiz text,
  like app.basis including defaults,
  check (ende > beginn)
);
comment on table public.termin is 'Termine (Beratung, Intern). Montage und Service entstehen als einsatz, Aufmaß-Termine an der Anfrage.';
select app.einrichten('termin', '(select app.ist_benutzer())', '(select app.ist_benutzer())');

create table public.termin_mitarbeiter (
  id uuid primary key default gen_random_uuid(),
  termin_id uuid not null references public.termin (id),
  mitarbeiter_id uuid not null references public.mitarbeiter (id),
  like app.basis including defaults
);
create unique index termin_mitarbeiter_uk on public.termin_mitarbeiter (termin_id, mitarbeiter_id) where deleted_at is null;
select app.einrichten('termin_mitarbeiter', '(select app.ist_benutzer())', '(select app.ist_benutzer())');

create table public.formular (
  id uuid primary key default gen_random_uuid(),
  typ text not null check (typ in ('aufmass', 'montageprotokoll', 'servicebericht', 'uebergabeprotokoll')),
  anfrage_id uuid references public.anfrage (id),
  auftrag_id uuid references public.auftrag (id),
  ticket_id uuid references public.service_ticket (id),
  datum date not null default current_date,
  status text not null default 'entwurf'
    check (status in ('entwurf', 'abgeschlossen', 'gedruckt', 'scan_abgelegt')),
  erfasst_von uuid references public.mitarbeiter (id),
  hinweise text,
  pdf_pfad text,
  scan_pfad text,
  like app.basis including defaults,
  check (num_nonnulls(anfrage_id, auftrag_id, ticket_id) = 1),
  check (anfrage_id is null or typ = 'aufmass'),
  check (case when typ = 'aufmass' then status in ('entwurf', 'abgeschlossen')
              else status in ('gedruckt', 'scan_abgelegt') end)
);
select app.einrichten('formular', '(select app.ist_benutzer())', '(select app.ist_benutzer())');

create table public.aufmass_zeile (
  id uuid primary key default gen_random_uuid(),
  formular_id uuid not null references public.formular (id),
  reihenfolge integer not null default 0,
  raum text,
  element text,
  breite_mm integer check (breite_mm > 0),
  hoehe_mm integer check (hoehe_mm > 0),
  anzahl integer not null default 1 check (anzahl > 0),
  anschlag text,
  bemerkung text,
  like app.basis including defaults
);
select app.einrichten('aufmass_zeile', '(select app.ist_benutzer())', '(select app.ist_benutzer())');

-- ---------------------------------------------------------------------------------------------------------------------
-- Chat, Notizen, Benachrichtigungen
-- ---------------------------------------------------------------------------------------------------------------------
create table public.chat_nachricht (
  id uuid primary key default gen_random_uuid(),
  auftrag_id uuid references public.auftrag (id),
  ticket_id uuid references public.service_ticket (id),
  autor_id uuid not null default auth.uid() references public.benutzer (id),
  text text not null default '',
  foto_pfad text,
  erwaehnt uuid[] not null default '{}',
  like app.basis including defaults,
  check (num_nonnulls(auftrag_id, ticket_id) = 1),
  check (length(text) > 0 or foto_pfad is not null)
);
select app.einrichten('chat_nachricht', '(select app.ist_benutzer())',
  'autor_id = (select auth.uid()) and (select app.ist_benutzer())');

create table public.chat_gelesen (
  id uuid primary key default gen_random_uuid(),
  nachricht_id uuid not null references public.chat_nachricht (id),
  benutzer_id uuid not null default auth.uid() references public.benutzer (id),
  gelesen_am timestamptz not null default now(),
  like app.basis including defaults
);
create unique index chat_gelesen_uk on public.chat_gelesen (nachricht_id, benutzer_id) where deleted_at is null;
select app.einrichten('chat_gelesen',
  'benutzer_id = (select auth.uid()) and (select app.ist_benutzer())',
  'benutzer_id = (select auth.uid()) and (select app.ist_benutzer())');

create table public.historie_notiz (
  id uuid primary key default gen_random_uuid(),
  art text not null default 'notiz' check (art in ('telefonat', 'notiz')),
  text text not null check (length(trim(text)) > 0),
  kunde_id uuid references public.kunde (id),
  anfrage_id uuid references public.anfrage (id),
  auftrag_id uuid references public.auftrag (id),
  ticket_id uuid references public.service_ticket (id),
  like app.basis including defaults,
  check (num_nonnulls(kunde_id, anfrage_id, auftrag_id, ticket_id) = 1)
);
comment on table public.historie_notiz is 'Von Hand erfasste Telefonate und Notizen. Ereignisse der Historie kommen aus dem Audit-Log.';
select app.einrichten('historie_notiz', '(select app.ist_benutzer())', '(select app.ist_benutzer())');

create table public.benachrichtigung (
  id uuid primary key default gen_random_uuid(),
  benutzer_id uuid not null references public.benutzer (id),
  art text not null,
  text text not null,
  link text,
  gelesen_am timestamptz,
  like app.basis including defaults
);
comment on table public.benachrichtigung is 'Glocke: gespeicherte Hinweise (z. B. Erwähnungen). Berechnete Hinweise (überfällig, Konflikte) entstehen in der App.';
create index benachrichtigung_offen_idx on public.benachrichtigung (benutzer_id) where gelesen_am is null and deleted_at is null;
select app.einrichten('benachrichtigung',
  'benutzer_id = (select auth.uid()) and (select app.ist_benutzer())',
  '(select app.ist_benutzer())',
  'benutzer_id = (select auth.uid()) and (select app.ist_benutzer())');

-- ---------------------------------------------------------------------------------------------------------------------
-- Einkauf
-- ---------------------------------------------------------------------------------------------------------------------
create table public.bestellung (
  id uuid primary key default gen_random_uuid(),
  nummer text not null,
  lieferant_id uuid not null references public.lieferant (id),
  bestelldatum date not null default current_date,
  lieferanten_ab_nummer text,
  liefer_kw integer check (liefer_kw between 1 and 53),
  liefer_jahr integer check (liefer_jahr between 2000 and 2100),
  status text not null default 'bestellt' check (status in ('bestellt', 'bestaetigt')),
  notiz text,
  like app.basis including defaults,
  check ((liefer_kw is null) = (liefer_jahr is null))
);
comment on table public.bestellung is 'Bestellung beim Lieferanten, kann mehrere Aufträge abdecken. Geliefert/überfällig wird abgeleitet.';
create unique index bestellung_nummer_uk on public.bestellung (nummer);
select app.einrichten('bestellung', '(select app.ist_benutzer())', '(select app.ist_benutzer())');
create trigger nummer before insert or update on public.bestellung
  for each row execute function app.nummer_vergeben('bestellung');

create table public.bestellzeile (
  id uuid primary key default gen_random_uuid(),
  bestellung_id uuid not null references public.bestellung (id),
  auftrag_id uuid references public.auftrag (id),
  artikeltext text not null,
  menge numeric(12, 3) not null default 1 check (menge > 0),
  geliefert boolean not null default false,
  reihenfolge integer not null default 0,
  like app.basis including defaults
);
select app.einrichten('bestellzeile', '(select app.ist_benutzer())', '(select app.ist_benutzer())');
