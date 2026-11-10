-- =====================================================================================================================
-- Modul Mitarbeiter: eigener Urlaubsanspruch (leer = Standard aus den Einstellungen), Löschregel
-- =====================================================================================================================

alter table public.mitarbeiter
  add column urlaubsanspruch_tage integer check (urlaubsanspruch_tage is null or urlaubsanspruch_tage between 0 and 366);
comment on column public.mitarbeiter.urlaubsanspruch_tage is 'Urlaubstage je Jahr; leer = einstellung.urlaubsanspruch_tage (z. B. Teilzeit abweichend)';

-- Löschen (Markierung) nur ohne Geschichte. Mit Einsätzen, Zeiten, Abwesenheiten, Kolonne oder Benutzerkonto bleibt
-- „Deaktivieren“ (aktiv = false): die Person verschwindet aus Plantafel und Auswahllisten, ihre Daten bleiben.
create function app.mitarbeiter_loeschen_pruefen() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_teile text[] := '{}';
begin
  if new.deleted_at is null or old.deleted_at is not null then
    return new;
  end if;
  if exists (select 1 from public.einsatz_monteur m join public.einsatz e on e.id = m.einsatz_id
              where m.mitarbeiter_id = old.id and m.deleted_at is null and e.deleted_at is null) then
    v_teile := array_append(v_teile, 'Einsätze');
  end if;
  if exists (select 1 from public.zeitbuchung where mitarbeiter_id = old.id and deleted_at is null) then v_teile := array_append(v_teile, 'Zeitbuchungen'); end if;
  if exists (select 1 from public.abwesenheit where mitarbeiter_id = old.id and deleted_at is null) then v_teile := array_append(v_teile, 'Abwesenheiten'); end if;
  if exists (select 1 from public.kolonne_mitglied where mitarbeiter_id = old.id and deleted_at is null) then v_teile := array_append(v_teile, 'eine Kolonne'); end if;
  if exists (select 1 from public.benutzer where mitarbeiter_id = old.id and deleted_at is null) then v_teile := array_append(v_teile, 'ein Benutzerkonto'); end if;
  if cardinality(v_teile) > 0 then
    raise exception 'Der Mitarbeiter hat %. Er kann deshalb nicht gelöscht, nur deaktiviert werden.', array_to_string(v_teile, ', ')
      using errcode = '23503';
  end if;
  return new;
end $$;
create trigger loeschen_pruefen before update on public.mitarbeiter
  for each row execute function app.mitarbeiter_loeschen_pruefen();
