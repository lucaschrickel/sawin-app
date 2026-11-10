-- =====================================================================================================================
-- Modul Abwesenheiten: Löschregel. Genehmigen und Ablehnen prüft schon app.abwesenheit_status (nur Admins).
-- Eine genehmigte oder abgelehnte Abwesenheit löscht nur ein Admin (sonst könnte jeder einen genehmigten Urlaub
-- entfernen). Beantragte und Krankmeldungen darf jeder Benutzer löschen (Antrag zurückziehen, Fehleingabe).
-- =====================================================================================================================

create function app.abwesenheit_loeschen_pruefen() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.deleted_at is null or old.deleted_at is not null or auth.uid() is null then
    return new;
  end if;
  if old.status in ('genehmigt', 'abgelehnt') and old.art <> 'krank' and not app.ist_admin() then
    raise exception 'Eine entschiedene Abwesenheit kann nur ein Admin löschen.' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger loeschen_pruefen before update on public.abwesenheit
  for each row execute function app.abwesenheit_loeschen_pruefen();
