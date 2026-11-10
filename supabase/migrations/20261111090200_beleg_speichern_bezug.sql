-- =====================================================================================================================
-- Korrektur beleg_speichern: Beim erneuten Speichern bleibt der Bezug (Anfrage bzw. Auftrag) erhalten, wenn keiner
-- angegeben ist; fertiggestellte Belege ändern ihren Bezug nie. Vorher legte ein erneutes Speichern eines Angebots
-- ohne Bezugsangabe eine zweite Anfrage an.
-- =====================================================================================================================

create or replace function public.beleg_speichern(p_id uuid, p_kopf jsonb, p_positionen jsonb) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  v_alt public.beleg;
  v_id uuid := p_id;
  v_art text := p_kopf ->> 'art';
  v_vorgaenger public.beleg;
  v_anfrage uuid := nullif(p_kopf ->> 'anfrage_id', '')::uuid;
  v_auftrag uuid := nullif(p_kopf ->> 'auftrag_id', '')::uuid;
  v_kunde public.kunde;
  v_heute date := (now() at time zone 'Europe/Berlin')::date;
  v_datum date := coalesce(nullif(p_kopf ->> 'datum', '')::date, (now() at time zone 'Europe/Berlin')::date);
  v_gueltig date := nullif(p_kopf ->> 'gueltig_bis', '')::date;
  v_version integer;
  v_pos jsonb;
  v_ids uuid[] := '{}';
  v_pid uuid;
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
  elsif v_art not in ('angebot', 'auftragsbestaetigung', 'lieferschein') then
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
  end if;
  if v_id is not null and (v_alt.vorgaenger_id is not null or v_alt.status <> 'entwurf'
                          or (v_anfrage is null and v_auftrag is null)) then
    -- Folgebelege und fertiggestellte Belege behalten ihren Bezug; ohne Angabe bleibt der bisherige
    v_anfrage := v_alt.anfrage_id;
    v_auftrag := v_alt.auftrag_id;
  end if;
  if v_anfrage is not null and v_auftrag is not null then
    v_anfrage := null;
  end if;
  if v_art = 'lieferschein' and v_auftrag is null then
    raise exception 'Ein Lieferschein gehört zu einem Auftrag.' using errcode = '23514';
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
    insert into public.beleg (art, vorgaenger_id, anfrage_id, auftrag_id, kunde_id, datum)
    values (v_art, v_vorgaenger.id, v_anfrage, v_auftrag, v_kunde.id, v_datum)
    returning id into v_id;
  end if;

  update public.beleg set
    anfrage_id = v_anfrage,
    auftrag_id = v_auftrag,
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
        steuersatz = coalesce(nullif(v_pos ->> 'steuersatz', '')::numeric, 19)
      where id = v_pid;
    else
      insert into public.beleg_position (beleg_id, reihenfolge, typ, titel, beschreibung_html, optional, menge, einheit,
                                         einzelpreis, rabatt_prozent, steuersatz)
      values (v_id, v_i, coalesce(nullif(v_pos ->> 'typ', ''), 'artikel'), coalesce(v_pos ->> 'titel', ''),
              nullif(v_pos ->> 'beschreibung_html', ''), coalesce((v_pos ->> 'optional')::boolean, false) and v_art = 'angebot',
              coalesce(nullif(v_pos ->> 'menge', '')::numeric, 1), nullif(v_pos ->> 'einheit', ''),
              coalesce(nullif(v_pos ->> 'einzelpreis', '')::numeric, 0),
              coalesce(nullif(v_pos ->> 'rabatt_prozent', '')::numeric, 0),
              coalesce(nullif(v_pos ->> 'steuersatz', '')::numeric, 19))
      returning id into v_pid;
    end if;
    v_ids := array_append(v_ids, v_pid);
  end loop;
  for r in select id from public.beleg_position where beleg_id = v_id and deleted_at is null and not (id = any (v_ids)) loop
    perform app.loeschen('beleg_position', r.id);
  end loop;
  return v_id;
end $$;
