-- =====================================================================================================================
-- Belege, Positionen, Versionen, Versand, PDF-Gruppen, Zahlungen
-- =====================================================================================================================

create table public.beleg (
  id uuid primary key default gen_random_uuid(),
  art public.belegart not null,
  nummer text,
  status text not null default 'entwurf',
  kette_id uuid not null,
  vorgaenger_id uuid references public.beleg (id),
  anfrage_id uuid references public.anfrage (id),
  auftrag_id uuid references public.auftrag (id),
  ticket_id uuid references public.service_ticket (id),
  kunde_id uuid references public.kunde (id),
  -- Empfängeradresse je Beleg (aus dem Kunden vorbelegt, im Beleg änderbar)
  adresse_name text,
  adresse_zusatz text,
  adresse_strasse text,
  adresse_plz text,
  adresse_ort text,
  adresse_land text not null default 'Deutschland',
  kundennummer text,
  datum date not null default current_date,
  titel text,
  bauvorhaben text,
  objekt text,
  einleitung text,
  lieferbedingungen text,
  nachbemerkung text,
  -- Zahlungsbedingung als Kopie im Beleg
  zahlungsbedingung_id uuid references public.zahlungsbedingung (id),
  zahlungsbedingung_text text,
  zahlungsziel_tage integer check (zahlungsziel_tage >= 0),
  skontoziel_tage integer check (skontoziel_tage >= 0),
  skonto_prozent numeric(5, 2) check (skonto_prozent >= 0 and skonto_prozent < 100),
  steuerart text not null default 'standard' check (steuerart in ('standard', 'bauleistung_13b', 'steuerfrei')),
  preise_brutto boolean not null default false,
  gesamtrabatt_prozent numeric(5, 2) not null default 0 check (gesamtrabatt_prozent >= 0 and gesamtrabatt_prozent <= 100),
  gueltig_bis date,
  liefertermin date,
  leistung_von date,
  leistung_bis date,
  teil boolean not null default false,
  abzug_betrag numeric(12, 2) not null default 0,
  summe_netto numeric(12, 2) not null default 0,
  summe_brutto numeric(12, 2) not null default 0,
  offen_betrag numeric(12, 2),
  faellig_am date,
  version integer not null default 1 check (version >= 1),
  eingefroren_version integer,
  tags text[] not null default '{}',
  kommentar_intern text,
  lexware_id text,
  lexware_status text,
  pdf_pfad text,
  fertiggestellt_am timestamptz,
  fertiggestellt_von uuid,
  like app.basis including defaults,
  -- Bezug: genau einer; nur Entwürfe dürfen noch ohne Bezug sein (freie AB, Gutschrift vor der Wahl der Rechnung)
  constraint beleg_bezug check (num_nonnulls(anfrage_id, auftrag_id, ticket_id) = 1
                                or (status = 'entwurf' and num_nonnulls(anfrage_id, auftrag_id, ticket_id) = 0)),
  constraint beleg_status check (case
    when art = 'angebot' then status in ('entwurf', 'offen', 'angenommen', 'abgelehnt', 'nicht_beauftragt')
    when art = 'zahlungsbestaetigung' then status = 'fertiggestellt'
    when art in ('rechnung', 'abschlagsrechnung', 'gutschrift') then status in ('entwurf', 'offen', 'bezahlt')
    else status in ('entwurf', 'fertiggestellt') end),
  constraint beleg_teil check (not teil or art = 'rechnung'),
  constraint beleg_leistung check (leistung_bis is null or leistung_von is null or leistung_bis >= leistung_von),
  constraint beleg_teil_ab_liefertermin check (art <> 'teil_ab' or status = 'entwurf' or liefertermin is not null)
);
comment on table public.beleg is 'App-Belege (eigene Nummer, eigenes PDF) und Lexware-Belege (Nummer und PDF von Lexware). Status der AB wird aus der Kette berechnet; gespeichert ist nur entwurf/fertiggestellt.';
comment on column public.beleg.kette_id is 'ID des ersten Belegs der Kette; Folgebelege übernehmen sie vom Vorgänger';
comment on column public.beleg.teil is 'Teilrechnung (aus Lieferschein oder Teil-AB, ohne Abzug). Eine Rechnung ohne teil ist die (Schluss-)Rechnung.';
comment on column public.beleg.offen_betrag is 'Offener Betrag bei Rechnung, Abschlag, Gutschrift; „überfällig“ = offen > 0 und faellig_am < heute';
create unique index beleg_nummer_uk on public.beleg (nummer) where nummer is not null;
create unique index beleg_lexware_uk on public.beleg (lexware_id) where lexware_id is not null;
create index beleg_kette_idx on public.beleg (kette_id);
create index beleg_tags_idx on public.beleg using gin (tags);
-- Genau eine Schluss- bzw. Rechnung je Auftrag
create unique index beleg_schlussrechnung_uk on public.beleg (auftrag_id)
  where art = 'rechnung' and not teil and status <> 'entwurf' and deleted_at is null and auftrag_id is not null;
select app.einrichten('beleg', '(select app.ist_benutzer())', '(select app.ist_benutzer())');

-- Kette: erster Beleg beginnt eine Kette, Folgebelege übernehmen sie vom Vorgänger
create function app.beleg_kette() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.kette_id is null then
    select b.kette_id into new.kette_id from public.beleg b where b.id = new.vorgaenger_id;
    new.kette_id := coalesce(new.kette_id, new.id);
  end if;
  return new;
end $$;
create trigger beleg_kette before insert on public.beleg
  for each row execute function app.beleg_kette();

-- Nummern: Angebot beim ersten Speichern, Zahlungsbestätigung beim Erstellen, AB und Lieferschein beim Fertigstellen,
-- Teil-AB = AB-Nummer mit -01, -02 … Rechnung, Abschlag und Gutschrift bekommen die Nummer von Lexware (Server).
create function app.beleg_nummer() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_ab public.beleg;
  v_n integer;
begin
  if auth.uid() is not null then
    -- Angemeldete Benutzer geben keine Nummer vor; eine vergebene Nummer bleibt immer gleich
    new.nummer := case when tg_op = 'UPDATE' then old.nummer end;
  elsif tg_op = 'UPDATE' and old.nummer is not null then
    new.nummer := old.nummer;
  end if;
  if new.nummer is not null or new.art in ('rechnung', 'abschlagsrechnung', 'gutschrift') then
    return new;
  end if;
  if new.art in ('angebot', 'zahlungsbestaetigung') then
    new.nummer := app.naechste_nummer(new.art);
  elsif new.status <> 'entwurf' and new.art in ('auftragsbestaetigung', 'lieferschein') then
    new.nummer := app.naechste_nummer(new.art);
  elsif new.status <> 'entwurf' and new.art = 'teil_ab' then
    select * into v_ab from public.beleg where id = new.vorgaenger_id for update;
    if v_ab.id is null or v_ab.art <> 'auftragsbestaetigung' or v_ab.nummer is null then
      raise exception 'Eine Teil-AB braucht eine fertiggestellte AB als Vorgänger' using errcode = '23514';
    end if;
    select count(*) + 1 into v_n from public.beleg
     where vorgaenger_id = v_ab.id and art = 'teil_ab' and nummer is not null;
    new.nummer := v_ab.nummer || '-' || lpad(v_n::text, 2, '0');
  end if;
  return new;
end $$;
create trigger beleg_nummer before insert or update on public.beleg
  for each row execute function app.beleg_nummer();

-- Ist der Beleg (noch) inhaltlich änderbar? Entwurf immer; Angebot bis eine AB dazu existiert;
-- AB bis ein Folgebeleg (Teil-AB, Lieferschein, Abschlag, Rechnung) fertiggestellt ist. Alles andere ist gesperrt.
create function app.beleg_bearbeitbar(p_beleg_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select b.status = 'entwurf'
      or (b.art = 'angebot' and not exists (
            select 1 from public.beleg f
             where f.vorgaenger_id = b.id and f.art = 'auftragsbestaetigung' and f.deleted_at is null))
      or (b.art = 'auftragsbestaetigung' and not exists (
            select 1 from public.beleg f
             where f.kette_id = b.kette_id and f.id <> b.id and f.deleted_at is null and f.status <> 'entwurf'
               and f.art in ('teil_ab', 'lieferschein', 'abschlagsrechnung', 'rechnung')))
    from public.beleg b
   where b.id = p_beleg_id
$$;
grant execute on function app.beleg_bearbeitbar(uuid) to authenticated, service_role;

-- Sperre fertiggestellter Belege (gilt für angemeldete Benutzer; Lexware-Abgleich läuft serverseitig)
create function app.beleg_sperre() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_frei constant text[] := array['tags', 'kommentar_intern', 'status', 'offen_betrag', 'pdf_pfad', 'version',
                                  'eingefroren_version', 'lexware_status', 'updated_at', 'updated_by'];
begin
  if auth.uid() is null or old.status = 'entwurf' then
    return new;
  end if;
  if new.status = 'entwurf' then
    raise exception 'Ein fertiggestellter Beleg kann nicht wieder Entwurf werden' using errcode = '42501';
  end if;
  if new.deleted_at is not null and old.deleted_at is null then
    raise exception 'Fertiggestellte Belege können nicht gelöscht werden' using errcode = '42501';
  end if;
  if not app.beleg_bearbeitbar(old.id)
     and (to_jsonb(new) - v_frei) is distinct from (to_jsonb(old) - v_frei) then
    raise exception 'Der Beleg % ist fertiggestellt und gesperrt', old.nummer using errcode = '42501';
  end if;
  return new;
end $$;
create trigger beleg_sperre before update on public.beleg
  for each row execute function app.beleg_sperre();

create table public.beleg_position (
  id uuid primary key default gen_random_uuid(),
  beleg_id uuid not null references public.beleg (id),
  reihenfolge integer not null default 0,
  typ text not null default 'artikel' check (typ in ('artikel', 'text')),
  titel text not null default '',
  beschreibung_html text,
  optional boolean not null default false,
  menge numeric(12, 3) not null default 1,
  einheit text,
  einzelpreis numeric(12, 4) not null default 0,
  rabatt_prozent numeric(5, 2) not null default 0 check (rabatt_prozent >= 0 and rabatt_prozent <= 100),
  steuersatz numeric(5, 2) not null default 19 check (steuersatz >= 0),
  artikel_id uuid references public.artikel (id),
  like app.basis including defaults
);
comment on column public.beleg_position.einzelpreis is 'Netto oder brutto je nach beleg.preise_brutto';
comment on column public.beleg_position.beschreibung_html is 'Bereinigtes HTML nach Whitelist; an Lexware geht reiner Text';
select app.einrichten('beleg_position', '(select app.ist_benutzer())', '(select app.ist_benutzer())');

create function app.position_sperre() returns trigger
language plpgsql set search_path = '' as $$
begin
  if auth.uid() is not null and not app.beleg_bearbeitbar(new.beleg_id)
     or (tg_op = 'UPDATE' and auth.uid() is not null and old.beleg_id <> new.beleg_id) then
    raise exception 'Der Beleg ist fertiggestellt und gesperrt' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger position_sperre before insert or update on public.beleg_position
  for each row execute function app.position_sperre();

create table public.beleg_version (
  id uuid primary key default gen_random_uuid(),
  beleg_id uuid not null references public.beleg (id),
  version integer not null check (version >= 1),
  daten jsonb not null,
  pdf_pfad text,
  eingefroren_am timestamptz not null default now(),
  eingefroren_von uuid default auth.uid(),
  like app.basis including defaults
);
comment on table public.beleg_version is 'Eingefrorene Version (beim Versand oder „Als übergeben markieren“): Kopie aller Druckfelder und Positionen';
create unique index beleg_version_uk on public.beleg_version (beleg_id, version) where deleted_at is null;
select app.einrichten('beleg_version', '(select app.ist_benutzer())', '(select app.ist_benutzer())', 'false');

create table public.beleg_versand (
  id uuid primary key default gen_random_uuid(),
  beleg_id uuid not null references public.beleg (id),
  version integer,
  kanal text not null check (kanal in ('email', 'uebergeben')),
  empfaenger text[] not null default '{}',
  bcc text[] not null default '{}',
  betreff text,
  text text,
  pdfs jsonb not null default '[]'::jsonb,
  gesendet_am timestamptz not null default now(),
  gesendet_von uuid default auth.uid(),
  like app.basis including defaults
);
comment on table public.beleg_versand is 'Versandprotokoll (Empfänger, BCC, Betreff, PDFs mit Inhalt). Nicht änderbar.';
select app.einrichten('beleg_versand', '(select app.ist_benutzer())', '(select app.ist_benutzer())', 'false');

create table public.beleg_versand_gruppe (
  id uuid primary key default gen_random_uuid(),
  beleg_id uuid not null references public.beleg (id),
  reihenfolge integer not null default 0,
  dateiname text not null,
  like app.basis including defaults
);
comment on table public.beleg_versand_gruppe is 'PDF-Gruppen für den Versand: jede Gruppe wird ein PDF';
select app.einrichten('beleg_versand_gruppe', '(select app.ist_benutzer())', '(select app.ist_benutzer())');

create table public.beleg_anhang (
  id uuid primary key default gen_random_uuid(),
  gruppe_id uuid not null references public.beleg_versand_gruppe (id),
  quelle text not null check (quelle in ('beleg', 'onedrive', 'upload', 'vorlage')),
  quell_beleg_id uuid references public.beleg (id),
  pfad text,
  name text not null,
  reihenfolge integer not null default 0,
  like app.basis including defaults,
  check (quelle <> 'beleg' or quell_beleg_id is not null)
);
comment on table public.beleg_anhang is 'Dokument in einer PDF-Gruppe. Rechnung, Abschlag und Gutschrift bleiben immer ein eigenes PDF (Prüfung serverseitig).';
select app.einrichten('beleg_anhang', '(select app.ist_benutzer())', '(select app.ist_benutzer())');

create table public.zahlung (
  id uuid primary key default gen_random_uuid(),
  beleg_id uuid not null references public.beleg (id),
  datum date not null,
  betrag numeric(12, 2) not null check (betrag > 0),
  zahlungsart text not null default 'ueberweisung' check (zahlungsart in ('ueberweisung', 'bar', 'karte', 'sonstiges')),
  quelle text not null check (quelle in ('app', 'lexware')),
  lex_abgleich text not null default 'offen' check (lex_abgleich in ('offen', 'abgeglichen')),
  lexware_id text,
  zahlungsbestaetigung_id uuid references public.beleg (id),
  like app.basis including defaults,
  check (quelle = 'app' or lex_abgleich = 'abgeglichen')
);
comment on column public.zahlung.lex_abgleich is 'App-Buchung „in Lexware noch buchen“ (offen), bis Lexware die Zahlung meldet';
create unique index zahlung_lexware_uk on public.zahlung (lexware_id) where lexware_id is not null;
create unique index zahlung_zb_uk on public.zahlung (zahlungsbestaetigung_id) where zahlungsbestaetigung_id is not null;
select app.einrichten('zahlung', '(select app.ist_benutzer())', '(select app.ist_benutzer())');
