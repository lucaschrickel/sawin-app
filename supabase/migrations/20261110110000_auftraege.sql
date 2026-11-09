-- =====================================================================================================================
-- Modul Aufträge: Abschlussdatum, Löschregel
-- Phasen wie in CLAUDE.md und Demo: bestellung, montage, abnahme, baustelle_fertig, reklamation, abgeschlossen.
-- Bestellstatus, Montagetermin und Rechnungsstand werden abgeleitet, nicht als Phase gespeichert.
-- =====================================================================================================================

-- „Abgeschlossen am“ folgt der Phase
create function app.auftrag_regeln() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.phase = 'abgeschlossen' and (tg_op = 'INSERT' or old.phase is distinct from 'abgeschlossen') then
    new.abgeschlossen_am := now();
  elsif new.phase <> 'abgeschlossen' then
    new.abgeschlossen_am := null;
  end if;
  return new;
end $$;
create trigger auftrag_regeln before insert or update on public.auftrag
  for each row execute function app.auftrag_regeln();

-- Löschen (Markierung) nur, solange nichts am Auftrag hängt, das ohne ihn nicht mehr einzuordnen wäre
create function app.auftrag_loeschen_pruefen() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_teile text[] := '{}';
begin
  if new.deleted_at is null or old.deleted_at is not null then
    return new;
  end if;
  if exists (select 1 from public.beleg where auftrag_id = old.id and deleted_at is null) then v_teile := array_append(v_teile, 'Belege'); end if;
  if exists (select 1 from public.einsatz where auftrag_id = old.id and deleted_at is null) then v_teile := array_append(v_teile, 'Einsätze'); end if;
  if exists (select 1 from public.bestellzeile where auftrag_id = old.id and deleted_at is null) then v_teile := array_append(v_teile, 'Bestellungen'); end if;
  if exists (select 1 from public.zeitbuchung where auftrag_id = old.id and deleted_at is null) then v_teile := array_append(v_teile, 'Zeitbuchungen'); end if;
  if exists (select 1 from public.service_ticket where auftrag_id = old.id and deleted_at is null) then v_teile := array_append(v_teile, 'Service-Tickets'); end if;
  if exists (select 1 from public.auftrag where nachtrag_zu = old.id and deleted_at is null) then v_teile := array_append(v_teile, 'Nachträge'); end if;
  if cardinality(v_teile) > 0 then
    raise exception 'Der Auftrag hat %. Er kann deshalb nicht gelöscht werden.', array_to_string(v_teile, ', ')
      using errcode = '23503';
  end if;
  return new;
end $$;
create trigger loeschen_pruefen before update on public.auftrag
  for each row execute function app.auftrag_loeschen_pruefen();
