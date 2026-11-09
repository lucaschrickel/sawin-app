-- =====================================================================================================================
-- Einstellungen, Nummernkreise, Artikel, Vorlagen, Zahlungsbedingungen, Kunden, Lieferanten, Konditionen
-- =====================================================================================================================

create domain public.belegart as text check (value in (
  'angebot', 'auftragsbestaetigung', 'teil_ab', 'lieferschein', 'zahlungsbestaetigung',
  'rechnung', 'abschlagsrechnung', 'gutschrift'));
comment on domain public.belegart is 'App-Belege: angebot, auftragsbestaetigung, teil_ab, lieferschein, zahlungsbestaetigung. Lexware-Belege: rechnung, abschlagsrechnung, gutschrift.';

-- ---------------------------------------------------------------------------------------------------------------------
-- Einstellungen (genau eine Zeile) und Einstellungen je Belegart
-- ---------------------------------------------------------------------------------------------------------------------
create table public.einstellung (
  id uuid primary key default gen_random_uuid(),
  einzig boolean not null default true unique check (einzig),
  firma_name text,
  firma_zusatz text,
  strasse text,
  plz text,
  ort text,
  land text not null default 'Deutschland',
  telefon text,
  email text,
  website text,
  ust_id text,
  steuernummer text,
  handelsregister text,
  geschaeftsfuehrung text,
  bank_name text,
  iban text,
  bic text,
  arbeitszeit_von time not null default '07:00',
  arbeitszeit_bis time not null default '16:00',
  bundesland text not null default 'NI' check (bundesland in
    ('BW', 'BY', 'BE', 'BB', 'HB', 'HH', 'HE', 'MV', 'NI', 'NW', 'RP', 'SL', 'SN', 'ST', 'SH', 'TH')),
  urlaubsanspruch_tage integer not null default 30 check (urlaubsanspruch_tage >= 0),
  angebot_gueltig_tage integer not null default 30 check (angebot_gueltig_tage > 0),
  like app.basis including defaults,
  check (arbeitszeit_bis > arbeitszeit_von)
);
comment on table public.einstellung is 'Firmendaten und Grundeinstellungen der Instanz. Genau eine Zeile. Zugangsdaten zu Diensten stehen nie hier, sondern in Umgebungsvariablen.';
select app.einrichten('einstellung', '(select app.ist_benutzer())', 'false', '(select app.ist_benutzer())');
insert into public.einstellung default values;

create table public.belegart_einstellung (
  id uuid primary key default gen_random_uuid(),
  belegart public.belegart not null,
  bcc_email text check (bcc_email is null or bcc_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  versand_gruppen jsonb not null default '[]'::jsonb,
  like app.basis including defaults
);
comment on table public.belegart_einstellung is 'Je Belegart: interne Kopie (BCC) beim Versand und Standard-PDF-Gruppen. Werte sind Daten der Instanz.';
create unique index belegart_einstellung_uk on public.belegart_einstellung (belegart) where deleted_at is null;
select app.einrichten('belegart_einstellung', '(select app.ist_benutzer())', '(select app.ist_benutzer())');
insert into public.belegart_einstellung (belegart)
select unnest(array['angebot', 'auftragsbestaetigung', 'teil_ab', 'lieferschein', 'zahlungsbestaetigung',
                    'rechnung', 'abschlagsrechnung', 'gutschrift']);

-- ---------------------------------------------------------------------------------------------------------------------
-- Nummernkreise: transaktionssicher über Zeilensperre, kein max()+1. Nummern werden nie wiederverwendet.
-- Muster: {JJ} = Jahr zweistellig, {N…} = laufende Nummer mit so vielen Stellen wie N.
-- ---------------------------------------------------------------------------------------------------------------------
create table public.nummernkreis (
  id uuid primary key default gen_random_uuid(),
  art text not null check (art in ('angebot', 'auftragsbestaetigung', 'lieferschein', 'zahlungsbestaetigung',
                                   'service_ticket', 'anfrage', 'kunde', 'bestellung')),
  muster text not null check (muster ~ '\{N+\}'),
  jaehrlich boolean not null default true,
  jahr integer not null default extract(year from now())::integer,
  letzte integer not null default 0 check (letzte >= 0),
  like app.basis including defaults
);
comment on table public.nummernkreis is 'Nummernkreise der App. Startwerte (letzte) nach der Airtable-Übernahme setzen. Rechnungsnummern vergibt Lexware.';
create unique index nummernkreis_art_uk on public.nummernkreis (art) where deleted_at is null;
select app.einrichten('nummernkreis', '(select app.ist_benutzer())', 'false', '(select app.ist_admin())');
insert into public.nummernkreis (art, muster, jaehrlich) values
  ('angebot', 'AG1{JJ}{NNNN}', true),
  ('auftragsbestaetigung', 'AB2{JJ}{NNNN}', true),
  ('lieferschein', 'LS1{JJ}{NNNN}', true),
  ('zahlungsbestaetigung', 'ZB1{JJ}{NNNN}', true),
  ('service_ticket', 'ST-{JJ}-{NNNN}', true),
  ('bestellung', 'BE-{JJ}-{NNN}', true),
  ('anfrage', '{N}', false),
  ('kunde', '{N}', false);

create function app.naechste_nummer(p_art text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_kreis public.nummernkreis;
  v_jahr integer := extract(year from (now() at time zone 'Europe/Berlin'))::integer;
  v_nr integer;
  v_stellen integer;
  v_text text;
begin
  if auth.uid() is not null and not app.ist_benutzer() then
    raise exception 'Keine Berechtigung' using errcode = '42501';
  end if;
  select * into v_kreis from public.nummernkreis where art = p_art and deleted_at is null for update;
  if not found then
    raise exception 'Kein Nummernkreis für %', p_art;
  end if;
  v_nr := case when v_kreis.jaehrlich and v_kreis.jahr <> v_jahr then 1 else v_kreis.letzte + 1 end;
  update public.nummernkreis set letzte = v_nr, jahr = v_jahr where id = v_kreis.id;
  v_text := replace(v_kreis.muster, '{JJ}', lpad((v_jahr % 100)::text, 2, '0'));
  v_stellen := length((regexp_match(v_text, '\{(N+)\}'))[1]);
  return regexp_replace(v_text, '\{N+\}', lpad(v_nr::text, greatest(v_stellen, length(v_nr::text)), '0'));
end $$;
grant execute on function app.naechste_nummer(text) to authenticated, service_role;

-- Vergibt die Nummer beim Anlegen, wenn keine angegeben ist (Argument: Art des Nummernkreises).
-- Angemeldete Benutzer können keine eigene Nummer vorgeben; die Nummer ändert sich danach nie.
create function app.nummer_vergeben() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if auth.uid() is not null or coalesce(new.nummer, '') = '' then
      new.nummer := old.nummer;
    end if;
    return new;
  end if;
  if auth.uid() is not null or coalesce(new.nummer, '') = '' then
    new.nummer := app.naechste_nummer(tg_argv[0]);
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------------------------------------------------
-- Artikel, Textvorlagen, Zahlungsbedingungen
-- ---------------------------------------------------------------------------------------------------------------------
create table public.artikel (
  id uuid primary key default gen_random_uuid(),
  bezeichnung text not null,
  einheit text not null default 'Stk',
  preis_netto numeric(12, 2) not null default 0,
  beschreibung_html text,
  schnellauswahl boolean not null default false,
  reihenfolge integer not null default 0,
  like app.basis including defaults
);
comment on column public.artikel.beschreibung_html is 'Bereinigtes HTML nach Whitelist (serverseitig geprüft), siehe CLAUDE.md „Formatierte Texte“';
select app.einrichten('artikel', '(select app.ist_benutzer())', '(select app.ist_benutzer())');

create table public.textvorlage (
  id uuid primary key default gen_random_uuid(),
  feld text not null check (feld in ('einleitung', 'lieferbedingungen', 'nachbemerkung')),
  belegarten public.belegart[] not null default '{}',
  name text not null,
  text text not null default '',
  standard boolean not null default false,
  like app.basis including defaults
);
select app.einrichten('textvorlage', '(select app.ist_benutzer())', '(select app.ist_benutzer())');

create table public.zahlungsbedingung (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  text text not null default '',
  zahlungsziel_tage integer not null default 14 check (zahlungsziel_tage >= 0),
  skontoziel_tage integer check (skontoziel_tage >= 0),
  skonto_prozent numeric(5, 2) check (skonto_prozent >= 0 and skonto_prozent < 100),
  belegarten public.belegart[] not null default '{}',
  standard_fuer public.belegart[] not null default '{}',
  like app.basis including defaults
);
comment on column public.zahlungsbedingung.text is 'Mit Platzhaltern {Zahlungsziel}, {Fälligkeitsdatum}, {Skonto}, {Skontoziel}, {Skontodatum}, {Skontobetrag}, {Betrag}, {Betrag nach Skonto}';
select app.einrichten('zahlungsbedingung', '(select app.ist_benutzer())', '(select app.ist_benutzer())');

-- ---------------------------------------------------------------------------------------------------------------------
-- Kunden
-- ---------------------------------------------------------------------------------------------------------------------
create table public.kunde (
  id uuid primary key default gen_random_uuid(),
  nummer text not null,
  name text not null check (length(trim(name)) > 0),
  typ text not null default 'privat' check (typ in ('privat', 'firma')),
  bauleister_13b boolean not null default false,
  ansprechpartner text,
  herkunft text,
  strasse text,
  plz text,
  ort text,
  land text not null default 'Deutschland',
  telefon text,
  email text,
  notiz text,
  lexware_kontakt_id text,
  lexware_seit timestamptz,
  like app.basis including defaults,
  check (not bauleister_13b or typ = 'firma')
);
comment on table public.kunde is 'Endkunden des Betriebs. Adresse = Rechnungsadresse (geht an Lexware). Konditionen liegen in kunde_kondition.';
create unique index kunde_nummer_uk on public.kunde (nummer);
create unique index kunde_lexware_uk on public.kunde (lexware_kontakt_id) where lexware_kontakt_id is not null;
select app.einrichten('kunde', '(select app.ist_benutzer())', '(select app.ist_benutzer())');
create trigger nummer before insert or update on public.kunde
  for each row execute function app.nummer_vergeben('kunde');

create table public.kunde_lieferadresse (
  id uuid primary key default gen_random_uuid(),
  kunde_id uuid not null references public.kunde (id),
  bezeichnung text,
  strasse text,
  plz text,
  ort text,
  alt_seit date,
  reihenfolge integer not null default 0,
  like app.basis including defaults
);
comment on column public.kunde_lieferadresse.alt_seit is 'Als „Alt“ markiert: nicht mehr vorschlagen oder vorbelegen, bestehende Belege behalten ihren Text';
select app.einrichten('kunde_lieferadresse', '(select app.ist_benutzer())', '(select app.ist_benutzer())');

create table public.kunde_kondition (
  id uuid primary key default gen_random_uuid(),
  kunde_id uuid not null references public.kunde (id),
  text text not null default '',
  like app.basis including defaults
);
comment on table public.kunde_kondition is 'Vertraulich: nur Benutzer mit Recht „Konditionen sehen“. Geht nie an Lexware, erscheint auf keinem Beleg.';
create unique index kunde_kondition_uk on public.kunde_kondition (kunde_id) where deleted_at is null;
select app.einrichten('kunde_kondition', '(select app.darf_konditionen())', '(select app.darf_konditionen())');

-- ---------------------------------------------------------------------------------------------------------------------
-- Lieferanten
-- ---------------------------------------------------------------------------------------------------------------------
create table public.lieferant (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  produktgruppen text[] not null default '{}',
  konfigurator_url text,
  haendlerportal_url text,
  unsere_kundennummer text,
  lieferzeit text,
  telefon text,
  notiz text,
  like app.basis including defaults
);
select app.einrichten('lieferant', '(select app.ist_benutzer())', '(select app.ist_benutzer())');

create table public.lieferant_kontakt (
  id uuid primary key default gen_random_uuid(),
  lieferant_id uuid not null references public.lieferant (id),
  name text not null,
  funktion text,
  handy text,
  telefon text,
  email text,
  reihenfolge integer not null default 0,
  like app.basis including defaults
);
select app.einrichten('lieferant_kontakt', '(select app.ist_benutzer())', '(select app.ist_benutzer())');

create table public.lieferant_kondition (
  id uuid primary key default gen_random_uuid(),
  lieferant_id uuid not null references public.lieferant (id),
  text text not null default '',
  like app.basis including defaults
);
comment on table public.lieferant_kondition is 'Vertraulich: Einkaufskonditionen, nur Benutzer mit Recht „Konditionen sehen“.';
create unique index lieferant_kondition_uk on public.lieferant_kondition (lieferant_id) where deleted_at is null;
select app.einrichten('lieferant_kondition', '(select app.darf_konditionen())', '(select app.darf_konditionen())');
