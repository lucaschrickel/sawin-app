-- =====================================================================================================================
-- Modul Zeiterfassung: Bezug je Art, Freigabe (wer, wann), Sperre freigegebener Buchungen
-- =====================================================================================================================

create function app.zeitbuchung_regeln() returns trigger
language plpgsql set search_path = '' as $$
begin
  -- Montage, Aufmaß und Service gehören immer zu einem Auftrag oder Ticket (Entscheidung 10.11.2026)
  if new.deleted_at is null and new.art in ('montage', 'aufmass', 'service') and num_nonnulls(new.auftrag_id, new.ticket_id) = 0 then
    raise exception 'Bei Montage, Aufmaß und Service bitte einen Auftrag wählen.' using errcode = '23514';
  end if;

  if tg_op = 'UPDATE' and old.freigabe = 'freigegeben' then
    if new.deleted_at is not null then
      raise exception 'Eine freigegebene Buchung kann nicht gelöscht werden. Bitte zuerst die Freigabe zurücknehmen.' using errcode = '42501';
    end if;
    -- Erlaubt ist nur das Zurücknehmen der Freigabe, ohne weitere Änderung
    if (new.mitarbeiter_id, new.auftrag_id, new.ticket_id, new.datum, new.beginn, new.ende, new.pause_min, new.art, new.taetigkeit)
       is distinct from
       (old.mitarbeiter_id, old.auftrag_id, old.ticket_id, old.datum, old.beginn, old.ende, old.pause_min, old.art, old.taetigkeit) then
      raise exception 'Die Buchung ist freigegeben und gesperrt. Bitte zuerst die Freigabe zurücknehmen.' using errcode = '42501';
    end if;
  end if;

  if new.freigabe = 'freigegeben' and (tg_op = 'INSERT' or old.freigabe is distinct from 'freigegeben') then
    new.freigegeben_von := auth.uid();
    new.freigegeben_am := now();
  elsif new.freigabe = 'offen' then
    new.freigegeben_von := null;
    new.freigegeben_am := null;
  else
    new.freigegeben_von := old.freigegeben_von;
    new.freigegeben_am := old.freigegeben_am;
  end if;
  return new;
end $$;
create trigger zeitbuchung_regeln before insert or update on public.zeitbuchung
  for each row execute function app.zeitbuchung_regeln();
