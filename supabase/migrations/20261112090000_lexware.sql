-- =====================================================================================================================
-- Modul Belege, Schritt 2: Lexware-Anbindung für Rechnung, Abschlagsrechnung und Gutschrift
--   * Entwürfe liegen in der App (ohne Nummer); „Fertigstellen“ legt den Beleg über die Lexware-API an
--   * Abschläge legt die App als normale Lexware-Rechnung an („1. Abschlagsrechnung“), die Schlussrechnung zieht jeden
--     Abschlag als Minusposition ab (Entscheidung 10.11.2026, ersetzt die Übernahme von Lexware-Abschlagsrechnungen)
--   * Ergebnisse von Lexware (Nummer, Beträge, PDF, Kontakt-ID) schreibt nur der Server über die Funktionen lexware_*,
--     die ausschließlich die Service-Rolle aufrufen darf; der handelnde Benutzer steht trotzdem im Audit-Log
-- =====================================================================================================================

-- ---------------------------------------------------------------------------------------------------------------------
-- Handelnder Benutzer: angemeldeter Benutzer bzw. bei Serverfunktionen der Service-Rolle der Benutzer, in dessen
-- Auftrag sie laufen (app.im_namen_von, nur innerhalb der Transaktion gesetzt)
-- ---------------------------------------------------------------------------------------------------------------------
create function app.handelnder() returns uuid
language sql stable set search_path = '' as $$
  select coalesce(auth.uid(),
                  case when coalesce(current_setting('role', true), '') = 'service_role'
                       then nullif(current_setting('app.im_namen_von', true), '')::uuid end)
$$;
grant execute on function app.handelnder() to authenticated, service_role;

create or replace function app.stempel() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_uid uuid := app.handelnder();
begin
  if tg_op = 'INSERT' then
    if v_uid is not null then
      new.created_at := now();
      new.created_by := v_uid;
      new.deleted_at := null;
      new.deleted_by := null;
    end if;
    new.created_at := coalesce(new.created_at, now());
  else
    new.created_at := old.created_at;
    new.created_by := old.created_by;
    if new.deleted_at is not null and old.deleted_at is null then
      new.deleted_by := coalesce(v_uid, new.deleted_by);
    elsif new.deleted_at is null then
      new.deleted_by := null;
    else
      new.deleted_at := old.deleted_at;
      new.deleted_by := old.deleted_by;
    end if;
  end if;
  new.updated_at := now();
  new.updated_by := v_uid;
  return new;
end $$;

create or replace function audit.protokoll() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_alt jsonb;
  v_neu jsonb;
  v_aktion text;
  v_geaendert text[];
begin
  if tg_op = 'INSERT' then
    v_neu := to_jsonb(new);
    v_aktion := 'insert';
  elsif tg_op = 'UPDATE' then
    v_alt := to_jsonb(old);
    v_neu := to_jsonb(new);
    select array_agg(k order by k) into v_geaendert
      from jsonb_object_keys(v_neu) as k
     where k not in ('updated_at', 'updated_by') and (v_neu -> k) is distinct from (v_alt -> k);
    if v_geaendert is null then
      return null;
    end if;
    v_aktion := case
      when v_alt ->> 'deleted_at' is null and v_neu ->> 'deleted_at' is not null then 'soft_delete'
      when v_alt ->> 'deleted_at' is not null and v_neu ->> 'deleted_at' is null then 'restore'
      else 'update' end;
  else
    v_alt := to_jsonb(old);
    v_aktion := 'delete';
  end if;
  insert into audit.log (benutzer_id, db_rolle, tabelle, datensatz_id, aktion, vorher, nachher, geaendert)
  values (app.handelnder(),
          coalesce(nullif(current_setting('role', true), 'none'), session_user),
          tg_table_name,
          coalesce(v_neu ->> 'id', v_alt ->> 'id')::uuid,
          v_aktion, v_alt, v_neu, v_geaendert);
  return null;
end $$;

-- ---------------------------------------------------------------------------------------------------------------------
-- Neue Felder
-- ---------------------------------------------------------------------------------------------------------------------
alter table public.beleg
  add column abschlag_nr integer check (abschlag_nr >= 1),
  add column abschlag_prozent numeric(7, 4) check (abschlag_prozent > 0 and abschlag_prozent <= 100),
  add column abschlag_betrag numeric(12, 2) check (abschlag_betrag > 0),
  add column steuern jsonb not null default '[]'::jsonb,
  add column lexware_fehler text,
  add column lexware_versuch_am timestamptz,
  add constraint beleg_abschlag check (art = 'abschlagsrechnung' or (abschlag_nr is null and abschlag_prozent is null and abschlag_betrag is null)),
  add constraint beleg_lexware_status check (lexware_status is null or lexware_status in ('uebertragung', 'fehler', 'pdf_fehlt', 'fertig'));
comment on column public.beleg.abschlag_nr is 'Laufende Nummer des Abschlags am Auftrag („1.“, „2.“ …), vergeben beim Übertragen an Lexware';
comment on column public.beleg.abschlag_prozent is 'Eingabe des Abschlags in Prozent vom Auftragswert (brutto); sonst abschlag_betrag';
comment on column public.beleg.abschlag_betrag is 'Eingabe des Abschlags als Bruttobetrag; sonst abschlag_prozent';
comment on column public.beleg.steuern is 'Beträge je Steuersatz [{satz, netto, steuer, brutto}] laut Lexware (bei Lexware-Belegen nach dem Fertigstellen)';
comment on column public.beleg.lexware_status is 'uebertragung (läuft), fehler (letzter Versuch fehlgeschlagen, siehe lexware_fehler), pdf_fehlt (angelegt, PDF noch nicht abgeholt), fertig';
create unique index beleg_abschlag_nr_uk on public.beleg (auftrag_id, abschlag_nr)
  where abschlag_nr is not null and deleted_at is null;

alter table public.beleg_position
  add column abzug_beleg_id uuid references public.beleg (id);
comment on column public.beleg_position.abzug_beleg_id is 'Schlussrechnung: Minusposition für den Abzug dieser Abschlagsrechnung (von der App erzeugt, nicht abwählbar)';
create index beleg_position_abzug_idx on public.beleg_position (abzug_beleg_id) where abzug_beleg_id is not null;

alter table public.kunde add column lexware_hash text;
comment on column public.kunde.lexware_hash is 'Prüfsumme der zuletzt an Lexware übertragenen Kontaktdaten (Änderungen gehen nur App → Lexware)';

create or replace function app.kunde_lexware_schutz() returns trigger
language plpgsql set search_path = '' as $$
begin
  if auth.uid() is not null then
    if tg_op = 'INSERT' then
      new.lexware_kontakt_id := null;
      new.lexware_seit := null;
      new.lexware_hash := null;
    else
      new.lexware_kontakt_id := old.lexware_kontakt_id;
      new.lexware_seit := old.lexware_seit;
      new.lexware_hash := old.lexware_hash;
    end if;
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------------------------------------------------
-- Status-Regeln: wie bisher; zusätzlich setzen Abschlagsnummer, Steuerbeträge und Lexware-Felder nur der Server.
-- Ein Entwurf, der gerade an Lexware übertragen wird, lässt sich nicht verwerfen.
-- ---------------------------------------------------------------------------------------------------------------------
create or replace function app.beleg_status_regeln() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_vorgang text := coalesce(current_setting('app.beleg_vorgang', true), '');
begin
  if auth.uid() is null then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.status := 'entwurf';
    new.lexware_id := null;
    new.lexware_status := null;
    new.lexware_fehler := null;
    new.lexware_versuch_am := null;
    new.abschlag_nr := null;
    new.steuern := '[]'::jsonb;
    new.fertiggestellt_am := null;
    new.fertiggestellt_von := null;
    new.version := 1;
    new.eingefroren_version := null;
    return new;
  end if;
  new.lexware_id := old.lexware_id;
  new.lexware_status := old.lexware_status;
  new.lexware_fehler := old.lexware_fehler;
  new.lexware_versuch_am := old.lexware_versuch_am;
  new.abschlag_nr := old.abschlag_nr;
  new.steuern := old.steuern;
  if new.deleted_at is not null and old.deleted_at is null and old.lexware_status = 'uebertragung'
     and old.lexware_versuch_am > now() - interval '3 minutes' then
    raise exception 'Der Beleg wird gerade an Lexware übertragen.' using errcode = '42501';
  end if;
  if v_vorgang <> 'fertigstellen' then
    new.fertiggestellt_am := old.fertiggestellt_am;
    new.fertiggestellt_von := old.fertiggestellt_von;
  end if;
  if v_vorgang <> 'speichern' and v_vorgang <> 'uebergeben' then
    new.version := old.version;
    new.eingefroren_version := old.eingefroren_version;
  end if;
  if new.status = old.status then
    return new;
  end if;
  if old.status = 'entwurf' then
    if v_vorgang <> 'fertigstellen' or new.art in ('rechnung', 'abschlagsrechnung', 'gutschrift') then
      raise exception 'Belege werden über „Fertigstellen“ abgeschlossen.' using errcode = '42501';
    end if;
    return new;
  end if;
  if new.art = 'angebot' then
    if old.status = 'offen' and new.status in ('angenommen', 'abgelehnt') then
      return new;
    end if;
    if old.status = 'offen' and new.status = 'nicht_beauftragt' and v_vorgang = 'fertigstellen' then
      return new;
    end if;
    if old.status in ('angenommen', 'abgelehnt') and new.status = 'offen'
       and not exists (select 1 from public.beleg f where f.vorgaenger_id = old.id and f.art = 'auftragsbestaetigung'
                          and f.deleted_at is null) then
      return new;
    end if;
  end if;
  raise exception 'Dieser Statuswechsel ist nicht möglich.' using errcode = '42501';
end $$;

-- ---------------------------------------------------------------------------------------------------------------------
-- Speichern: zusätzlich Rechnung, Abschlagsrechnung und Gutschrift (Entwürfe in der App, ohne Nummer)
--   * Abschlagsrechnung: gehört zu einem Auftrag mit fertiggestellter AB
--   * Rechnung: gehört zu einem Auftrag (aus AB bzw. Lieferschein) oder zu einem Service-Ticket
--   * Gutschrift: entsteht nur aus einer Rechnung oder Abschlagsrechnung, die schon in Lexware liegt
--   * Abzugspositionen der Schlussrechnung verweisen auf fertiggestellte Abschläge desselben Auftrags
-- ---------------------------------------------------------------------------------------------------------------------
create or replace function public.beleg_speichern(p_id uuid, p_kopf jsonb, p_positionen jsonb) returns uuid
language plpgsql security invoker set search_path = '' as $$
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
  elsif v_art not in ('angebot', 'auftragsbestaetigung', 'lieferschein', 'rechnung', 'abschlagsrechnung', 'gutschrift') then
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
  if v_id is not null and (v_alt.vorgaenger_id is not null or v_alt.art in ('rechnung', 'abschlagsrechnung', 'gutschrift')) then
    -- Folgebelege und Lexware-Belege behalten ihren Bezug
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
    abschlag_prozent = case when v_art = 'abschlagsrechnung' then nullif(p_kopf ->> 'abschlag_prozent', '')::numeric end,
    abschlag_betrag = case when v_art = 'abschlagsrechnung' then nullif(p_kopf ->> 'abschlag_betrag', '')::numeric end,
    summe_netto = coalesce(nullif(p_kopf ->> 'summe_netto', '')::numeric, 0),
    summe_brutto = coalesce(nullif(p_kopf ->> 'summe_brutto', '')::numeric, 0),
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
    if v_art = 'rechnung' and v_auftrag is not null and nullif(v_pos ->> 'abzug_beleg_id', '') is not null then
      select a.id into v_abzug from public.beleg a
       where a.id = (v_pos ->> 'abzug_beleg_id')::uuid and a.art = 'abschlagsrechnung' and a.auftrag_id = v_auftrag
         and a.status <> 'entwurf' and a.deleted_at is null;
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
  return v_id;
end $$;

-- ---------------------------------------------------------------------------------------------------------------------
-- Lexware: Übertragung beginnen (prüft die Regeln, sperrt gegen doppelte Übertragung, vergibt die Abschlagsnummer)
-- Nur für den Server (Service-Rolle). p_benutzer = angemeldeter Benutzer, der „Fertigstellen“ geklickt hat.
-- ---------------------------------------------------------------------------------------------------------------------
create function public.lexware_start(p_id uuid, p_benutzer uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_b public.beleg;
  v_v public.beleg;
  v_nr integer;
  v_frueher boolean;
begin
  perform set_config('app.im_namen_von', p_benutzer::text, true);
  select * into v_b from public.beleg where id = p_id and deleted_at is null for update;
  if not found then
    raise exception 'Beleg nicht gefunden' using errcode = 'P0002';
  end if;
  if v_b.art not in ('rechnung', 'abschlagsrechnung', 'gutschrift') then
    raise exception 'Diese Belegart geht nicht an Lexware.' using errcode = '22023';
  end if;
  if v_b.status <> 'entwurf' or v_b.lexware_id is not null then
    raise exception 'Der Beleg liegt schon in Lexware.' using errcode = '23514';
  end if;
  if v_b.lexware_status = 'uebertragung' and v_b.lexware_versuch_am > now() - interval '3 minutes' then
    raise exception 'Der Beleg wird gerade an Lexware übertragen.' using errcode = 'P0001';
  end if;
  if v_b.kunde_id is null then
    raise exception 'Bitte einen Kunden wählen.' using errcode = '23514';
  end if;
  if not exists (select 1 from public.beleg_position where beleg_id = p_id and deleted_at is null and typ = 'artikel') then
    raise exception 'Der Beleg braucht mindestens eine Position.' using errcode = '23514';
  end if;
  if exists (select 1 from public.beleg_position where beleg_id = p_id and deleted_at is null and typ = 'artikel'
              and trim(titel) = '') then
    raise exception 'Jede Position braucht einen Titel.' using errcode = '23514';
  end if;

  if v_b.art in ('abschlagsrechnung', 'rechnung') and v_b.auftrag_id is not null then
    perform 1 from public.auftrag where id = v_b.auftrag_id for update;
    if not exists (select 1 from public.beleg where auftrag_id = v_b.auftrag_id and art = 'auftragsbestaetigung'
                    and status <> 'entwurf' and deleted_at is null) then
      raise exception 'Der Auftrag hat noch keine fertiggestellte Auftragsbestätigung.' using errcode = '23514';
    end if;
    if exists (select 1 from public.beleg where auftrag_id = v_b.auftrag_id and art = 'rechnung' and not teil
                and status <> 'entwurf' and deleted_at is null) then
      raise exception 'Zu diesem Auftrag gibt es schon eine Schlussrechnung. Korrekturen laufen über eine Gutschrift.'
        using errcode = '23514';
    end if;
    if exists (select 1 from public.beleg where auftrag_id = v_b.auftrag_id and id <> p_id and deleted_at is null
                and status = 'entwurf' and lexware_status = 'uebertragung'
                and lexware_versuch_am > now() - interval '3 minutes') then
      raise exception 'Ein anderer Beleg dieses Auftrags wird gerade an Lexware übertragen.' using errcode = 'P0001';
    end if;
  end if;

  if v_b.art = 'abschlagsrechnung' then
    if v_b.auftrag_id is null then
      raise exception 'Eine Abschlagsrechnung gehört zu einem Auftrag.' using errcode = '23514';
    end if;
    v_nr := v_b.abschlag_nr;
    if v_nr is null then
      select coalesce(max(abschlag_nr), 0) + 1 into v_nr from public.beleg
       where auftrag_id = v_b.auftrag_id and art = 'abschlagsrechnung' and deleted_at is null and abschlag_nr is not null;
    end if;
  elsif v_b.art = 'rechnung' then
    if v_b.auftrag_id is null and v_b.ticket_id is null then
      raise exception 'Eine Rechnung gehört zu einem Auftrag oder einem Service-Ticket.' using errcode = '23514';
    end if;
    if v_b.auftrag_id is not null and exists (
         select 1 from public.beleg a
          where a.auftrag_id = v_b.auftrag_id and a.art = 'abschlagsrechnung' and a.status <> 'entwurf' and a.deleted_at is null
            and not exists (select 1 from public.beleg_position p
                             where p.beleg_id = p_id and p.deleted_at is null and p.abzug_beleg_id = a.id)) then
      raise exception 'Die Schlussrechnung muss alle Abschläge abziehen. Bitte den Entwurf neu öffnen und speichern.'
        using errcode = '23514';
    end if;
    if v_b.leistung_von is null then
      raise exception 'Bitte das Leistungsdatum angeben.' using errcode = '23514';
    end if;
  else
    select * into v_v from public.beleg where id = v_b.vorgaenger_id and deleted_at is null;
    if v_v.id is null or v_v.art not in ('rechnung', 'abschlagsrechnung') or v_v.lexware_id is null then
      raise exception 'Eine Gutschrift entsteht aus einer Rechnung oder Abschlagsrechnung.' using errcode = '23514';
    end if;
  end if;

  v_frueher := v_b.lexware_versuch_am is not null;
  update public.beleg set
    lexware_status = 'uebertragung',
    lexware_versuch_am = now(),
    lexware_fehler = null,
    abschlag_nr = coalesce(v_nr, abschlag_nr),
    titel = case when art = 'abschlagsrechnung' then v_nr || '. Abschlagsrechnung' else titel end
  where id = p_id;
  return jsonb_build_object('abschlag_nr', v_nr, 'frueher_versucht', v_frueher);
end $$;
comment on function public.lexware_start(uuid, uuid) is 'Server: Übertragung an Lexware beginnen (Regeln prüfen, sperren, Abschlagsnummer vergeben)';

-- Übertragung fehlgeschlagen (Meldung für die Belegseite)
create function public.lexware_fehler(p_id uuid, p_benutzer uuid, p_fehler text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform set_config('app.im_namen_von', p_benutzer::text, true);
  update public.beleg set lexware_status = 'fehler', lexware_fehler = left(p_fehler, 1000)
   where id = p_id and status = 'entwurf';
end $$;
comment on function public.lexware_fehler(uuid, uuid, text) is 'Server: Übertragung an Lexware fehlgeschlagen';

-- Übertragung abgeschlossen: Nummer, Beträge und PDF von Lexware übernehmen; Ticket-Rechnung setzt das Ticket auf
-- „Abgerechnet“
create function public.lexware_fertig(p_id uuid, p_benutzer uuid, p_daten jsonb) returns void
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
    faellig_am = nullif(p_daten ->> 'faellig_am', '')::date,
    pdf_pfad = nullif(p_daten ->> 'pdf_pfad', ''),
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
comment on function public.lexware_fertig(uuid, uuid, jsonb) is 'Server: Ergebnis der Lexware-Übertragung übernehmen';

-- Original-PDF von Lexware nachträglich abgelegt
create function public.lexware_pdf(p_id uuid, p_benutzer uuid, p_pfad text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform set_config('app.im_namen_von', p_benutzer::text, true);
  update public.beleg set pdf_pfad = p_pfad, lexware_status = 'fertig'
   where id = p_id and lexware_id is not null and status <> 'entwurf';
end $$;
comment on function public.lexware_pdf(uuid, uuid, text) is 'Server: Original-PDF von Lexware abgelegt';

-- Kontakt in Lexware angelegt bzw. aktualisiert
create function public.lexware_kunde(p_kunde uuid, p_benutzer uuid, p_kontakt_id text, p_hash text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform set_config('app.im_namen_von', p_benutzer::text, true);
  update public.kunde set
    lexware_kontakt_id = coalesce(lexware_kontakt_id, p_kontakt_id),
    lexware_seit = coalesce(lexware_seit, now()),
    lexware_hash = p_hash
  where id = p_kunde;
end $$;
comment on function public.lexware_kunde(uuid, uuid, text, text) is 'Server: Lexware-Kontakt-ID und Stand der Übertragung am Kunden speichern';

revoke execute on function public.lexware_start(uuid, uuid), public.lexware_fehler(uuid, uuid, text),
  public.lexware_fertig(uuid, uuid, jsonb), public.lexware_pdf(uuid, uuid, text),
  public.lexware_kunde(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.lexware_start(uuid, uuid), public.lexware_fehler(uuid, uuid, text),
  public.lexware_fertig(uuid, uuid, jsonb), public.lexware_pdf(uuid, uuid, text),
  public.lexware_kunde(uuid, uuid, text, text) to service_role;
