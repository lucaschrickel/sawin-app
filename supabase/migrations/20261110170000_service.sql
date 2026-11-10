-- =====================================================================================================================
-- Modul Service: Service-Tickets und Service-Plan
-- - vorab_datum: Tag in der Zeile „Terminierbar“ (kommende Woche, am Wunschtermin, wenn er später liegt)
-- - Status: „Eingeplant“ beim Einplanen, zurück auf „Neu“ ohne Einsatz; „Abgerechnet“ nur über die Rechnung (folgt)
-- - Löschen (Markierung) nur ohne Einsätze, Zeiten, Belege
-- =====================================================================================================================

-- Montag der kommenden Woche (Ortszeit Berlin)
create function app.naechster_montag() returns date
language sql stable set search_path = '' as $$
  select (date_trunc('week', (now() at time zone 'Europe/Berlin'))::date + 7)
$$;

create function app.hat_aktiven_einsatz(p_ticket uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.einsatz where ticket_id = p_ticket and deleted_at is null)
$$;

create function app.ticket_regeln() returns trigger
language plpgsql set search_path = '' as $$
begin
  -- „Abgerechnet“ setzt die App mit der fertiggestellten Rechnung, nicht von Hand
  if auth.uid() is not null and new.status = 'abgerechnet' and (tg_op = 'INSERT' or old.status is distinct from 'abgerechnet') then
    raise exception '„Abgerechnet“ setzt die App, sobald die Rechnung zum Ticket fertiggestellt ist.' using errcode = '42501';
  end if;
  -- Tag in „Terminierbar“: beim Anlegen und bei geändertem Wunschtermin, solange kein Termin besteht
  if (tg_op = 'INSERT' and new.vorab_datum is null)
     or (tg_op = 'UPDATE' and new.wunschtermin is distinct from old.wunschtermin and not app.hat_aktiven_einsatz(new.id)) then
    new.vorab_datum := greatest(app.naechster_montag(), coalesce(new.wunschtermin, app.naechster_montag()));
  end if;
  return new;
end $$;
create trigger ticket_regeln before insert or update on public.service_ticket
  for each row execute function app.ticket_regeln();

-- Status nach Einsätzen: Neu → Eingeplant beim ersten Einsatz, zurück auf Neu ohne Einsatz (dann wieder terminierbar)
create function app.ticket_status_nachziehen() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_ticket uuid;
begin
  foreach v_ticket in array array_remove(array[
    case when tg_op <> 'INSERT' then old.ticket_id end,
    case when tg_op <> 'DELETE' then new.ticket_id end], null) loop
    if app.hat_aktiven_einsatz(v_ticket) then
      update public.service_ticket set status = 'eingeplant' where id = v_ticket and status = 'neu';
    else
      update public.service_ticket set status = 'neu', vorab_datum = greatest(app.naechster_montag(), coalesce(wunschtermin, app.naechster_montag()))
       where id = v_ticket and status = 'eingeplant';
    end if;
  end loop;
  return null;
end $$;
create trigger ticket_status after insert or update of ticket_id, deleted_at on public.einsatz
  for each row execute function app.ticket_status_nachziehen();

-- Löschen (Markierung) nur ohne Einsätze, Zeitbuchungen und Belege
create function app.ticket_loeschen_pruefen() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_teile text[] := '{}';
begin
  if new.deleted_at is null or old.deleted_at is not null then
    return new;
  end if;
  if app.hat_aktiven_einsatz(old.id) then v_teile := array_append(v_teile, 'Einsätze'); end if;
  if exists (select 1 from public.zeitbuchung where ticket_id = old.id and deleted_at is null) then v_teile := array_append(v_teile, 'Zeitbuchungen'); end if;
  if exists (select 1 from public.beleg where ticket_id = old.id and deleted_at is null) then v_teile := array_append(v_teile, 'Belege'); end if;
  if cardinality(v_teile) > 0 then
    raise exception 'Das Ticket hat %. Es kann deshalb nicht gelöscht werden.', array_to_string(v_teile, ', ') using errcode = '23503';
  end if;
  return new;
end $$;
create trigger loeschen_pruefen before update on public.service_ticket
  for each row execute function app.ticket_loeschen_pruefen();

revoke execute on function app.naechster_montag(), app.hat_aktiven_einsatz(uuid) from public, anon;
grant execute on function app.naechster_montag(), app.hat_aktiven_einsatz(uuid) to authenticated;

-- Bestehende Tickets ohne Tag in „Terminierbar“ (vor diesem Modul angelegt)
update public.service_ticket set vorab_datum = greatest(app.naechster_montag(), coalesce(wunschtermin, app.naechster_montag()))
 where vorab_datum is null and deleted_at is null;
