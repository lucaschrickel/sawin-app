-- Sicherheitsprüfung, Block B (docs/sicherheit.md M1, M2, F105–F109): Belege unveränderbar (GoBD).
--
-- Grundsatz: Angemeldete Benutzer ändern Belege, Positionen, Versionen, Versandprotokolle und Zahlungen nur über die
-- vorgesehenen Funktionen (beleg_speichern, beleg_fertigstellen, beleg_uebergeben, beleg_versenden, zahlung_erfassen,
-- zahlungsbestaetigung_erstellen). Diese setzen app.beleg_vorgang; Benutzer können den Wert selbst nicht setzen
-- (set_config ist über die API nicht erreichbar). Direkt änderbar bleiben nur Tags, interner Kommentar, der Status nach
-- den Regeln von app.beleg_status_regeln und das Verwerfen eines Entwurfs.
--
-- 1. Beleg-PDFs legt nur der Server ab (Service-Rolle): keine Schreibrechte der Benutzer im Speicher „belege“, pdf_pfad
--    und pdf_sha256 setzt nur beleg_pdf_setzen bzw. lexware_fertig/lexware_pdf. Die SHA-256 der Datei steht am Beleg und
--    damit im Audit-Log (vorher/nachher), ebenso in der eingefrorenen Version.
-- 2. art, kette_id und vorgaenger_id sind unveränderlich; die Kette bestimmt beim Anlegen immer die Datenbank.
-- 3. Summen berechnet die Datenbank beim Speichern aus den Positionen (wie src/lib/beleg-summen.ts und Lexware).

-- 1. PDF: Prüfsumme, Speicher nur für den Server ---------------------------------------------------------------------
alter table public.beleg add column pdf_sha256 text check (pdf_sha256 ~ '^[0-9a-f]{64}$');
alter table public.beleg_version add column pdf_sha256 text check (pdf_sha256 ~ '^[0-9a-f]{64}$');
comment on column public.beleg.pdf_sha256 is 'SHA-256 des abgelegten PDFs (setzt nur der Server)';
comment on column public.beleg_version.pdf_sha256 is 'SHA-256 des PDFs dieser Version';

drop policy "belege_anlegen" on storage.objects;
drop policy "belege_ersetzen" on storage.objects;

create function public.beleg_pdf_setzen(p_id uuid, p_benutzer uuid, p_pfad text, p_sha256 text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform set_config('app.im_namen_von', p_benutzer::text, true);
  if p_pfad is null or p_pfad not like p_id::text || '/%' or p_pfad like '%..%' then
    raise exception 'Ungültiger Ablagepfad' using errcode = '22023';
  end if;
  if p_sha256 is null or p_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'Ungültige Prüfsumme' using errcode = '22023';
  end if;
  update public.beleg set pdf_pfad = p_pfad, pdf_sha256 = p_sha256
   where id = p_id and status <> 'entwurf' and deleted_at is null
     and art in ('angebot', 'auftragsbestaetigung', 'teil_ab', 'lieferschein', 'zahlungsbestaetigung');
  if not found then
    raise exception 'Beleg nicht gefunden oder nicht fertiggestellt' using errcode = 'P0002';
  end if;
end $$;
comment on function public.beleg_pdf_setzen(uuid, uuid, text, text) is 'Server: Original-PDF eines App-Belegs abgelegt (Pfad und SHA-256)';

drop function public.lexware_pdf(uuid, uuid, text);
create function public.lexware_pdf(p_id uuid, p_benutzer uuid, p_pfad text, p_sha256 text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform set_config('app.im_namen_von', p_benutzer::text, true);
  if p_pfad is null or p_pfad not like p_id::text || '/%' or p_sha256 is null or p_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'Ungültiger Ablagepfad oder ungültige Prüfsumme' using errcode = '22023';
  end if;
  update public.beleg set pdf_pfad = p_pfad, pdf_sha256 = p_sha256, lexware_status = 'fertig'
   where id = p_id and lexware_id is not null and status <> 'entwurf';
end $$;
comment on function public.lexware_pdf(uuid, uuid, text, text) is 'Server: Original-PDF von Lexware abgelegt (Pfad und SHA-256)';

create or replace function public.lexware_fertig(p_id uuid, p_benutzer uuid, p_daten jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_b public.beleg;
begin
  perform set_config('app.im_namen_von', p_benutzer::text, true);
  update public.beleg set
    lexware_id = p_daten ->> 'lexware_id',
    nummer = p_daten ->> 'nummer',
    status = 'offen',
    summe_netto = (p_daten ->> 'summe_netto')::numeric,
    summe_brutto = (p_daten ->> 'summe_brutto')::numeric,
    steuern = coalesce(p_daten -> 'steuern', '[]'::jsonb),
    offen_betrag = (p_daten ->> 'summe_brutto')::numeric,
    lexware_offen = (p_daten ->> 'summe_brutto')::numeric,
    faellig_am = nullif(p_daten ->> 'faellig_am', '')::date,
    pdf_pfad = nullif(p_daten ->> 'pdf_pfad', ''),
    pdf_sha256 = case when nullif(p_daten ->> 'pdf_pfad', '') is not null then nullif(p_daten ->> 'pdf_sha256', '') end,
    lexware_status = case when nullif(p_daten ->> 'pdf_pfad', '') is null then 'pdf_fehlt' else 'fertig' end,
    lexware_fehler = null,
    fertiggestellt_am = now(),
    fertiggestellt_von = p_benutzer
  where id = p_id and status = 'entwurf' and deleted_at is null
  returning * into v_b;
  if v_b.id is null then
    raise exception 'Beleg nicht gefunden oder schon fertiggestellt' using errcode = 'P0002';
  end if;
  if v_b.art = 'rechnung' and v_b.ticket_id is not null then
    update public.service_ticket set status = 'abgerechnet' where id = v_b.ticket_id and status <> 'abgerechnet';
  end if;
end $$;

revoke execute on function public.beleg_pdf_setzen(uuid, uuid, text, text), public.lexware_pdf(uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.beleg_pdf_setzen(uuid, uuid, text, text), public.lexware_pdf(uuid, uuid, text, text)
  to service_role;

-- 2. Beleg: nur über die Funktionen ----------------------------------------------------------------------------------
-- Läuft nach app.beleg_status_regeln (beleg_aa_…) und vor beleg_kette, beleg_nummer, beleg_sperre (alphabetisch).
create function app.beleg_schutz() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_vorgang text := coalesce(current_setting('app.beleg_vorgang', true), '');
  v_direkt constant text[] := array['tags', 'kommentar_intern', 'status', 'updated_at', 'updated_by', 'deleted_at', 'deleted_by'];
begin
  if auth.uid() is null then
    return new; -- Server (Service-Rolle)
  end if;
  if tg_op = 'INSERT' then
    if v_vorgang not in ('speichern', 'zahlung') then
      raise exception 'Belege entstehen über „Speichern“.' using errcode = '42501';
    end if;
    new.kette_id := null; -- bestimmt beleg_kette aus dem Vorgänger
    new.pdf_pfad := null;
    new.pdf_sha256 := null;
    return new;
  end if;
  if (new.art, new.kette_id, new.vorgaenger_id) is distinct from (old.art, old.kette_id, old.vorgaenger_id) then
    raise exception 'Belegart, Kette und Vorgänger lassen sich nicht ändern.' using errcode = '42501';
  end if;
  if (new.pdf_pfad, new.pdf_sha256) is distinct from (old.pdf_pfad, old.pdf_sha256) then
    raise exception 'Das PDF eines Belegs legt nur die App ab.' using errcode = '42501';
  end if;
  if v_vorgang = '' and (to_jsonb(new) - v_direkt) is distinct from (to_jsonb(old) - v_direkt) then
    raise exception 'Belege werden über „Speichern“ geändert.' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger beleg_ab_schutz before insert or update on public.beleg
  for each row execute function app.beleg_schutz();

-- Positionen nur über beleg_speichern (auch der Abzug bereits berechneter Abschläge)
create or replace function app.position_sperre() returns trigger
language plpgsql set search_path = '' as $$
begin
  if auth.uid() is not null and coalesce(current_setting('app.beleg_vorgang', true), '') <> 'speichern' then
    raise exception 'Positionen werden über „Speichern“ geändert.' using errcode = '42501';
  end if;
  if auth.uid() is not null and not app.beleg_bearbeitbar(new.beleg_id)
     or (tg_op = 'UPDATE' and auth.uid() is not null and old.beleg_id <> new.beleg_id) then
    raise exception 'Der Beleg ist fertiggestellt und gesperrt' using errcode = '42501';
  end if;
  return new;
end $$;

-- Versionen und Versandprotokolle nur über beleg_uebergeben bzw. beleg_versenden
create function app.beleg_protokoll_schutz() returns trigger
language plpgsql set search_path = '' as $$
begin
  if auth.uid() is not null
     and coalesce(current_setting('app.beleg_vorgang', true), '') not in ('uebergeben', 'versenden') then
    raise exception 'Versionen und Versand entstehen über „Versenden“ bzw. „Als übergeben markieren“.' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger protokoll_schutz before insert on public.beleg_version
  for each row execute function app.beleg_protokoll_schutz();
create trigger protokoll_schutz before insert on public.beleg_versand
  for each row execute function app.beleg_protokoll_schutz();

-- Zahlungen der App nur über zahlung_erfassen (Prüfung von Belegart, Status, Betrag und Datum)
create or replace function app.zahlung_regeln() returns trigger
language plpgsql set search_path = '' as $$
begin
  if auth.uid() is not null then
    if tg_op = 'INSERT' then
      if coalesce(current_setting('app.beleg_vorgang', true), '') <> 'zahlung' then
        raise exception 'Zahlungen werden über „Als bezahlt markieren“ erfasst.' using errcode = '42501';
      end if;
      new.quelle := 'app';
      new.lex_abgleich := 'offen';
      new.lexware_id := null;
      new.lexware_art := null;
      new.zahlungsbestaetigung_id := null;
    else
      if (to_jsonb(new) - array['zahlungsbestaetigung_id', 'deleted_at', 'deleted_by', 'updated_at', 'updated_by'])
         is distinct from (to_jsonb(old) - array['zahlungsbestaetigung_id', 'deleted_at', 'deleted_by', 'updated_at', 'updated_by']) then
        raise exception 'Zahlungen lassen sich nicht ändern.' using errcode = '42501';
      end if;
      if new.zahlungsbestaetigung_id is distinct from old.zahlungsbestaetigung_id
         and (old.zahlungsbestaetigung_id is not null or coalesce(current_setting('app.beleg_vorgang', true), '') <> 'zahlung') then
        raise exception 'Die Zahlungsbestätigung entsteht über „Zahlungsbestätigung erstellen“.' using errcode = '42501';
      end if;
      if new.deleted_at is not null and old.deleted_at is null
         and (old.quelle <> 'app' or old.lex_abgleich <> 'offen' or old.zahlungsbestaetigung_id is not null) then
        raise exception 'Nur eigene, noch nicht abgeglichene Zahlungen ohne Zahlungsbestätigung lassen sich entfernen.' using errcode = '42501';
      end if;
    end if;
  end if;
  return new;
end $$;

create or replace function public.zahlung_erfassen(p_beleg uuid, p_datum date, p_betrag numeric, p_zahlungsart text, p_bestaetigung boolean)
returns jsonb language plpgsql set search_path = '' as $$
declare
  v_b public.beleg;
  v_zid uuid;
  v_zb uuid;
begin
  perform set_config('app.beleg_vorgang', 'zahlung', true);
  select * into v_b from public.beleg where id = p_beleg and deleted_at is null for update;
  if v_b.id is null then
    raise exception 'Beleg nicht gefunden' using errcode = 'P0002';
  end if;
  if v_b.art not in ('rechnung', 'abschlagsrechnung') or v_b.status <> 'offen' then
    raise exception 'Nur offene Rechnungen und Abschlagsrechnungen lassen sich als bezahlt markieren.' using errcode = '23514';
  end if;
  if p_betrag is null or p_betrag <= 0 then
    raise exception 'Bitte einen Betrag über 0 € angeben.' using errcode = '23514';
  end if;
  if p_betrag > coalesce(v_b.offen_betrag, v_b.summe_brutto) then
    raise exception 'Der Betrag ist höher als der offene Betrag.' using errcode = '23514';
  end if;
  if p_datum is null or p_datum > (now() at time zone 'Europe/Berlin')::date then
    raise exception 'Bitte ein Datum bis heute angeben.' using errcode = '23514';
  end if;
  insert into public.zahlung (beleg_id, datum, betrag, zahlungsart, quelle)
  values (p_beleg, p_datum, round(p_betrag, 2), p_zahlungsart, 'app')
  returning id into v_zid;
  if p_bestaetigung then
    v_zb := public.zahlungsbestaetigung_erstellen(v_zid);
  end if;
  return jsonb_build_object('zahlung_id', v_zid, 'zahlungsbestaetigung_id', v_zb);
end $$;

-- Versionen: SHA-256 des PDFs mitnehmen; Versand setzt seinen Vorgang
create or replace function public.beleg_uebergeben(p_id uuid) returns integer
language plpgsql set search_path = '' as $$
declare
  v_b public.beleg;
begin
  perform set_config('app.beleg_vorgang', 'uebergeben', true);
  select * into v_b from public.beleg where id = p_id for update;
  if not found then
    raise exception 'Beleg nicht gefunden' using errcode = 'P0002';
  end if;
  if v_b.art not in ('angebot', 'auftragsbestaetigung') or v_b.status = 'entwurf' then
    raise exception 'Nur fertiggestellte Angebote und Auftragsbestätigungen haben Versionen.' using errcode = '23514';
  end if;
  if coalesce(v_b.eingefroren_version, 0) < v_b.version then
    insert into public.beleg_version (beleg_id, version, daten, pdf_pfad, pdf_sha256)
    values (p_id, v_b.version,
            to_jsonb(v_b) || jsonb_build_object('positionen', coalesce((
              select jsonb_agg(to_jsonb(p) order by p.reihenfolge) from public.beleg_position p
               where p.beleg_id = p_id and p.deleted_at is null), '[]'::jsonb)),
            v_b.pdf_pfad, v_b.pdf_sha256);
    update public.beleg set eingefroren_version = v_b.version where id = p_id;
  end if;
  insert into public.beleg_versand (beleg_id, version, kanal) values (p_id, v_b.version, 'uebergeben');
  return v_b.version;
end $$;

create or replace function public.beleg_versenden(p_id uuid, p_empfaenger text[], p_bcc text[], p_betreff text, p_text text, p_datei text)
returns integer language plpgsql set search_path = '' as $$
declare
  v_b public.beleg;
  v_adresse constant text := '^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$';
begin
  perform set_config('app.beleg_vorgang', 'versenden', true);
  select * into v_b from public.beleg where id = p_id and deleted_at is null for update;
  if not found then
    raise exception 'Beleg nicht gefunden' using errcode = 'P0002';
  end if;
  if v_b.status = 'entwurf' then
    raise exception 'Ein Entwurf kann nicht versendet werden. Bitte zuerst fertigstellen.' using errcode = '23514';
  end if;
  if v_b.art in ('rechnung', 'abschlagsrechnung', 'gutschrift') and v_b.pdf_pfad is null then
    raise exception 'Versendet wird nur das Original-PDF von Lexware. Es liegt noch nicht vor.' using errcode = '23514';
  end if;
  if coalesce(cardinality(p_empfaenger), 0) = 0 then
    raise exception 'Bitte mindestens einen Empfänger angeben.' using errcode = '23514';
  end if;
  if exists (select 1 from unnest(p_empfaenger || coalesce(p_bcc, '{}')) a where a !~ v_adresse) then
    raise exception 'Bitte gültige E-Mail-Adressen angeben.' using errcode = '23514';
  end if;

  -- Angebot und AB: aktuelle Version einfrieren (wie „Als übergeben markieren“)
  if v_b.art in ('angebot', 'auftragsbestaetigung') and coalesce(v_b.eingefroren_version, 0) < v_b.version then
    perform set_config('app.beleg_vorgang', 'uebergeben', true);
    insert into public.beleg_version (beleg_id, version, daten, pdf_pfad, pdf_sha256)
    values (p_id, v_b.version,
            to_jsonb(v_b) || jsonb_build_object('positionen', coalesce((
              select jsonb_agg(to_jsonb(p) order by p.reihenfolge) from public.beleg_position p
               where p.beleg_id = p_id and p.deleted_at is null), '[]'::jsonb)),
            v_b.pdf_pfad, v_b.pdf_sha256);
    update public.beleg set eingefroren_version = v_b.version where id = p_id;
  end if;

  insert into public.beleg_versand (beleg_id, version, kanal, empfaenger, bcc, betreff, text, pdfs)
  values (p_id, v_b.version, 'email', p_empfaenger, coalesce(p_bcc, '{}'), left(p_betreff, 500), left(p_text, 5000),
          jsonb_build_array(jsonb_build_object('name', left(p_datei, 200), 'art', 'beleg')));
  return v_b.version;
end $$;

-- 3. Summen aus den Positionen ---------------------------------------------------------------------------------------
-- Wie src/lib/beleg-summen.ts: Zeile auf Cent, je Steuersatz summieren, Gesamtrabatt je Satz (nicht auf Abzüge), Steuer
-- je Satz auf die Summe (netto: × Satz; brutto: × Satz ÷ (100 + Satz)). Optionale Positionen und Freitext zählen nicht;
-- § 13b und steuerfrei rechnen mit 0 % und netto. Gerundet wird kaufmännisch (round(numeric): halbe Cent vom Nullpunkt weg).
create function app.beleg_summen(p_beleg uuid, out netto numeric, out brutto numeric)
language plpgsql stable set search_path = '' as $$
declare
  v_b public.beleg;
  v_frei boolean;
  v_brutto boolean;
  v_gr numeric;
  v_nach numeric;
  v_st numeric;
  v_steuer numeric := 0;
  r record;
begin
  netto := 0;
  select * into v_b from public.beleg where id = p_beleg;
  v_frei := v_b.steuerart in ('bauleistung_13b', 'steuerfrei');
  v_brutto := coalesce(v_b.preise_brutto, false) and not v_frei;
  v_gr := least(greatest(coalesce(v_b.gesamtrabatt_prozent, 0), 0), 100) / 100;
  for r in
    select case when v_frei then 0 else coalesce(p.steuersatz, 0) end as satz,
           coalesce(sum(z.betrag) filter (where p.abzug_beleg_id is null), 0) as summe,
           coalesce(sum(z.betrag) filter (where p.abzug_beleg_id is not null), 0) as abzug
      from public.beleg_position p
      cross join lateral (
        select round(coalesce(p.menge, 0) * coalesce(p.einzelpreis, 0)
                     * (1 - least(greatest(coalesce(p.rabatt_prozent, 0), 0), 100) / 100), 2) as betrag) z
     where p.beleg_id = p_beleg and p.deleted_at is null and p.typ <> 'text' and not coalesce(p.optional, false)
     group by 1
  loop
    v_nach := round(r.summe * (1 - v_gr), 2) + r.abzug;
    if v_brutto then
      v_st := round(v_nach * r.satz / (100 + r.satz), 2);
      netto := netto + v_nach - v_st;
    else
      v_st := round(v_nach * r.satz / 100, 2);
      netto := netto + v_nach;
    end if;
    v_steuer := v_steuer + v_st;
  end loop;
  brutto := netto + v_steuer;
end $$;
comment on function app.beleg_summen(uuid) is 'Netto und Brutto eines Belegs aus seinen Positionen (wie beleg-summen.ts und Lexware)';
grant execute on function app.beleg_summen(uuid) to authenticated, service_role;


-- Speichern: Summen aus den Positionen (statt der Angaben des Aufrufers)
CREATE OR REPLACE FUNCTION public.beleg_speichern(p_id uuid, p_kopf jsonb, p_positionen jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $$
declare
  v_alt public.beleg;
  v_id uuid := p_id;
  v_art text := p_kopf ->> 'art';
  v_vorgaenger public.beleg;
  v_anfrage uuid := nullif(p_kopf ->> 'anfrage_id', '')::uuid;
  v_auftrag uuid := nullif(p_kopf ->> 'auftrag_id', '')::uuid;
  v_ticket uuid := nullif(p_kopf ->> 'ticket_id', '')::uuid;
  v_kunde public.kunde;
  v_heute date := (now() at time zone 'Europe/Berlin')::date;
  v_datum date := coalesce(nullif(p_kopf ->> 'datum', '')::date, (now() at time zone 'Europe/Berlin')::date);
  v_gueltig date := nullif(p_kopf ->> 'gueltig_bis', '')::date;
  v_version integer;
  v_pos jsonb;
  v_ids uuid[] := '{}';
  v_pid uuid;
  v_abzug uuid;
  v_teil boolean := false;
  v_vv public.beleg;
  v_i integer := 0;
  r record;
begin
  perform set_config('app.beleg_vorgang', 'speichern', true);
  if v_id is not null then
    select * into v_alt from public.beleg where id = v_id for update;
    if not found then
      raise exception 'Beleg nicht gefunden' using errcode = 'P0002';
    end if;
    v_art := v_alt.art;
    if v_alt.lexware_status = 'uebertragung' and v_alt.lexware_versuch_am > now() - interval '3 minutes' then
      raise exception 'Der Beleg wird gerade an Lexware übertragen.' using errcode = '42501';
    end if;
  elsif v_art not in ('angebot', 'auftragsbestaetigung', 'teil_ab', 'lieferschein', 'rechnung', 'abschlagsrechnung', 'gutschrift') then
    raise exception 'Diese Belegart wird hier nicht angelegt.' using errcode = '22023';
  end if;

  select * into v_kunde from public.kunde where id = nullif(p_kopf ->> 'kunde_id', '')::uuid and deleted_at is null;
  if v_kunde.id is null then
    raise exception 'Bitte einen Kunden wählen.' using errcode = '23514';
  end if;

  -- Bezug beim Anlegen aus dem Vorgänger übernehmen (Kette)
  if v_id is null and nullif(p_kopf ->> 'vorgaenger_id', '') is not null then
    select * into v_vorgaenger from public.beleg where id = (p_kopf ->> 'vorgaenger_id')::uuid and deleted_at is null;
    if v_vorgaenger.id is null or v_vorgaenger.status = 'entwurf' then
      raise exception 'Der Vorgängerbeleg ist nicht fertiggestellt.' using errcode = '23514';
    end if;
    v_anfrage := v_vorgaenger.anfrage_id;
    v_auftrag := v_vorgaenger.auftrag_id;
    v_ticket := v_vorgaenger.ticket_id;
  end if;
  if v_id is not null and (v_alt.vorgaenger_id is not null or v_alt.status <> 'entwurf'
                          or v_alt.art in ('rechnung', 'abschlagsrechnung', 'gutschrift')
                          or (v_anfrage is null and v_auftrag is null and v_ticket is null)) then
    -- Folgebelege, fertiggestellte Belege und Lexware-Belege behalten ihren Bezug; ohne Angabe bleibt der bisherige
    v_anfrage := v_alt.anfrage_id;
    v_auftrag := v_alt.auftrag_id;
    v_ticket := v_alt.ticket_id;
  end if;
  if v_auftrag is not null or v_ticket is not null then
    v_anfrage := null;
  end if;
  if v_auftrag is not null then
    v_ticket := null;
  end if;
  -- Teil-AB: aus einer fertiggestellten AB. Teilrechnung: Rechnung aus einer Teil-AB oder deren Lieferschein
  if v_art = 'teil_ab' and (v_auftrag is null or (v_id is null and (v_vorgaenger.id is null or v_vorgaenger.art <> 'auftragsbestaetigung'))) then
    raise exception 'Eine Teil-AB entsteht aus einer fertiggestellten Auftragsbestätigung.' using errcode = '23514';
  end if;
  if v_art = 'rechnung' then
    if v_id is not null then
      v_teil := v_alt.teil;
    elsif v_vorgaenger.art = 'teil_ab' then
      v_teil := true;
    elsif v_vorgaenger.art = 'lieferschein' then
      select * into v_vv from public.beleg where id = v_vorgaenger.vorgaenger_id;
      v_teil := v_vv.art = 'teil_ab';
    end if;
  end if;
  if v_art = 'lieferschein' and v_auftrag is null then
    raise exception 'Ein Lieferschein gehört zu einem Auftrag.' using errcode = '23514';
  end if;
  if v_art = 'abschlagsrechnung' and v_auftrag is null then
    raise exception 'Eine Abschlagsrechnung gehört zu einem Auftrag.' using errcode = '23514';
  end if;
  if v_art = 'rechnung' and v_auftrag is null and v_ticket is null then
    raise exception 'Eine Rechnung gehört zu einem Auftrag oder einem Service-Ticket.' using errcode = '23514';
  end if;
  if v_art = 'gutschrift' and v_id is null
     and (v_vorgaenger.id is null or v_vorgaenger.art not in ('rechnung', 'abschlagsrechnung') or v_vorgaenger.lexware_id is null) then
    raise exception 'Eine Gutschrift entsteht aus einer Rechnung oder Abschlagsrechnung.' using errcode = '23514';
  end if;
  if v_art in ('angebot', 'auftragsbestaetigung', 'lieferschein') and v_ticket is not null then
    raise exception 'Diese Belegart gehört nicht zu einem Service-Ticket.' using errcode = '23514';
  end if;
  if v_art = 'angebot' and v_anfrage is null and v_auftrag is null then
    -- Angebot ohne Bezug: Anfrage im Hintergrund anlegen
    insert into public.anfrage (titel, kunde_id, herkunft, objekt, status)
    values (coalesce(nullif(trim(p_kopf ->> 'titel'), ''), 'Angebot'), v_kunde.id, v_kunde.herkunft,
            nullif(p_kopf ->> 'objekt', ''), 'angebot_erstellen')
    returning id into v_anfrage;
  end if;
  if v_art = 'angebot' and v_auftrag is not null then
    raise exception 'Ein Nachtragsangebot hängt an einer eigenen Anfrage.' using errcode = '23514';
  end if;

  -- Bearbeiten nach dem Fertigstellen: Datum heute, Version n+1, falls die aktuelle eingefroren ist
  v_version := coalesce(v_alt.version, 1);
  if v_id is not null and v_alt.status <> 'entwurf' then
    if not app.beleg_bearbeitbar(v_id) then
      raise exception 'Der Beleg % ist fertiggestellt und gesperrt.', v_alt.nummer using errcode = '42501';
    end if;
    if v_alt.eingefroren_version is not null and v_alt.eingefroren_version >= v_alt.version then
      v_version := v_alt.version + 1;
    end if;
    if v_art = 'angebot' and v_gueltig is not null then
      v_gueltig := v_gueltig + (v_heute - v_datum);
    end if;
    v_datum := v_heute;
  end if;

  if v_id is null then
    insert into public.beleg (art, vorgaenger_id, anfrage_id, auftrag_id, ticket_id, kunde_id, datum)
    values (v_art, v_vorgaenger.id, v_anfrage, v_auftrag, v_ticket, v_kunde.id, v_datum)
    returning id into v_id;
  end if;

  update public.beleg set
    anfrage_id = v_anfrage,
    auftrag_id = v_auftrag,
    ticket_id = v_ticket,
    kunde_id = v_kunde.id,
    adresse_name = nullif(trim(p_kopf ->> 'adresse_name'), ''),
    adresse_zusatz = nullif(trim(p_kopf ->> 'adresse_zusatz'), ''),
    adresse_strasse = nullif(trim(p_kopf ->> 'adresse_strasse'), ''),
    adresse_plz = nullif(trim(p_kopf ->> 'adresse_plz'), ''),
    adresse_ort = nullif(trim(p_kopf ->> 'adresse_ort'), ''),
    adresse_land = coalesce(nullif(trim(p_kopf ->> 'adresse_land'), ''), 'Deutschland'),
    kundennummer = v_kunde.nummer,
    datum = v_datum,
    titel = nullif(trim(p_kopf ->> 'titel'), ''),
    bauvorhaben = nullif(trim(p_kopf ->> 'bauvorhaben'), ''),
    objekt = nullif(trim(p_kopf ->> 'objekt'), ''),
    einleitung = nullif(p_kopf ->> 'einleitung', ''),
    lieferbedingungen = nullif(p_kopf ->> 'lieferbedingungen', ''),
    nachbemerkung = nullif(p_kopf ->> 'nachbemerkung', ''),
    zahlungsbedingung_id = nullif(p_kopf ->> 'zahlungsbedingung_id', '')::uuid,
    zahlungsbedingung_text = nullif(p_kopf ->> 'zahlungsbedingung_text', ''),
    zahlungsziel_tage = nullif(p_kopf ->> 'zahlungsziel_tage', '')::integer,
    skontoziel_tage = nullif(p_kopf ->> 'skontoziel_tage', '')::integer,
    skonto_prozent = nullif(p_kopf ->> 'skonto_prozent', '')::numeric,
    steuerart = coalesce(nullif(p_kopf ->> 'steuerart', ''), 'standard'),
    preise_brutto = coalesce((p_kopf ->> 'preise_brutto')::boolean, false),
    gesamtrabatt_prozent = coalesce(nullif(p_kopf ->> 'gesamtrabatt_prozent', '')::numeric, 0),
    gueltig_bis = case when v_art = 'angebot' then v_gueltig end,
    liefertermin = nullif(p_kopf ->> 'liefertermin', '')::date,
    leistung_von = nullif(p_kopf ->> 'leistung_von', '')::date,
    leistung_bis = nullif(p_kopf ->> 'leistung_bis', '')::date,
    teil = v_teil,
    abschlag_prozent = case when v_art = 'abschlagsrechnung' then nullif(p_kopf ->> 'abschlag_prozent', '')::numeric end,
    abschlag_betrag = case when v_art = 'abschlagsrechnung' then nullif(p_kopf ->> 'abschlag_betrag', '')::numeric end,
    tags = coalesce((select array_agg(distinct trim(t)) from jsonb_array_elements_text(coalesce(p_kopf -> 'tags', '[]'::jsonb)) t
                      where trim(t) <> ''), '{}'),
    kommentar_intern = nullif(p_kopf ->> 'kommentar_intern', ''),
    version = v_version
  where id = v_id;

  -- Positionen: vorhandene ändern, neue anlegen, fehlende als gelöscht markieren
  for v_pos in select * from jsonb_array_elements(coalesce(p_positionen, '[]'::jsonb)) loop
    v_i := v_i + 1;
    v_pid := nullif(v_pos ->> 'id', '')::uuid;
    v_abzug := null;
    if v_art = 'rechnung' and not v_teil and v_auftrag is not null and nullif(v_pos ->> 'abzug_beleg_id', '') is not null then
      select a.id into v_abzug from public.beleg a
       where a.id = (v_pos ->> 'abzug_beleg_id')::uuid and a.auftrag_id = v_auftrag
         and (a.art = 'abschlagsrechnung' or (a.art = 'rechnung' and a.teil))
         and a.status not in ('entwurf', 'storniert') and a.deleted_at is null;
    end if;
    if v_pid is not null and exists (select 1 from public.beleg_position where id = v_pid and beleg_id = v_id) then
      update public.beleg_position set
        reihenfolge = v_i,
        typ = coalesce(nullif(v_pos ->> 'typ', ''), 'artikel'),
        titel = coalesce(v_pos ->> 'titel', ''),
        beschreibung_html = nullif(v_pos ->> 'beschreibung_html', ''),
        optional = coalesce((v_pos ->> 'optional')::boolean, false) and v_art = 'angebot',
        menge = coalesce(nullif(v_pos ->> 'menge', '')::numeric, 1),
        einheit = nullif(v_pos ->> 'einheit', ''),
        einzelpreis = coalesce(nullif(v_pos ->> 'einzelpreis', '')::numeric, 0),
        rabatt_prozent = coalesce(nullif(v_pos ->> 'rabatt_prozent', '')::numeric, 0),
        steuersatz = coalesce(nullif(v_pos ->> 'steuersatz', '')::numeric, 19),
        abzug_beleg_id = v_abzug
      where id = v_pid;
    else
      insert into public.beleg_position (beleg_id, reihenfolge, typ, titel, beschreibung_html, optional, menge, einheit,
                                         einzelpreis, rabatt_prozent, steuersatz, abzug_beleg_id)
      values (v_id, v_i, coalesce(nullif(v_pos ->> 'typ', ''), 'artikel'), coalesce(v_pos ->> 'titel', ''),
              nullif(v_pos ->> 'beschreibung_html', ''), coalesce((v_pos ->> 'optional')::boolean, false) and v_art = 'angebot',
              coalesce(nullif(v_pos ->> 'menge', '')::numeric, 1), nullif(v_pos ->> 'einheit', ''),
              coalesce(nullif(v_pos ->> 'einzelpreis', '')::numeric, 0),
              coalesce(nullif(v_pos ->> 'rabatt_prozent', '')::numeric, 0),
              coalesce(nullif(v_pos ->> 'steuersatz', '')::numeric, 19), v_abzug)
      returning id into v_pid;
    end if;
    v_ids := array_append(v_ids, v_pid);
  end loop;
  for r in select id from public.beleg_position where beleg_id = v_id and deleted_at is null and not (id = any (v_ids)) loop
    perform app.loeschen('beleg_position', r.id);
  end loop;
  -- Summen rechnet die Datenbank aus den Positionen (Angaben des Aufrufers zählen nicht)
  update public.beleg b set summe_netto = s.netto, summe_brutto = s.brutto
    from app.beleg_summen(v_id) s
   where b.id = v_id;
  return v_id;
end $$;
