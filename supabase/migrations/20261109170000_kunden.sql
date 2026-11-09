-- =====================================================================================================================
-- Modul Kunden: Speichern mit Lieferadressen in einem Schritt, Schutz der Lexware-Felder, Löschregel
-- =====================================================================================================================

-- ---------------------------------------------------------------------------------------------------------------------
-- Kunde mit Lieferadressen speichern (eine Transaktion). SECURITY INVOKER: RLS und Audit-Log gelten für den Benutzer.
--   p_id             null = neuer Kunde
--   p_kunde          {name, typ, bauleister_13b, ansprechpartner, herkunft, strasse, plz, ort, land, telefon, email, notiz}
--   p_lieferadressen [{id?, bezeichnung, strasse, plz, ort, alt}] in Anzeigereihenfolge. Gespeicherte Lieferadressen
--                    werden nie gelöscht, nur als „Alt“ markiert (alt_seit); fehlt eine in der Liste, bleibt sie, wie sie ist.
-- ---------------------------------------------------------------------------------------------------------------------
create function public.kunde_speichern(p_id uuid, p_kunde jsonb, p_lieferadressen jsonb default '[]'::jsonb)
returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  v_id uuid := p_id;
  v_la jsonb;
  v_nr integer := 0;
  v_anzahl integer;
begin
  if v_id is null then
    insert into public.kunde (name, typ, bauleister_13b, ansprechpartner, herkunft, strasse, plz, ort, land, telefon, email, notiz)
    values (trim(p_kunde ->> 'name'), coalesce(p_kunde ->> 'typ', 'privat'), coalesce((p_kunde ->> 'bauleister_13b')::boolean, false),
            nullif(trim(p_kunde ->> 'ansprechpartner'), ''), nullif(p_kunde ->> 'herkunft', ''), nullif(trim(p_kunde ->> 'strasse'), ''),
            nullif(trim(p_kunde ->> 'plz'), ''), nullif(trim(p_kunde ->> 'ort'), ''), coalesce(nullif(trim(p_kunde ->> 'land'), ''), 'Deutschland'),
            nullif(trim(p_kunde ->> 'telefon'), ''), nullif(lower(trim(p_kunde ->> 'email')), ''), nullif(p_kunde ->> 'notiz', ''))
    returning id into v_id;
  else
    update public.kunde set
      name = trim(p_kunde ->> 'name'),
      typ = coalesce(p_kunde ->> 'typ', 'privat'),
      bauleister_13b = coalesce((p_kunde ->> 'bauleister_13b')::boolean, false),
      ansprechpartner = nullif(trim(p_kunde ->> 'ansprechpartner'), ''),
      herkunft = nullif(p_kunde ->> 'herkunft', ''),
      strasse = nullif(trim(p_kunde ->> 'strasse'), ''),
      plz = nullif(trim(p_kunde ->> 'plz'), ''),
      ort = nullif(trim(p_kunde ->> 'ort'), ''),
      land = coalesce(nullif(trim(p_kunde ->> 'land'), ''), 'Deutschland'),
      telefon = nullif(trim(p_kunde ->> 'telefon'), ''),
      email = nullif(lower(trim(p_kunde ->> 'email')), ''),
      notiz = nullif(p_kunde ->> 'notiz', '')
    where id = v_id;
    get diagnostics v_anzahl = row_count;
    if v_anzahl = 0 then
      raise exception 'Kunde nicht gefunden' using errcode = 'P0002';
    end if;
  end if;

  for v_la in select * from jsonb_array_elements(coalesce(p_lieferadressen, '[]'::jsonb)) loop
    v_nr := v_nr + 1;
    if nullif(v_la ->> 'id', '') is null then
      if coalesce(trim(v_la ->> 'strasse'), '') = '' and coalesce(trim(v_la ->> 'ort'), '') = '' then
        continue; -- leere neue Zeile
      end if;
      insert into public.kunde_lieferadresse (kunde_id, bezeichnung, strasse, plz, ort, alt_seit, reihenfolge)
      values (v_id, nullif(trim(v_la ->> 'bezeichnung'), ''), nullif(trim(v_la ->> 'strasse'), ''), nullif(trim(v_la ->> 'plz'), ''),
              nullif(trim(v_la ->> 'ort'), ''), case when (v_la ->> 'alt')::boolean then current_date end, v_nr);
    else
      update public.kunde_lieferadresse set
        bezeichnung = nullif(trim(v_la ->> 'bezeichnung'), ''),
        strasse = nullif(trim(v_la ->> 'strasse'), ''),
        plz = nullif(trim(v_la ->> 'plz'), ''),
        ort = nullif(trim(v_la ->> 'ort'), ''),
        alt_seit = case when coalesce((v_la ->> 'alt')::boolean, false) then coalesce(alt_seit, current_date) end,
        reihenfolge = v_nr
      where id = (v_la ->> 'id')::uuid and kunde_id = v_id;
      get diagnostics v_anzahl = row_count;
      if v_anzahl = 0 then
        raise exception 'Lieferadresse gehört nicht zu diesem Kunden' using errcode = 'P0002';
      end if;
    end if;
  end loop;
  return v_id;
end $$;
comment on function public.kunde_speichern(uuid, jsonb, jsonb) is 'Kunde mit Lieferadressen in einem Schritt anlegen oder ändern (RLS gilt, Audit-Log mit Benutzer)';
revoke execute on function public.kunde_speichern(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.kunde_speichern(uuid, jsonb, jsonb) to authenticated;

-- ---------------------------------------------------------------------------------------------------------------------
-- Lexware-Felder setzt nur die Lexware-Anbindung auf dem Server (Service-Rolle), nie ein Benutzer
-- ---------------------------------------------------------------------------------------------------------------------
create function app.kunde_lexware_schutz() returns trigger
language plpgsql set search_path = '' as $$
begin
  if auth.uid() is not null then
    if tg_op = 'INSERT' then
      new.lexware_kontakt_id := null;
      new.lexware_seit := null;
    else
      new.lexware_kontakt_id := old.lexware_kontakt_id;
      new.lexware_seit := old.lexware_seit;
    end if;
  end if;
  return new;
end $$;
create trigger lexware_schutz before insert or update on public.kunde
  for each row execute function app.kunde_lexware_schutz();

-- ---------------------------------------------------------------------------------------------------------------------
-- Löschen (Markierung) nur ohne verknüpfte Anfragen, Aufträge, Belege oder Service-Tickets
-- ---------------------------------------------------------------------------------------------------------------------
create function app.kunde_loeschen_pruefen() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_teile text[] := '{}';
begin
  if new.deleted_at is null or old.deleted_at is not null then
    return new;
  end if;
  if exists (select 1 from public.anfrage where kunde_id = old.id and deleted_at is null) then v_teile := v_teile || 'Anfragen'; end if;
  if exists (select 1 from public.auftrag where kunde_id = old.id and deleted_at is null) then v_teile := v_teile || 'Aufträge'; end if;
  if exists (select 1 from public.beleg where kunde_id = old.id and deleted_at is null) then v_teile := v_teile || 'Belege'; end if;
  if exists (select 1 from public.service_ticket where kunde_id = old.id and deleted_at is null) then v_teile := v_teile || 'Service-Tickets'; end if;
  if cardinality(v_teile) > 0 then
    raise exception 'Der Kunde hat noch %. Er kann deshalb nicht gelöscht werden.', array_to_string(v_teile, ', ')
      using errcode = '23503';
  end if;
  return new;
end $$;
create trigger loeschen_pruefen before update on public.kunde
  for each row execute function app.kunde_loeschen_pruefen();
