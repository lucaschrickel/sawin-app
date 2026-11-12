-- Sicherheitsereignisse am eigenen Konto im Audit-Log (z. B. Passwort geändert). Nur der Server (Service-Rolle) schreibt
-- sie, mit dem handelnden Benutzer; Benutzer selbst können die Funktion nicht aufrufen.
alter table audit.log drop constraint log_aktion_check;
alter table audit.log add constraint log_aktion_check check (aktion in ('insert', 'update', 'soft_delete', 'restore', 'delete', 'ereignis'));

create function public.konto_ereignis(p_benutzer uuid, p_art text, p_daten jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path to ''
as $$
begin
  if p_art !~ '^[a-z_]{1,40}$' then
    raise exception 'Unbekanntes Ereignis' using errcode = '22023';
  end if;
  insert into audit.log (benutzer_id, db_rolle, tabelle, datensatz_id, aktion, nachher)
  values (p_benutzer, current_user, 'konto', p_benutzer, 'ereignis', jsonb_build_object('ereignis', p_art) || coalesce(p_daten, '{}'::jsonb));
end $$;
comment on function public.konto_ereignis(uuid, text, jsonb) is 'Server: Sicherheitsereignis am Konto ins Audit-Log (z. B. passwort_geaendert)';
revoke all on function public.konto_ereignis(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.konto_ereignis(uuid, text, jsonb) to service_role;
