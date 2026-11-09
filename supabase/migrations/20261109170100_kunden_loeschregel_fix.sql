-- Korrektur: text[] || 'Text' wurde als Array-Literal gelesen (Fehler 22P02) statt die Begründung zu melden.
create or replace function app.kunde_loeschen_pruefen() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_teile text[] := '{}';
begin
  if new.deleted_at is null or old.deleted_at is not null then
    return new;
  end if;
  if exists (select 1 from public.anfrage where kunde_id = old.id and deleted_at is null) then v_teile := array_append(v_teile, 'Anfragen'); end if;
  if exists (select 1 from public.auftrag where kunde_id = old.id and deleted_at is null) then v_teile := array_append(v_teile, 'Aufträge'); end if;
  if exists (select 1 from public.beleg where kunde_id = old.id and deleted_at is null) then v_teile := array_append(v_teile, 'Belege'); end if;
  if exists (select 1 from public.service_ticket where kunde_id = old.id and deleted_at is null) then v_teile := array_append(v_teile, 'Service-Tickets'); end if;
  if cardinality(v_teile) > 0 then
    raise exception 'Der Kunde hat noch %. Er kann deshalb nicht gelöscht werden.', array_to_string(v_teile, ', ')
      using errcode = '23503';
  end if;
  return new;
end $$;
