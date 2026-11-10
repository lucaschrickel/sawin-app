-- =====================================================================================================================
-- Modul Belege, Schritt 1 (ohne Lexware): Angebot, Auftragsbestätigung, Lieferschein
--   * Speichern (Kopf + Positionen in einem Schritt), Fertigstellen, Angenommen/Abgelehnt, „Als übergeben markieren“
--   * Die AB legt beim Fertigstellen den Auftrag an (Auftragsnummer = AB-Nummer); kein anderer Weg legt Aufträge an
--   * Status wechselt nur über die vorgesehenen Wege (Fertigstellen über beleg_fertigstellen, Angebot über die Regeln)
--   * PDFs liegen im privaten Speicher „belege“
-- =====================================================================================================================

-- ---------------------------------------------------------------------------------------------------------------------
-- Übergang beendet: „Gewonnen – Auftrag anlegen“ entfällt, der Auftrag entsteht nur noch mit der AB
-- ---------------------------------------------------------------------------------------------------------------------
drop function public.anfrage_auftrag_anlegen(uuid);

-- Ein Auftrag hat genau eine (fertiggestellte) AB
create unique index beleg_ab_je_auftrag_uk on public.beleg (auftrag_id)
  where art = 'auftragsbestaetigung' and status <> 'entwurf' and deleted_at is null and auftrag_id is not null;

-- ---------------------------------------------------------------------------------------------------------------------
-- Nummern: wie bisher; die AB eines schon bestehenden Auftrags (Übergang vor dem Beleg-Modul) übernimmt dessen Nummer
-- ---------------------------------------------------------------------------------------------------------------------
create or replace function app.beleg_nummer() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_ab public.beleg;
  v_n integer;
  v_nr text;
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
  elsif new.status <> 'entwurf' and new.art = 'auftragsbestaetigung' and new.auftrag_id is not null then
    select a.nummer into v_nr from public.auftrag a
     where a.id = new.auftrag_id and a.deleted_at is null
       and not exists (select 1 from public.beleg b
                        where b.auftrag_id = a.id and b.art = 'auftragsbestaetigung' and b.id <> new.id
                          and b.status <> 'entwurf' and b.deleted_at is null);
    if v_nr is null then
      raise exception 'Der Auftrag hat schon eine Auftragsbestätigung.' using errcode = '23505';
    end if;
    new.nummer := v_nr;
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

-- ---------------------------------------------------------------------------------------------------------------------
-- Sperre: wie bisher, aber das Fertigstellen einer AB darf die Kette von der Anfrage auf den Auftrag umhängen
-- ---------------------------------------------------------------------------------------------------------------------
create or replace function app.beleg_sperre() returns trigger
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
  if coalesce(current_setting('app.beleg_vorgang', true), '') = 'fertigstellen'
     and (to_jsonb(new) - v_frei - array['anfrage_id', 'auftrag_id']) is not distinct from (to_jsonb(old) - v_frei - array['anfrage_id', 'auftrag_id']) then
    return new;
  end if;
  if not app.beleg_bearbeitbar(old.id)
     and (to_jsonb(new) - v_frei) is distinct from (to_jsonb(old) - v_frei) then
    raise exception 'Der Beleg % ist fertiggestellt und gesperrt', old.nummer using errcode = '42501';
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------------------------------------------------
-- Status-Regeln für angemeldete Benutzer:
--   * neue Belege sind immer Entwurf; Lexware-Felder setzt nur der Server
--   * Entwurf → fertig nur über beleg_fertigstellen
--   * Angebot: offen → angenommen/abgelehnt (und zurück auf offen, solange keine AB existiert);
--     „nicht beauftragt“ setzt nur das Fertigstellen der AB einer anderen Variante
-- ---------------------------------------------------------------------------------------------------------------------
create function app.beleg_status_regeln() returns trigger
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
    new.fertiggestellt_am := null;
    new.fertiggestellt_von := null;
    new.version := 1;
    new.eingefroren_version := null;
    return new;
  end if;
  new.lexware_id := old.lexware_id;
  new.lexware_status := old.lexware_status;
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
    if v_vorgang <> 'fertigstellen' then
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
-- Name mit „aa“: Trigger laufen alphabetisch, die Regeln müssen vor Kette und Nummer greifen
create trigger beleg_aa_status_regeln before insert or update on public.beleg
  for each row execute function app.beleg_status_regeln();

-- ---------------------------------------------------------------------------------------------------------------------
-- Speichern: Kopf und Positionen in einem Schritt. Neues Angebot ohne Bezug legt im Hintergrund eine Anfrage an.
-- Bearbeiten eines fertiggestellten Angebots bzw. einer AB: Datum auf heute (Gültig bis wandert mit); war die
-- aktuelle Version eingefroren (übergeben/versendet), entsteht Version n+1 mit derselben Nummer.
-- SECURITY INVOKER: RLS, Sperren und Audit-Log gelten für den Benutzer.
-- ---------------------------------------------------------------------------------------------------------------------
create function public.beleg_speichern(p_id uuid, p_kopf jsonb, p_positionen jsonb) returns uuid
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
  if v_id is not null and v_alt.vorgaenger_id is not null then
    -- Folgebelege behalten den Bezug ihrer Kette
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
comment on function public.beleg_speichern(uuid, jsonb, jsonb) is 'Beleg (Kopf und Positionen) speichern; neues Angebot ohne Bezug legt eine Anfrage an';

-- ---------------------------------------------------------------------------------------------------------------------
-- Fertigstellen (App-Belege). AB: legt den Auftrag an (Nummer = AB-Nummer) bzw. übernimmt die Nummer eines bestehenden
-- Auftrags, hängt die Kette auf den Auftrag um, setzt das Angebot auf „Angenommen“, offene andere Varianten auf
-- „Nicht beauftragt“, verwirft deren Entwürfe und setzt die Anfrage auf „Gewonnen“.
-- ---------------------------------------------------------------------------------------------------------------------
create function public.beleg_fertigstellen(p_id uuid) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  v_b public.beleg;
  v_q public.anfrage;
  v_auftrag uuid;
  v_nr text;
  r record;
begin
  perform set_config('app.beleg_vorgang', 'fertigstellen', true);
  select * into v_b from public.beleg where id = p_id for update;
  if not found then
    raise exception 'Beleg nicht gefunden' using errcode = 'P0002';
  end if;
  if v_b.status <> 'entwurf' then
    raise exception 'Der Beleg ist schon fertiggestellt.' using errcode = '23514';
  end if;
  if v_b.art not in ('angebot', 'auftragsbestaetigung', 'lieferschein') then
    raise exception 'Diese Belegart wird über Lexware fertiggestellt.' using errcode = '22023';
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
  if v_b.art = 'lieferschein' and v_b.auftrag_id is null then
    raise exception 'Ein Lieferschein gehört zu einem Auftrag.' using errcode = '23514';
  end if;

  if v_b.art = 'angebot' then
    update public.beleg set status = 'offen', fertiggestellt_am = now(), fertiggestellt_von = auth.uid() where id = p_id;
    update public.anfrage set status = 'angebot_versendet'
     where id = v_b.anfrage_id and archiv is null and status <> 'angebot_versendet';
  elsif v_b.art = 'lieferschein' then
    update public.beleg set status = 'fertiggestellt', fertiggestellt_am = now(), fertiggestellt_von = auth.uid() where id = p_id;
  else
    v_auftrag := v_b.auftrag_id;
    if v_auftrag is null then
      select * into v_q from public.anfrage where id = v_b.anfrage_id;
      if v_q.archiv = 'verloren' then
        raise exception 'Die Anfrage ist als verloren archiviert.' using errcode = 'P0001';
      end if;
      if v_q.id is not null and exists (select 1 from public.auftrag where anfrage_id = v_q.id and deleted_at is null) then
        raise exception 'Zu dieser Anfrage gibt es schon einen Auftrag.' using errcode = '23505';
      end if;
      -- Auftrag mit der nächsten AB-Nummer; die AB übernimmt sie beim Fertigstellen (Auftragsnummer = AB-Nummer)
      insert into public.auftrag (nummer, kunde_id, anfrage_id, nachtrag_zu, titel, objekt, herkunft, zustaendig_id, produkte)
      select app.naechste_nummer('auftragsbestaetigung'), v_b.kunde_id, v_q.id, v_q.nachtrag_zu,
             coalesce(v_q.titel, v_b.titel, ''), coalesce(v_b.objekt, v_q.objekt), coalesce(v_q.herkunft, k.herkunft),
             v_q.zustaendig_id, coalesce(v_q.produkte, '{}')
        from public.kunde k where k.id = v_b.kunde_id
      returning id into v_auftrag;
      -- übrige Belege der Kette von der Anfrage auf den Auftrag umhängen
      update public.beleg set anfrage_id = null, auftrag_id = v_auftrag
       where kette_id = v_b.kette_id and id <> p_id and deleted_at is null;
      if v_q.id is not null then
        -- übrige Varianten: offene „Nicht beauftragt“, Entwürfe verwerfen
        update public.beleg set status = 'nicht_beauftragt'
         where anfrage_id = v_q.id and art = 'angebot' and status = 'offen' and deleted_at is null;
        for r in select id from public.beleg where anfrage_id = v_q.id and status = 'entwurf' and deleted_at is null loop
          perform app.loeschen('beleg', r.id);
        end loop;
        update public.anfrage set archiv = 'gewonnen' where id = v_q.id;
      end if;
    end if;
    update public.beleg set status = 'fertiggestellt', anfrage_id = null, auftrag_id = v_auftrag,
           fertiggestellt_am = now(), fertiggestellt_von = auth.uid()
     where id = p_id;
    -- Angebot der Kette ist angenommen
    update public.beleg set status = 'angenommen'
     where id = v_b.vorgaenger_id and art = 'angebot' and status = 'offen';
  end if;
  select nummer into v_nr from public.beleg where id = p_id;
  return jsonb_build_object('nummer', v_nr, 'auftrag_id', coalesce(v_auftrag, v_b.auftrag_id));
end $$;
comment on function public.beleg_fertigstellen(uuid) is 'App-Beleg fertigstellen; die AB legt den Auftrag an';

-- ---------------------------------------------------------------------------------------------------------------------
-- „Als übergeben markieren“ (Post, persönlich): friert die aktuelle Version von Angebot bzw. AB ein
-- ---------------------------------------------------------------------------------------------------------------------
create function public.beleg_uebergeben(p_id uuid) returns integer
language plpgsql security invoker set search_path = '' as $$
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
    insert into public.beleg_version (beleg_id, version, daten, pdf_pfad)
    values (p_id, v_b.version,
            to_jsonb(v_b) || jsonb_build_object('positionen', coalesce((
              select jsonb_agg(to_jsonb(p) order by p.reihenfolge) from public.beleg_position p
               where p.beleg_id = p_id and p.deleted_at is null), '[]'::jsonb)),
            v_b.pdf_pfad);
    update public.beleg set eingefroren_version = v_b.version where id = p_id;
  end if;
  insert into public.beleg_versand (beleg_id, version, kanal) values (p_id, v_b.version, 'uebergeben');
  return v_b.version;
end $$;
comment on function public.beleg_uebergeben(uuid) is 'Version von Angebot bzw. AB einfrieren und die Übergabe protokollieren';

revoke execute on function public.beleg_speichern(uuid, jsonb, jsonb), public.beleg_fertigstellen(uuid),
  public.beleg_uebergeben(uuid) from public, anon;
grant execute on function public.beleg_speichern(uuid, jsonb, jsonb), public.beleg_fertigstellen(uuid),
  public.beleg_uebergeben(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------------------------------
-- Speicher für Beleg-PDFs (privat). Pfad: <beleg_id>/<Dateiname>.pdf. Löschen gibt es nicht.
-- ---------------------------------------------------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('belege', 'belege', false, 10485760, array['application/pdf'])
on conflict (id) do nothing;

create policy belege_lesen on storage.objects for select to authenticated
  using (bucket_id = 'belege' and (select app.ist_benutzer()));
create policy belege_anlegen on storage.objects for insert to authenticated
  with check (bucket_id = 'belege' and (select app.ist_benutzer()));
create policy belege_ersetzen on storage.objects for update to authenticated
  using (bucket_id = 'belege' and (select app.ist_benutzer()))
  with check (bucket_id = 'belege' and (select app.ist_benutzer()));

-- ---------------------------------------------------------------------------------------------------------------------
-- Aufträge entstehen nur beim Fertigstellen der AB; die Auftragsnummer (= AB-Nummer) ändert sich nie
-- ---------------------------------------------------------------------------------------------------------------------
create function app.auftrag_nur_ueber_ab() returns trigger
language plpgsql set search_path = '' as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  if tg_op = 'INSERT' and coalesce(current_setting('app.beleg_vorgang', true), '') <> 'fertigstellen' then
    raise exception 'Ein Auftrag entsteht beim Fertigstellen der Auftragsbestätigung.' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' then
    new.nummer := old.nummer;
  end if;
  return new;
end $$;
create trigger auftrag_nur_ueber_ab before insert or update on public.auftrag
  for each row execute function app.auftrag_nur_ueber_ab();
