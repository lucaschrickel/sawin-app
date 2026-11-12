-- Datenübernahme aus Airtable (docs/airtable-uebernahme.md)
-- * airtable_id: Herkunft je übernommener Zeile; ein erneuter Lauf aktualisiert statt doppelt anzulegen
-- * altbestand: übernommene Kunden, Belege und OneDrive-Ordner. Lexware bzw. OneDrive fasst die App bei ihnen nur an,
--   wenn LEXWARE_ALTBESTAND bzw. ONEDRIVE_ALTBESTAND auf dem Server „aktiv“ ist (Produktion ab Go-live)
-- * Status „storniert“ für übernommene Rechnungen und Abschläge (in Lexware storniert)
-- * Altbelege ohne Anfrage, Auftrag oder Ticket (nur am Kunden), z. B. Rechnungen aus der Zeit vor Airtable
-- * Anrede am Kunden
-- Alle Importfelder setzt nur die Service-Rolle; für angemeldete Benutzer bleiben sie unverändert.

alter table public.kunde add column airtable_id text unique, add column altbestand boolean not null default false,
  add column anrede text check (anrede in ('Herr', 'Frau', 'Familie', 'Eheleute', 'Dr.'));
alter table public.kunde_lieferadresse add column airtable_id text unique;
alter table public.anfrage add column airtable_id text unique;
alter table public.auftrag add column airtable_id text unique;
alter table public.aufgabe add column airtable_id text unique;
alter table public.bestellung add column airtable_id text unique;
alter table public.bestellzeile add column airtable_id text unique;
alter table public.ablage_ordner add column airtable_id text unique, add column altbestand boolean not null default false;
alter table public.beleg add column airtable_id text unique, add column altbestand boolean not null default false,
  add column lexware_link text;

-- Storniert nur für Lexware-Belege
alter table public.beleg drop constraint beleg_status;
alter table public.beleg add constraint beleg_status check (
  case
    when art = 'angebot' then status in ('entwurf', 'offen', 'angenommen', 'abgelehnt', 'nicht_beauftragt')
    when art = 'zahlungsbestaetigung' then status = 'fertiggestellt'
    when art in ('rechnung', 'abschlagsrechnung', 'gutschrift') then status in ('entwurf', 'offen', 'bezahlt', 'storniert')
    else status in ('entwurf', 'fertiggestellt')
  end);

-- Altbestand darf ohne Anfrage, Auftrag oder Ticket am Kunden hängen
alter table public.beleg drop constraint beleg_bezug;
alter table public.beleg add constraint beleg_bezug check (
  num_nonnulls(anfrage_id, auftrag_id, ticket_id) = 1
  or (num_nonnulls(anfrage_id, auftrag_id, ticket_id) = 0 and (status = 'entwurf' or (altbestand and kunde_id is not null))));

-- Eine stornierte Rechnung ist keine Schlussrechnung
drop index public.beleg_schlussrechnung_uk;
create unique index beleg_schlussrechnung_uk on public.beleg (auftrag_id)
  where art = 'rechnung' and not teil and status not in ('entwurf', 'storniert') and deleted_at is null and auftrag_id is not null;

create index beleg_kunde_ohne_bezug on public.beleg (kunde_id) where anfrage_id is null and auftrag_id is null and ticket_id is null;

-- Importfelder: nur die Service-Rolle setzt sie
create or replace function app.import_felder_schutz()
returns trigger
language plpgsql
set search_path to ''
as $$
declare
  v jsonb := '{}'::jsonb;
  v_alt jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) else '{}'::jsonb end;
begin
  if auth.uid() is null then
    return new;
  end if;
  v := jsonb_build_object('airtable_id', v_alt -> 'airtable_id');
  if tg_table_name in ('kunde', 'beleg', 'ablage_ordner') then
    v := v || jsonb_build_object('altbestand', coalesce(v_alt -> 'altbestand', 'false'::jsonb));
  end if;
  if tg_table_name = 'beleg' then
    v := v || jsonb_build_object('lexware_link', v_alt -> 'lexware_link');
  end if;
  new := jsonb_populate_record(new, v);
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['kunde', 'kunde_lieferadresse', 'anfrage', 'auftrag', 'aufgabe', 'bestellung', 'bestellzeile', 'ablage_ordner', 'beleg'] loop
    execute format('create trigger import_felder before insert or update on public.%I for each row execute function app.import_felder_schutz()', t);
  end loop;
end $$;

-- Ein Altbeleg ohne Positionen (nur Kopfdaten aus Airtable) ist nicht bearbeitbar
create or replace function app.beleg_bearbeitbar(p_beleg_id uuid)
returns boolean
language sql
stable security definer
set search_path to ''
as $$
  select (b.status = 'entwurf'
      or (b.art = 'angebot' and not exists (
            select 1 from public.beleg f
             where f.vorgaenger_id = b.id and f.art = 'auftragsbestaetigung' and f.deleted_at is null))
      or (b.art = 'auftragsbestaetigung' and not exists (
            select 1 from public.beleg f
             where f.kette_id = b.kette_id and f.id <> b.id and f.deleted_at is null and f.status <> 'entwurf'
               and f.art in ('teil_ab', 'lieferschein', 'abschlagsrechnung', 'rechnung'))))
     and not (b.altbestand and not exists (
            select 1 from public.beleg_position p where p.beleg_id = b.id and p.deleted_at is null))
    from public.beleg b
   where b.id = p_beleg_id
$$;

-- Lexware-Kontakt: Ein übernommener Kunde (Altbestand), dessen Kontakt in diesem Lexware-Konto nicht genutzt wird
-- (LEXWARE_ALTBESTAND nicht aktiv, z. B. Staging mit dem Testkonto), bekommt hier einen eigenen Kontakt; dann ersetzt
-- die neue ID die übernommene und der Kunde ist kein Altbestand mehr (p_ersetzen).
drop function public.lexware_kunde(uuid, uuid, text, text);
create function public.lexware_kunde(p_kunde uuid, p_benutzer uuid, p_kontakt_id text, p_hash text, p_ersetzen boolean default false)
returns void
language plpgsql
security definer
set search_path to ''
as $$
begin
  perform set_config('app.im_namen_von', p_benutzer::text, true);
  update public.kunde set
    lexware_kontakt_id = case when p_ersetzen then p_kontakt_id else coalesce(lexware_kontakt_id, p_kontakt_id) end,
    lexware_seit = case when p_ersetzen then now() else coalesce(lexware_seit, now()) end,
    lexware_hash = p_hash,
    altbestand = case when p_ersetzen then false else altbestand end
  where id = p_kunde;
end $$;
revoke all on function public.lexware_kunde(uuid, uuid, text, text, boolean) from public, anon, authenticated;
grant execute on function public.lexware_kunde(uuid, uuid, text, text, boolean) to service_role;
comment on function public.lexware_kunde(uuid, uuid, text, text, boolean) is 'Server: Lexware-Kontakt-ID und Stand der Übertragung am Kunden speichern (p_ersetzen: Altbestand bekommt einen eigenen Kontakt)';
