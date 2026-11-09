-- Neue Supabase-Projekte geben neu angelegten Tabellen keine API-Rechte mehr automatisch (auch der Service-Rolle
-- nicht). Die Service-Rolle (nur Server und Tests, umgeht RLS) braucht Lesen, Anlegen und Ändern.

grant select, insert, update on all tables in schema public to service_role;

-- Künftige Fachtabellen bekommen die Rechte über app.einrichten
create or replace function app.einrichten(p_tabelle text, p_lesen text, p_anlegen text, p_aendern text default null) returns void
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
  execute format('grant select, insert, update on table public.%I to service_role', p_tabelle);
  execute format('create policy lesen on public.%I for select to authenticated using (deleted_at is null and %s)', p_tabelle, p_lesen);
  execute format('create policy anlegen on public.%I for insert to authenticated with check (%s)', p_tabelle, p_anlegen);
  execute format('create policy aendern on public.%I for update to authenticated using (deleted_at is null and %s) with check (%s)', p_tabelle, v_aendern, v_aendern);
end $$;
revoke execute on function app.einrichten(text, text, text, text) from public;

-- Prüfung: jede Tabelle in public ist für die Service-Rolle les- und schreibbar
do $$
declare
  r record;
begin
  for r in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relkind = 'r'
              and not (has_table_privilege('service_role', c.oid, 'select')
                       and has_table_privilege('service_role', c.oid, 'insert')
                       and has_table_privilege('service_role', c.oid, 'update')) loop
    raise exception 'Service-Rolle ohne Rechte auf public.%', r.relname;
  end loop;
end $$;
