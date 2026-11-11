-- Formulare & Protokolle (CLAUDE.md „Formulare & Protokolle“): Aufmaßblatt digital (speichert automatisch, Entwurf /
-- Abgeschlossen, PDF in „03 Aufmaß - Freigabe“), Montageprotokoll, Servicebericht und Übergabeprotokoll als gedruckte
-- Vorlage mit Scan (Gedruckt → Scan abgelegt). Tabellen formular und aufmass_zeile bestehen seit planung_arbeit.

-- Verknüpfung der Ablage mit dem Formular: PDF des Aufmaßes (quelle formular, eines je Formular) und Scans (quelle upload)
alter table public.ablage_datei add column formular_id uuid references public.formular (id);
create index ablage_datei_formular on public.ablage_datei (formular_id) where formular_id is not null;
create unique index ablage_datei_formular_pdf on public.ablage_datei (formular_id)
  where formular_id is not null and quelle = 'formular' and deleted_at is null;

create or replace function public.ablage_datei_setzen(p_benutzer uuid, p_id uuid, p_daten jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := p_id;
begin
  perform set_config('app.im_namen_von', coalesce(p_benutzer::text, ''), true);
  if v_id is null then
    insert into public.ablage_datei (ordner_id, unterordner, name, quelle, beleg_id, version, formular_id, mime, groesse, drive_id, item_id,
                                     web_url, status, puffer_pfad, versuche, fehler, abgelegt_am)
    values ((p_daten ->> 'ordner_id')::uuid, p_daten ->> 'unterordner', p_daten ->> 'name', p_daten ->> 'quelle',
            (p_daten ->> 'beleg_id')::uuid, (p_daten ->> 'version')::integer, (p_daten ->> 'formular_id')::uuid, p_daten ->> 'mime',
            (p_daten ->> 'groesse')::bigint, p_daten ->> 'drive_id', p_daten ->> 'item_id', p_daten ->> 'web_url',
            coalesce(p_daten ->> 'status', 'wartet'), p_daten ->> 'puffer_pfad', coalesce((p_daten ->> 'versuche')::integer, 0),
            left(p_daten ->> 'fehler', 2000), (p_daten ->> 'abgelegt_am')::timestamptz)
    returning id into v_id;
  elsif coalesce((p_daten ->> 'geloescht')::boolean, false) then
    -- als gelöscht markieren (app.loeschen verlangt einen angemeldeten Benutzer; hier handelt der Server)
    update public.ablage_datei set deleted_at = now() where id = v_id and deleted_at is null;
  else
    update public.ablage_datei set
      ordner_id = coalesce((p_daten ->> 'ordner_id')::uuid, ordner_id),
      name = coalesce(p_daten ->> 'name', name),
      mime = coalesce(p_daten ->> 'mime', mime),
      groesse = coalesce((p_daten ->> 'groesse')::bigint, groesse),
      drive_id = case when p_daten ? 'drive_id' then p_daten ->> 'drive_id' else drive_id end,
      item_id = case when p_daten ? 'item_id' then p_daten ->> 'item_id' else item_id end,
      web_url = case when p_daten ? 'web_url' then p_daten ->> 'web_url' else web_url end,
      status = coalesce(p_daten ->> 'status', status),
      puffer_pfad = case when p_daten ? 'puffer_pfad' then p_daten ->> 'puffer_pfad' else puffer_pfad end,
      versuche = coalesce((p_daten ->> 'versuche')::integer, versuche),
      fehler = case when p_daten ? 'fehler' then left(p_daten ->> 'fehler', 2000) else fehler end,
      abgelegt_am = case when p_daten ? 'abgelegt_am' then (p_daten ->> 'abgelegt_am')::timestamptz else abgelegt_am end
     where id = v_id and deleted_at is null;
  end if;
  return v_id;
end $$;
revoke execute on function public.ablage_datei_setzen(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.ablage_datei_setzen(uuid, uuid, jsonb) to service_role;

-- ---------------------------------------------------------------------------------------------------------------------
-- Regeln: Art und Bezug eines Formulars bleiben (außer dem Wechsel Anfrage → Auftrag mit der AB); ein abgeschlossenes
-- Aufmaß ist gesperrt, bis jemand „Wieder öffnen“ wählt; Protokolle wechseln nur von „gedruckt“ auf „scan_abgelegt“.
-- ---------------------------------------------------------------------------------------------------------------------
create function app.formular_pruefen() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.typ <> old.typ then
    raise exception 'Die Art eines Formulars lässt sich nicht ändern.' using errcode = 'P0001';
  end if;
  if new.ticket_id is distinct from old.ticket_id
     or (new.auftrag_id is distinct from old.auftrag_id and not (old.anfrage_id is not null and new.anfrage_id is null)) then
    raise exception 'Der Bezug eines Formulars lässt sich nicht ändern.' using errcode = 'P0001';
  end if;
  if new.typ = 'aufmass' and old.status = 'abgeschlossen' and new.status = 'abgeschlossen' and new.deleted_at is null
     and (new.datum, new.hinweise) is distinct from (old.datum, old.hinweise) then
    raise exception 'Das Aufmaß ist abgeschlossen. Bitte zuerst „Wieder öffnen“.' using errcode = 'P0001';
  end if;
  if new.typ <> 'aufmass' and old.status = 'scan_abgelegt' and new.status = 'gedruckt' then
    raise exception 'Der Scan ist bereits abgelegt.' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger formular_pruefen before update on public.formular for each row execute function app.formular_pruefen();

create function app.aufmass_zeile_pruefen() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not exists (select 1 from public.formular f
                  where f.id = new.formular_id and f.typ = 'aufmass' and f.status = 'entwurf' and f.deleted_at is null) then
    raise exception 'Das Aufmaß ist abgeschlossen. Bitte zuerst „Wieder öffnen“.' using errcode = 'P0001';
  end if;
  if tg_op = 'UPDATE' and new.formular_id <> old.formular_id then
    raise exception 'Eine Aufmaß-Zeile gehört immer zu ihrem Aufmaß.' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger aufmass_zeile_pruefen before insert or update on public.aufmass_zeile
  for each row execute function app.aufmass_zeile_pruefen();

-- ---------------------------------------------------------------------------------------------------------------------
-- Aufmaß speichern (automatisch beim Tippen): Kopf und alle Zeilen in einem Schritt. Zeilen tragen eine im Browser
-- erzeugte ID; fehlende Zeilen werden als gelöscht markiert; unveränderte Zeilen werden nicht geschrieben (Audit-Log).
-- ---------------------------------------------------------------------------------------------------------------------
create function public.aufmass_speichern(p_id uuid, p_datum date, p_hinweise text, p_zeilen jsonb) returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare
  v_ids uuid[];
  z jsonb;
  i integer := 0;
  v_breite integer;
  v_hoehe integer;
  v_anzahl integer;
begin
  if not app.ist_benutzer() then
    raise exception 'Keine Berechtigung' using errcode = '42501';
  end if;
  if not exists (select 1 from public.formular where id = p_id and typ = 'aufmass' and deleted_at is null) then
    raise exception 'Aufmaß nicht gefunden.' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.formular where id = p_id and status = 'entwurf') then
    raise exception 'Das Aufmaß ist abgeschlossen. Bitte zuerst „Wieder öffnen“.' using errcode = 'P0001';
  end if;
  if jsonb_typeof(p_zeilen) <> 'array' or jsonb_array_length(p_zeilen) > 500 then
    raise exception 'Ungültige Zeilen.' using errcode = '22023';
  end if;

  update public.formular
     set datum = coalesce(p_datum, datum), hinweise = nullif(left(trim(coalesce(p_hinweise, '')), 4000), '')
   where id = p_id
     and (datum, hinweise) is distinct from (coalesce(p_datum, datum), nullif(left(trim(coalesce(p_hinweise, '')), 4000), ''));

  select coalesce(array_agg((x ->> 'id')::uuid), '{}') into v_ids from jsonb_array_elements(p_zeilen) x;
  update public.aufmass_zeile set deleted_at = now()
   where formular_id = p_id and deleted_at is null and not (id = any (v_ids));

  for z in select * from jsonb_array_elements(p_zeilen) loop
    i := i + 1;
    v_breite := case when (z ->> 'breite_mm') ~ '^\d{1,6}$' and (z ->> 'breite_mm')::integer > 0 then (z ->> 'breite_mm')::integer end;
    v_hoehe := case when (z ->> 'hoehe_mm') ~ '^\d{1,6}$' and (z ->> 'hoehe_mm')::integer > 0 then (z ->> 'hoehe_mm')::integer end;
    v_anzahl := case when (z ->> 'anzahl') ~ '^\d{1,5}$' and (z ->> 'anzahl')::integer > 0 then (z ->> 'anzahl')::integer else 1 end;
    insert into public.aufmass_zeile as a (id, formular_id, reihenfolge, raum, element, breite_mm, hoehe_mm, anzahl, anschlag, bemerkung)
    values ((z ->> 'id')::uuid, p_id, i,
            nullif(left(trim(coalesce(z ->> 'raum', '')), 200), ''),
            nullif(left(trim(coalesce(z ->> 'element', '')), 200), ''),
            v_breite, v_hoehe, v_anzahl,
            nullif(left(trim(coalesce(z ->> 'anschlag', '')), 100), ''),
            nullif(left(trim(coalesce(z ->> 'bemerkung', '')), 1000), ''))
    on conflict (id) do update set
      reihenfolge = excluded.reihenfolge, raum = excluded.raum, element = excluded.element, breite_mm = excluded.breite_mm,
      hoehe_mm = excluded.hoehe_mm, anzahl = excluded.anzahl, anschlag = excluded.anschlag, bemerkung = excluded.bemerkung
     where a.formular_id = p_id and a.deleted_at is null
       and (a.reihenfolge, a.raum, a.element, a.breite_mm, a.hoehe_mm, a.anzahl, a.anschlag, a.bemerkung)
           is distinct from (excluded.reihenfolge, excluded.raum, excluded.element, excluded.breite_mm, excluded.hoehe_mm,
                             excluded.anzahl, excluded.anschlag, excluded.bemerkung);
  end loop;
  return now();
end $$;
revoke execute on function public.aufmass_speichern(uuid, date, text, jsonb) from public, anon;
grant execute on function public.aufmass_speichern(uuid, date, text, jsonb) to authenticated;
comment on function public.aufmass_speichern(uuid, date, text, jsonb) is
  'Aufmaßblatt speichern (Kopf und Zeilen), nur im Entwurf. Zeilen-IDs kommen aus dem Browser; fehlende Zeilen werden als gelöscht markiert.';

-- ---------------------------------------------------------------------------------------------------------------------
-- Mit dem Auftrag wandert das Aufmaßblatt der Anfrage in den Auftrag (CLAUDE.md „Anfragen“)
-- ---------------------------------------------------------------------------------------------------------------------
create function app.formulare_zum_auftrag() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.anfrage_id is not null then
    update public.formular set auftrag_id = new.id, anfrage_id = null
     where anfrage_id = new.anfrage_id and deleted_at is null;
  end if;
  return null;
end $$;
create trigger formulare_zum_auftrag after insert on public.auftrag for each row execute function app.formulare_zum_auftrag();
