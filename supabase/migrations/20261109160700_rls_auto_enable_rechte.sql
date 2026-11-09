-- Supabase legt bei neuen Projekten optional den Ereignis-Trigger „ensure_rls“ mit der Funktion
-- public.rls_auto_enable() an (aktiviert RLS auf neuen Tabellen). Die Funktion ist SECURITY DEFINER und für alle
-- ausführbar; der Advisor warnt deshalb. Der Trigger selbst braucht keine Ausführungsrechte der API-Rollen.
do $$
begin
  if exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = 'rls_auto_enable') then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end $$;
