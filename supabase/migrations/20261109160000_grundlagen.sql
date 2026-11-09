-- =====================================================================================================================
-- Grundlagen: Schemas, Rechte-Voreinstellungen, Basis-Spalten, Zeitstempel, Audit-Log und Einrichtungsfunktion
-- Plan und Regeln: docs/datenmodell.md
-- =====================================================================================================================

create schema if not exists app;
create schema if not exists audit;
comment on schema app is 'Interne Hilfsfunktionen. Nicht über die API erreichbar.';
comment on schema audit is 'Änderungsprotokoll. Nicht über die API erreichbar.';

revoke all on schema app from public;
revoke all on schema audit from public;
-- RLS-Policies rufen Funktionen aus app auf; dafür braucht die aufrufende Rolle USAGE auf dem Schema.
grant usage on schema app to authenticated, service_role;
grant usage on schema audit to service_role;

-- Neue Objekte: anon bekommt nichts, authenticated nie DELETE/TRUNCATE (gelöscht wird nur als Markierung),
-- Funktionen sind nicht automatisch für alle ausführbar.
alter default privileges for role postgres in schema public revoke all on tables from anon;
alter default privileges for role postgres in schema public revoke delete, truncate on tables from authenticated;
alter default privileges for role postgres in schema public revoke execute on functions from public, anon;
alter default privileges for role postgres in schema app revoke execute on functions from public;
alter default privileges for role postgres in schema audit revoke execute on functions from public;

-- ---------------------------------------------------------------------------------------------------------------------
-- Basis-Spalten jeder Fachtabelle (über LIKE app.basis INCLUDING DEFAULTS eingebunden)
-- ---------------------------------------------------------------------------------------------------------------------
create table app.basis (
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  deleted_at timestamptz,
  deleted_by uuid
);
comment on table app.basis is 'Vorlage für Wer/Wann- und Soft-Delete-Spalten. Enthält nie Zeilen.';
revoke all on table app.basis from public, anon, authenticated;

-- Zeitstempel und Benutzer setzen. Angemeldete Benutzer können sie nicht vorgeben; Server-Prozesse ohne
-- Benutzer (z. B. Datenübernahme) dürfen created_at mitgeben.
create function app.stempel() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
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

-- ---------------------------------------------------------------------------------------------------------------------
-- Audit-Log: jede Änderung mit Benutzer, Rolle, Zeitpunkt, vorher/nachher. Nur anhängbar.
-- ---------------------------------------------------------------------------------------------------------------------
create table audit.log (
  id bigint generated always as identity primary key,
  zeit timestamptz not null default now(),
  benutzer_id uuid,
  db_rolle text not null,
  tabelle text not null,
  datensatz_id uuid,
  aktion text not null check (aktion in ('insert', 'update', 'soft_delete', 'restore', 'delete')),
  vorher jsonb,
  nachher jsonb,
  geaendert text[]
);
comment on table audit.log is 'Änderungsprotokoll aller Fachtabellen. benutzer_id = auth.uid(), db_rolle = authenticated, service_role oder Datenbankbenutzer (z. B. postgres bei Zugriffen von Luca als Admin).';
create index log_datensatz_idx on audit.log (tabelle, datensatz_id, zeit desc);
create index log_benutzer_idx on audit.log (benutzer_id, zeit desc);
alter table audit.log enable row level security;
revoke all on table audit.log from public, anon, authenticated;
grant select on table audit.log to service_role;

create function audit.protokoll() returns trigger
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
  values (auth.uid(),
          coalesce(nullif(current_setting('role', true), 'none'), session_user),
          tg_table_name,
          coalesce(v_neu ->> 'id', v_alt ->> 'id')::uuid,
          v_aktion, v_alt, v_neu, v_geaendert);
  return null;
end $$;

-- ---------------------------------------------------------------------------------------------------------------------
-- Einrichtung einer Fachtabelle: Trigger, RLS, Policies, Rechte. Nur während Migrationen aufgerufen.
--   p_lesen   Bedingung für SELECT (zusätzlich gilt immer deleted_at is null)
--   p_anlegen Bedingung für INSERT
--   p_aendern Bedingung für UPDATE (Standard: wie p_anlegen)
-- DELETE gibt es für angemeldete Benutzer nicht; gelöscht wird über public.loeschen().
-- ---------------------------------------------------------------------------------------------------------------------
create function app.einrichten(p_tabelle text, p_lesen text, p_anlegen text, p_aendern text default null) returns void
language plpgsql set search_path = '' as $$
declare
  v_aendern text := coalesce(p_aendern, p_anlegen);
begin
  execute format('create trigger stempel before insert or update on public.%I for each row execute function app.stempel()', p_tabelle);
  execute format('create trigger protokoll after insert or update or delete on public.%I for each row execute function audit.protokoll()', p_tabelle);
  execute format('alter table public.%I enable row level security', p_tabelle);
  execute format('revoke all on table public.%I from anon', p_tabelle);
  execute format('revoke delete, truncate, references, trigger on table public.%I from authenticated', p_tabelle);
  execute format('grant select, insert, update on table public.%I to authenticated', p_tabelle);
  execute format('create policy lesen on public.%I for select to authenticated using (deleted_at is null and %s)', p_tabelle, p_lesen);
  execute format('create policy anlegen on public.%I for insert to authenticated with check (%s)', p_tabelle, p_anlegen);
  execute format('create policy aendern on public.%I for update to authenticated using (deleted_at is null and %s) with check (%s)', p_tabelle, v_aendern, v_aendern);
end $$;
revoke execute on function app.einrichten(text, text, text, text) from public;
