-- Stornierte (übernommene) Rechnungen und Abschläge zählen wie nicht vorhanden: keine Schlussrechnung, kein Abzug,
-- kein Folgebeleg der AB, kein Grund für den automatischen Abschluss (wie gilt() in src/lib/belege-status.ts).
-- Gegenüber der vorherigen Fassung ist in jeder Funktion nur „status <> 'entwurf'“ an diesen Stellen erweitert.

CREATE OR REPLACE FUNCTION app.auftrag_auto_abschluss(p_auftrag uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_im_namen text := current_setting('app.im_namen_von', true);
begin
  if p_auftrag is null then
    return;
  end if;
  if exists (select 1 from public.auftrag where id = p_auftrag and phase in ('abnahme', 'baustelle_fertig') and deleted_at is null)
     and exists (select 1 from public.beleg where auftrag_id = p_auftrag and art = 'rechnung' and not teil
                  and status not in ('entwurf', 'storniert') and deleted_at is null)
     and not exists (select 1 from public.beleg where auftrag_id = p_auftrag and art in ('rechnung', 'abschlagsrechnung')
                      and status = 'offen' and deleted_at is null) then
    perform set_config('app.im_namen_von', '', true);
    update public.auftrag set phase = 'abgeschlossen' where id = p_auftrag;
    perform set_config('app.im_namen_von', coalesce(v_im_namen, ''), true);
  end if;
end $function$;

CREATE OR REPLACE FUNCTION app.beleg_bearbeitbar(p_beleg_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select b.status = 'entwurf'
      or ((b.art = 'angebot' and not exists (
            select 1 from public.beleg f
             where f.vorgaenger_id = b.id and f.art = 'auftragsbestaetigung' and f.deleted_at is null))
       or (b.art = 'auftragsbestaetigung' and not exists (
            select 1 from public.beleg f
             where f.kette_id = b.kette_id and f.id <> b.id and f.deleted_at is null and f.status not in ('entwurf', 'storniert')
               and f.art in ('teil_ab', 'lieferschein', 'abschlagsrechnung', 'rechnung'))))
     and not (b.altbestand and not exists (
            select 1 from public.beleg_position p where p.beleg_id = b.id and p.deleted_at is null))
    from public.beleg b
   where b.id = p_beleg_id
$function$;

CREATE OR REPLACE FUNCTION public.lexware_start(p_id uuid, p_benutzer uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
                and status not in ('entwurf', 'storniert') and deleted_at is null and id <> p_id) then
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
    if v_b.auftrag_id is not null and not v_b.teil and exists (
         select 1 from public.beleg a
          where a.auftrag_id = v_b.auftrag_id and a.status not in ('entwurf', 'storniert') and a.deleted_at is null
            and (a.art = 'abschlagsrechnung' or (a.art = 'rechnung' and a.teil))
            and not exists (select 1 from public.beleg_position p
                             where p.beleg_id = p_id and p.deleted_at is null and p.abzug_beleg_id = a.id)) then
      raise exception 'Die Schlussrechnung muss alle Abschläge und Teilrechnungen abziehen. Bitte den Entwurf neu öffnen und speichern.'
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
    titel = case when art = 'abschlagsrechnung' then v_nr || '. Abschlagsrechnung'
                 when art = 'rechnung' and teil then 'Teilrechnung' else titel end
  where id = p_id;
  return jsonb_build_object('abschlag_nr', v_nr, 'frueher_versucht', v_frueher);
end $function$;

CREATE OR REPLACE FUNCTION public.beleg_speichern(p_id uuid, p_kopf jsonb, p_positionen jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
  return v_id;
end $function$;
