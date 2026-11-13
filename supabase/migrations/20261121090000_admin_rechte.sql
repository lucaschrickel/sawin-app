-- Sicherheitsprüfung (ASVS L1, 21.11.2026): Admin-Rechte in der Datenbank statt nur in der App.
--
-- 1. einstellung: Go-live-Datum und OneDrive-Verbindung darf nur ein Admin ändern; die Felder des Zahlungsabgleichs und
--    der Lexware-Fremdbelege schreibt nur der Server (Service-Rolle). Die einzige Zeile lässt sich nicht löschen.
-- 2. belegart_einstellung (interne Kopie je Belegart): anlegen und ändern nur Admin.
-- 3. abwesenheit: Eine Abwesenheit anderer Art lässt sich von Nicht-Admins nicht nachträglich zur Krankmeldung machen
--    (sonst wäre ein beantragter oder abgelehnter Urlaub ohne Admin genehmigt). Eine Krankmeldung ist ein neuer Eintrag.

-- 1. einstellung -------------------------------------------------------------------------------------------------
create function app.einstellung_schutz() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is null then
    return new; -- Server (Service-Rolle)
  end if;
  if (new.lexware_zahlung_abgleich_am, new.lexware_fremdbelege, new.lexware_fremdbelege_am)
     is distinct from (old.lexware_zahlung_abgleich_am, old.lexware_fremdbelege, old.lexware_fremdbelege_am) then
    raise exception 'Diese Felder setzt nur der Server.' using errcode = '42501';
  end if;
  if new.deleted_at is distinct from old.deleted_at then
    raise exception 'Die Einstellungen lassen sich nicht löschen.' using errcode = '42501';
  end if;
  if not app.ist_admin()
     and (new.golive_datum, new.onedrive_site_id, new.onedrive_liste_id, new.onedrive_drive_id, new.onedrive_basis_pfad,
          new.onedrive_basis_id, new.onedrive_basis_url, new.onedrive_geprueft_am)
         is distinct from
         (old.golive_datum, old.onedrive_site_id, old.onedrive_liste_id, old.onedrive_drive_id, old.onedrive_basis_pfad,
          old.onedrive_basis_id, old.onedrive_basis_url, old.onedrive_geprueft_am) then
    raise exception 'Go-live-Datum und OneDrive-Verbindung darf nur ein Admin ändern.' using errcode = '42501';
  end if;
  return new;
end $$;

create trigger einstellung_schutz before update on public.einstellung
  for each row execute function app.einstellung_schutz();

-- 2. belegart_einstellung ----------------------------------------------------------------------------------------
drop policy "anlegen" on public.belegart_einstellung;
drop policy "aendern" on public.belegart_einstellung;
create policy "anlegen" on public.belegart_einstellung for insert to authenticated
  with check ((select app.ist_admin()));
create policy "aendern" on public.belegart_einstellung for update to authenticated
  using (deleted_at is null and (select app.ist_admin()))
  with check ((select app.ist_admin()));

-- 3. abwesenheit -------------------------------------------------------------------------------------------------
create or replace function app.abwesenheit_status() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return new; -- Server-Prozesse (z. B. Datenübernahme)
  end if;

  if new.art = 'krank' then
    -- Aus einer Abwesenheit anderer Art wird ohne Admin keine Krankmeldung (sie gälte sofort als genehmigt)
    if tg_op = 'UPDATE' and old.art is distinct from 'krank' and not app.ist_admin() then
      raise exception 'Eine Krankmeldung bitte als neuen Eintrag erfassen.' using errcode = '42501';
    end if;
    -- Krankmeldungen gelten ohne Genehmigung
    if tg_op = 'INSERT' or old.status is distinct from 'genehmigt' or old.art is distinct from 'krank' then
      new.status := 'genehmigt';
      new.entschieden_von := null;
      new.entschieden_am := now();
    else
      new.status := old.status;
      new.entschieden_von := old.entschieden_von;
      new.entschieden_am := old.entschieden_am;
    end if;
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.status <> 'beantragt' then
      if not app.ist_admin() then
        raise exception 'Nur ein Admin darf Abwesenheiten genehmigen oder ablehnen' using errcode = '42501';
      end if;
      new.entschieden_von := v_uid;
      new.entschieden_am := now();
    else
      new.entschieden_von := null;
      new.entschieden_am := null;
    end if;
    return new;
  end if;

  -- UPDATE
  if new.status is distinct from old.status then
    if not app.ist_admin() then
      raise exception 'Nur ein Admin darf Abwesenheiten genehmigen oder ablehnen' using errcode = '42501';
    end if;
    if new.status = 'beantragt' then
      new.entschieden_von := null;
      new.entschieden_am := null;
    else
      new.entschieden_von := v_uid;
      new.entschieden_am := now();
    end if;
  elsif not app.ist_admin()
        and old.status <> 'beantragt'
        and (new.von, new.bis, new.art, new.mitarbeiter_id) is distinct from (old.von, old.bis, old.art, old.mitarbeiter_id) then
    -- Geänderter Zeitraum einer entschiedenen Abwesenheit muss neu genehmigt werden
    new.status := 'beantragt';
    new.entschieden_von := null;
    new.entschieden_am := null;
  else
    new.entschieden_von := old.entschieden_von;
    new.entschieden_am := old.entschieden_am;
  end if;
  return new;
end $$;
