-- =====================================================================================================================
-- Löschen als Markierung, Historie aus dem Audit-Log, Indizes für Fremdschlüssel, Selbstprüfung
-- =====================================================================================================================

-- ---------------------------------------------------------------------------------------------------------------------
-- Löschen: setzt deleted_at/deleted_by. Die eigentliche Änderung läuft in app (SECURITY DEFINER), weil die
-- Lese-Policy gelöschte Zeilen ausblendet und ein direktes UPDATE daran scheitern würde. Die Rechte prüft die
-- Funktion selbst, entsprechend den Policies der Tabelle.
-- ---------------------------------------------------------------------------------------------------------------------
create function app.loeschen(p_tabelle text, p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_spalte text;
  v_ok boolean;
  v_anzahl integer;
begin
  if not app.ist_benutzer() then
    raise exception 'Keine Berechtigung' using errcode = '42501';
  end if;
  if p_tabelle in ('einstellung', 'belegart_einstellung', 'nummernkreis', 'beleg_version', 'beleg_versand') then
    raise exception 'Datensätze in % können nicht gelöscht werden', p_tabelle using errcode = '42501';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = p_tabelle and column_name = 'deleted_at') then
    raise exception 'Unbekannte Tabelle %', p_tabelle using errcode = '42P01';
  end if;

  if p_tabelle = 'benutzer' and not app.ist_admin() then
    raise exception 'Nur ein Admin darf Benutzer löschen' using errcode = '42501';
  end if;
  if p_tabelle in ('kunde_kondition', 'lieferant_kondition') and not app.darf_konditionen() then
    raise exception 'Keine Berechtigung' using errcode = '42501';
  end if;
  v_spalte := case
    when p_tabelle in ('benutzer_einstellung', 'chat_gelesen', 'benachrichtigung') then 'benutzer_id'
    when p_tabelle = 'chat_nachricht' then 'autor_id' end;
  if v_spalte is not null then
    execute format('select exists (select 1 from public.%I where id = $1 and %I = $2)', p_tabelle, v_spalte)
      into v_ok using p_id, auth.uid();
    if not v_ok then
      raise exception 'Nur eigene Einträge können gelöscht werden' using errcode = '42501';
    end if;
  end if;

  execute format('update public.%I set deleted_at = now() where id = $1 and deleted_at is null', p_tabelle) using p_id;
  get diagnostics v_anzahl = row_count;
  if v_anzahl = 0 then
    raise exception 'Datensatz nicht gefunden' using errcode = 'P0002';
  end if;
end $$;
grant execute on function app.loeschen(text, uuid) to authenticated;

create function public.loeschen(p_tabelle text, p_id uuid) returns void
language sql security invoker set search_path = '' as $$
  select app.loeschen(p_tabelle, p_id)
$$;
comment on function public.loeschen(text, uuid) is 'Löscht einen Datensatz als Markierung (deleted_at). Echtes Löschen ist gesperrt.';

-- ---------------------------------------------------------------------------------------------------------------------
-- Historie eines Datensatzes aus dem Audit-Log (für die Reiter „Historie“)
-- ---------------------------------------------------------------------------------------------------------------------
create function app.historie(p_tabelle text, p_id uuid)
returns table (zeit timestamptz, benutzer_id uuid, benutzer_name text, db_rolle text, aktion text,
               geaendert text[], vorher jsonb, nachher jsonb)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.ist_benutzer() then
    raise exception 'Keine Berechtigung' using errcode = '42501';
  end if;
  -- Vertrauliche und persönliche Tabellen nur mit dem passenden Recht
  if (p_tabelle in ('kunde_kondition', 'lieferant_kondition') and not app.darf_konditionen())
     or (p_tabelle in ('benutzer', 'benutzer_einstellung', 'chat_gelesen', 'benachrichtigung') and not app.ist_admin()) then
    return;
  end if;
  return query
    select l.zeit, l.benutzer_id, b.name, l.db_rolle, l.aktion, l.geaendert, l.vorher, l.nachher
      from audit.log l
      left join public.benutzer b on b.id = l.benutzer_id
     where l.tabelle = p_tabelle and l.datensatz_id = p_id
     order by l.zeit desc, l.id desc;
end $$;
grant execute on function app.historie(text, uuid) to authenticated;

create function public.historie(p_tabelle text, p_id uuid)
returns table (zeit timestamptz, benutzer_id uuid, benutzer_name text, db_rolle text, aktion text,
               geaendert text[], vorher jsonb, nachher jsonb)
language sql stable security invoker set search_path = '' as $$
  select * from app.historie(p_tabelle, p_id)
$$;
comment on function public.historie(text, uuid) is 'Änderungen eines Datensatzes (wer, wann, was) aus dem Audit-Log';

revoke execute on function public.loeschen(text, uuid), public.historie(text, uuid) from public, anon;
grant execute on function public.loeschen(text, uuid), public.historie(text, uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------------------------------
-- Index für jeden einspaltigen Fremdschlüssel ohne passenden (nicht partiellen) Index
-- ---------------------------------------------------------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select c.conrelid::regclass as tabelle, c.conname, a.attname
      from pg_constraint c
      join pg_namespace n on n.oid = c.connamespace
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
     where c.contype = 'f' and n.nspname = 'public' and array_length(c.conkey, 1) = 1
       and not exists (select 1 from pg_index i
                        where i.indrelid = c.conrelid and i.indkey[0] = c.conkey[1] and i.indpred is null)
  loop
    execute format('create index %I on %s (%I)', replace(r.conname, '_fkey', '_idx'), r.tabelle, r.attname);
  end loop;
end $$;

-- ---------------------------------------------------------------------------------------------------------------------
-- Selbstprüfung: bricht die Migration ab, wenn eine Regel verletzt ist
-- ---------------------------------------------------------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity loop
    raise exception 'Tabelle public.% ohne Row Level Security', r.relname;
  end loop;
  for r in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relkind = 'r'
              and not exists (select 1 from pg_trigger t where t.tgrelid = c.oid and t.tgname = 'protokoll') loop
    raise exception 'Tabelle public.% ohne Audit-Trigger', r.relname;
  end loop;
  for r in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relkind = 'r'
              and not exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attname = 'deleted_at') loop
    raise exception 'Tabelle public.% ohne deleted_at', r.relname;
  end loop;
  for r in select distinct table_name, privilege_type from information_schema.role_table_grants
            where table_schema = 'public' and (grantee = 'anon'
                  or (grantee = 'authenticated' and privilege_type in ('DELETE', 'TRUNCATE'))) loop
    raise exception 'Unzulässiges Recht % auf public.%', r.privilege_type, r.table_name;
  end loop;
end $$;
