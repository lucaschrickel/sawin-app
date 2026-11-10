-- =====================================================================================================================
-- Modul Einkauf: Lieferanten mit Ansprechpartnern, Bestellungen mit Zeilen je Auftrag, Lösch- und Speicherregeln
-- Status „Teilweise geliefert“, „Geliefert“, „Überfällig“ und der Bestellstatus des Auftrags werden abgeleitet.
-- =====================================================================================================================

-- Jede Bestellzeile gehört zu einem Auftrag (CLAUDE.md „Bestellungen“); Tabelle ist noch leer
alter table public.bestellzeile alter column auftrag_id set not null;
alter table public.bestellzeile add constraint bestellzeile_text_check check (length(trim(artikeltext)) > 0);
alter table public.lieferant add constraint lieferant_name_check check (length(trim(name)) > 0);
alter table public.lieferant_kontakt add constraint lieferant_kontakt_name_check check (length(trim(name)) > 0);

-- ---------------------------------------------------------------------------------------------------------------------
-- Lieferant samt Ansprechpartnern in einem Schritt (entfernte Ansprechpartner nur als gelöscht markiert)
-- ---------------------------------------------------------------------------------------------------------------------
create function public.lieferant_speichern(p_id uuid, p_lieferant jsonb, p_kontakte jsonb default '[]'::jsonb) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  v_id uuid := p_id;
  v_k jsonb;
  v_nr integer := 0;
  v_behalten uuid[] := '{}';
  v_anzahl integer;
  r record;
begin
  if v_id is null then
    insert into public.lieferant (name, produktgruppen, konfigurator_url, haendlerportal_url, unsere_kundennummer, lieferzeit, telefon, notiz)
    values (trim(p_lieferant ->> 'name'),
            coalesce(array(select jsonb_array_elements_text(p_lieferant -> 'produktgruppen')), '{}'),
            nullif(trim(p_lieferant ->> 'konfigurator_url'), ''), nullif(trim(p_lieferant ->> 'haendlerportal_url'), ''),
            nullif(trim(p_lieferant ->> 'unsere_kundennummer'), ''), nullif(trim(p_lieferant ->> 'lieferzeit'), ''),
            nullif(trim(p_lieferant ->> 'telefon'), ''), nullif(p_lieferant ->> 'notiz', ''))
    returning id into v_id;
  else
    update public.lieferant set
      name = trim(p_lieferant ->> 'name'),
      produktgruppen = coalesce(array(select jsonb_array_elements_text(p_lieferant -> 'produktgruppen')), '{}'),
      konfigurator_url = nullif(trim(p_lieferant ->> 'konfigurator_url'), ''),
      haendlerportal_url = nullif(trim(p_lieferant ->> 'haendlerportal_url'), ''),
      unsere_kundennummer = nullif(trim(p_lieferant ->> 'unsere_kundennummer'), ''),
      lieferzeit = nullif(trim(p_lieferant ->> 'lieferzeit'), ''),
      telefon = nullif(trim(p_lieferant ->> 'telefon'), ''),
      notiz = nullif(p_lieferant ->> 'notiz', '')
    where id = v_id;
    get diagnostics v_anzahl = row_count;
    if v_anzahl = 0 then
      raise exception 'Lieferant nicht gefunden' using errcode = 'P0002';
    end if;
  end if;

  for v_k in select * from jsonb_array_elements(coalesce(p_kontakte, '[]'::jsonb)) loop
    if coalesce(trim(v_k ->> 'name'), '') = '' then
      continue; -- leere Zeile
    end if;
    v_nr := v_nr + 1;
    if nullif(v_k ->> 'id', '') is null then
      insert into public.lieferant_kontakt (lieferant_id, name, funktion, handy, telefon, email, reihenfolge)
      values (v_id, trim(v_k ->> 'name'), nullif(trim(v_k ->> 'funktion'), ''), nullif(trim(v_k ->> 'handy'), ''),
              nullif(trim(v_k ->> 'telefon'), ''), nullif(lower(trim(v_k ->> 'email')), ''), v_nr)
      returning id into r;
      v_behalten := array_append(v_behalten, r.id);
    else
      update public.lieferant_kontakt set
        name = trim(v_k ->> 'name'), funktion = nullif(trim(v_k ->> 'funktion'), ''), handy = nullif(trim(v_k ->> 'handy'), ''),
        telefon = nullif(trim(v_k ->> 'telefon'), ''), email = nullif(lower(trim(v_k ->> 'email')), ''), reihenfolge = v_nr
      where id = (v_k ->> 'id')::uuid and lieferant_id = v_id;
      get diagnostics v_anzahl = row_count;
      if v_anzahl = 0 then
        raise exception 'Ansprechpartner gehört nicht zu diesem Lieferanten' using errcode = 'P0002';
      end if;
      v_behalten := array_append(v_behalten, (v_k ->> 'id')::uuid);
    end if;
  end loop;
  for r in select id from public.lieferant_kontakt where lieferant_id = v_id and not (id = any (v_behalten)) loop
    perform app.loeschen('lieferant_kontakt', r.id);
  end loop;
  return v_id;
end $$;

-- ---------------------------------------------------------------------------------------------------------------------
-- Bestellung samt Zeilen in einem Schritt. Zeilen: id (bestehend) oder neu; „geliefert“ bleibt bei bestehenden Zeilen
-- erhalten, wenn es nicht mitgegeben wird. Mindestens eine Zeile.
-- ---------------------------------------------------------------------------------------------------------------------
create function public.bestellung_speichern(p_id uuid, p_kopf jsonb, p_zeilen jsonb) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  v_id uuid := p_id;
  v_z jsonb;
  v_nr integer := 0;
  v_behalten uuid[] := '{}';
  v_anzahl integer;
  v_neu uuid;
  r record;
begin
  if (select count(*) from jsonb_array_elements(coalesce(p_zeilen, '[]'::jsonb)) z where coalesce(trim(z ->> 'artikeltext'), '') <> '') = 0 then
    raise exception 'Bitte mindestens eine Position mit Auftrag und Artikel eingeben.' using errcode = '23514';
  end if;
  if v_id is null then
    insert into public.bestellung (lieferant_id, bestelldatum, lieferanten_ab_nummer, liefer_kw, liefer_jahr, status, notiz)
    values ((p_kopf ->> 'lieferant_id')::uuid, coalesce((p_kopf ->> 'bestelldatum')::date, current_date),
            nullif(trim(p_kopf ->> 'lieferanten_ab_nummer'), ''), (p_kopf ->> 'liefer_kw')::integer, (p_kopf ->> 'liefer_jahr')::integer,
            coalesce(p_kopf ->> 'status', 'bestellt'), nullif(p_kopf ->> 'notiz', ''))
    returning id into v_id;
  else
    update public.bestellung set
      lieferant_id = (p_kopf ->> 'lieferant_id')::uuid,
      bestelldatum = coalesce((p_kopf ->> 'bestelldatum')::date, bestelldatum),
      lieferanten_ab_nummer = nullif(trim(p_kopf ->> 'lieferanten_ab_nummer'), ''),
      liefer_kw = (p_kopf ->> 'liefer_kw')::integer,
      liefer_jahr = (p_kopf ->> 'liefer_jahr')::integer,
      status = coalesce(p_kopf ->> 'status', status),
      notiz = nullif(p_kopf ->> 'notiz', '')
    where id = v_id;
    get diagnostics v_anzahl = row_count;
    if v_anzahl = 0 then
      raise exception 'Bestellung nicht gefunden' using errcode = 'P0002';
    end if;
  end if;

  for v_z in select * from jsonb_array_elements(p_zeilen) loop
    if coalesce(trim(v_z ->> 'artikeltext'), '') = '' then
      continue;
    end if;
    v_nr := v_nr + 1;
    if nullif(v_z ->> 'id', '') is null then
      insert into public.bestellzeile (bestellung_id, auftrag_id, artikeltext, menge, geliefert, reihenfolge)
      values (v_id, (v_z ->> 'auftrag_id')::uuid, trim(v_z ->> 'artikeltext'), coalesce((v_z ->> 'menge')::numeric, 1),
              coalesce((v_z ->> 'geliefert')::boolean, false), v_nr)
      returning id into v_neu;
      v_behalten := array_append(v_behalten, v_neu);
    else
      update public.bestellzeile set
        auftrag_id = (v_z ->> 'auftrag_id')::uuid, artikeltext = trim(v_z ->> 'artikeltext'), menge = coalesce((v_z ->> 'menge')::numeric, 1),
        geliefert = coalesce((v_z ->> 'geliefert')::boolean, geliefert), reihenfolge = v_nr
      where id = (v_z ->> 'id')::uuid and bestellung_id = v_id;
      get diagnostics v_anzahl = row_count;
      if v_anzahl = 0 then
        raise exception 'Zeile gehört nicht zu dieser Bestellung' using errcode = 'P0002';
      end if;
      v_behalten := array_append(v_behalten, (v_z ->> 'id')::uuid);
    end if;
  end loop;
  for r in select id from public.bestellzeile where bestellung_id = v_id and not (id = any (v_behalten)) loop
    perform app.loeschen('bestellzeile', r.id);
  end loop;
  return v_id;
end $$;

-- Bestellung samt Zeilen als gelöscht markieren; schon (teilweise) gelieferte Bestellungen bleiben
create function public.bestellung_loeschen(p_id uuid) returns void
language plpgsql security invoker set search_path = '' as $$
declare
  r record;
begin
  if exists (select 1 from public.bestellzeile where bestellung_id = p_id and geliefert and deleted_at is null) then
    raise exception 'Die Bestellung ist schon (teilweise) geliefert und kann nicht gelöscht werden.' using errcode = '23503';
  end if;
  for r in select id from public.bestellzeile where bestellung_id = p_id loop
    perform app.loeschen('bestellzeile', r.id);
  end loop;
  perform app.loeschen('bestellung', p_id);
end $$;

-- Lieferant löschen (Markierung) nur ohne offene Bestellungen; Ansprechpartner und Konditionen werden mit markiert
create function app.lieferant_loeschen_pruefen() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.deleted_at is null or old.deleted_at is not null then
    return new;
  end if;
  if exists (select 1 from public.bestellung b where b.lieferant_id = old.id and b.deleted_at is null
              and exists (select 1 from public.bestellzeile z where z.bestellung_id = b.id and z.deleted_at is null and not z.geliefert)) then
    raise exception 'Der Lieferant hat offene Bestellungen und kann deshalb nicht gelöscht werden.' using errcode = '23503';
  end if;
  update public.lieferant_kontakt set deleted_at = now() where lieferant_id = old.id and deleted_at is null;
  update public.lieferant_kondition set deleted_at = now() where lieferant_id = old.id and deleted_at is null;
  return new;
end $$;
create trigger loeschen_pruefen before update on public.lieferant
  for each row execute function app.lieferant_loeschen_pruefen();

revoke execute on function public.lieferant_speichern(uuid, jsonb, jsonb), public.bestellung_speichern(uuid, jsonb, jsonb),
  public.bestellung_loeschen(uuid) from public, anon;
grant execute on function public.lieferant_speichern(uuid, jsonb, jsonb), public.bestellung_speichern(uuid, jsonb, jsonb),
  public.bestellung_loeschen(uuid) to authenticated;
