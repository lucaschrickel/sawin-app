-- =====================================================================================================================
-- Modul Team und Ressourcen: Fahrzeug am Einsatz, Werkstatt-Konflikt, Löschregel Fahrzeug, Termine (Kalender)
-- Einsätze können ab jetzt auch zu einem Service-Ticket gehören (Service-Plan folgt im nächsten Modul).
-- =====================================================================================================================

-- ---------------------------------------------------------------------------------------------------------------------
-- Einsatz speichern: Auftrag ODER Ticket, Fahrzeug (höchstens eins), Team. Ersetzt die Fassung ohne Fahrzeug/Ticket.
-- ---------------------------------------------------------------------------------------------------------------------
drop function public.einsatz_speichern(uuid, uuid, timestamptz, timestamptz, uuid[], boolean, text);

create function public.einsatz_speichern(
  p_id uuid, p_auftrag_id uuid, p_ticket_id uuid, p_beginn timestamptz, p_ende timestamptz, p_monteure uuid[],
  p_fahrzeug_id uuid, p_fest boolean, p_hinweis text
) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  v_id uuid := p_id;
  r record;
begin
  if num_nonnulls(p_auftrag_id, p_ticket_id) <> 1 then
    raise exception 'Bitte einen Auftrag oder ein Service-Ticket wählen.' using errcode = '23502';
  end if;
  if coalesce(cardinality(p_monteure), 0) = 0 then
    raise exception 'Bitte mindestens einen Monteur wählen.' using errcode = '23514';
  end if;
  if p_ende <= p_beginn then
    raise exception 'Das Ende muss nach dem Beginn liegen.' using errcode = '23514';
  end if;

  if v_id is null then
    insert into public.einsatz (auftrag_id, ticket_id, beginn, ende, fahrzeug_id, fest, hinweis)
    values (p_auftrag_id, p_ticket_id, p_beginn, p_ende, p_fahrzeug_id, coalesce(p_fest, false), nullif(trim(p_hinweis), ''))
    returning id into v_id;
  else
    update public.einsatz
       set auftrag_id = p_auftrag_id, ticket_id = p_ticket_id, beginn = p_beginn, ende = p_ende, fahrzeug_id = p_fahrzeug_id,
           fest = coalesce(p_fest, fest), hinweis = nullif(trim(p_hinweis), '')
     where id = v_id;
    if not found then
      raise exception 'Einsatz nicht gefunden' using errcode = 'P0002';
    end if;
  end if;

  for r in select id from public.einsatz_monteur where einsatz_id = v_id and not (mitarbeiter_id = any (p_monteure)) loop
    perform app.loeschen('einsatz_monteur', r.id);
  end loop;
  insert into public.einsatz_monteur (einsatz_id, mitarbeiter_id)
  select distinct v_id, m from unnest(p_monteure) as m
   where not exists (select 1 from public.einsatz_monteur x where x.einsatz_id = v_id and x.mitarbeiter_id = m);
  return v_id;
end $$;
comment on function public.einsatz_speichern(uuid, uuid, uuid, timestamptz, timestamptz, uuid[], uuid, boolean, text) is
  'Einsatz zu einem Auftrag oder Ticket mit Team und Fahrzeug speichern (neu, wenn p_id leer). p_fest leer lässt den Stand.';

-- ---------------------------------------------------------------------------------------------------------------------
-- Konflikte: zusätzlich Werkstatttermin des Fahrzeugs (mitarbeiter_id leer, detail = Kennzeichen:Notiz)
-- ---------------------------------------------------------------------------------------------------------------------
create or replace function public.einsatz_konflikte(p_von timestamptz, p_bis timestamptz)
returns table (einsatz_id uuid, mitarbeiter_id uuid, art text, detail text)
language sql stable security invoker set search_path = '' as $$
  with em as (
    select e.id as einsatz_id, e.beginn, e.ende, m.mitarbeiter_id
      from public.einsatz e
      join public.einsatz_monteur m on m.einsatz_id = e.id
     where e.beginn < p_bis and e.ende > p_von
  )
  select a.einsatz_id, a.mitarbeiter_id, 'ueberschneidung', coalesce(au.nummer, st.nummer, 'Einsatz')
    from em a
    join public.einsatz b on b.id <> a.einsatz_id and b.beginn < a.ende and b.ende > a.beginn
    join public.einsatz_monteur bm on bm.einsatz_id = b.id and bm.mitarbeiter_id = a.mitarbeiter_id
    left join public.auftrag au on au.id = b.auftrag_id
    left join public.service_ticket st on st.id = b.ticket_id
  union all
  select a.einsatz_id, a.mitarbeiter_id, 'abwesend', w.art || ':' || w.status
    from em a
    join public.abwesenheit w on w.mitarbeiter_id = a.mitarbeiter_id and w.status in ('beantragt', 'genehmigt')
     and w.von <= (a.ende at time zone 'Europe/Berlin')::date
     and w.bis >= (a.beginn at time zone 'Europe/Berlin')::date
  union all
  select e.id, null::uuid, 'werkstatt', f.kennzeichen || ':' || coalesce(w.notiz, 'Werkstatt')
    from public.einsatz e
    join public.fahrzeug f on f.id = e.fahrzeug_id
    join public.fahrzeug_werkstatt w on w.fahrzeug_id = e.fahrzeug_id
     and w.von <= (e.ende at time zone 'Europe/Berlin')::date
     and w.bis >= (e.beginn at time zone 'Europe/Berlin')::date
   where e.beginn < p_bis and e.ende > p_von
$$;

revoke execute on function public.einsatz_speichern(uuid, uuid, uuid, timestamptz, timestamptz, uuid[], uuid, boolean, text) from public, anon;
grant execute on function public.einsatz_speichern(uuid, uuid, uuid, timestamptz, timestamptz, uuid[], uuid, boolean, text) to authenticated;

-- ---------------------------------------------------------------------------------------------------------------------
-- Fahrzeug löschen (Markierung) nur ohne künftige Einsätze
-- ---------------------------------------------------------------------------------------------------------------------
create function app.fahrzeug_loeschen_pruefen() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.deleted_at is null or old.deleted_at is not null then
    return new;
  end if;
  if exists (select 1 from public.einsatz where fahrzeug_id = old.id and deleted_at is null and ende >= now()) then
    raise exception 'Das Fahrzeug ist noch für künftige Einsätze eingeplant und kann deshalb nicht gelöscht werden.' using errcode = '23503';
  end if;
  return new;
end $$;
create trigger loeschen_pruefen before update on public.fahrzeug
  for each row execute function app.fahrzeug_loeschen_pruefen();

-- ---------------------------------------------------------------------------------------------------------------------
-- Termine (Beratung, Intern) mit Mitarbeitern in einem Schritt speichern bzw. als gelöscht markieren
-- ---------------------------------------------------------------------------------------------------------------------
create function public.termin_speichern(
  p_id uuid, p_titel text, p_art text, p_datum date, p_beginn time, p_ende time, p_mitarbeiter uuid[],
  p_kunde_id uuid, p_anfrage_id uuid, p_auftrag_id uuid, p_ort text, p_notiz text
) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  v_id uuid := p_id;
  r record;
begin
  if v_id is null then
    insert into public.termin (titel, art, datum, beginn, ende, kunde_id, anfrage_id, auftrag_id, ort, notiz)
    values (trim(p_titel), p_art, p_datum, p_beginn, p_ende, p_kunde_id, p_anfrage_id, p_auftrag_id, nullif(trim(p_ort), ''), nullif(trim(p_notiz), ''))
    returning id into v_id;
  else
    update public.termin
       set titel = trim(p_titel), art = p_art, datum = p_datum, beginn = p_beginn, ende = p_ende, kunde_id = p_kunde_id,
           anfrage_id = p_anfrage_id, auftrag_id = p_auftrag_id, ort = nullif(trim(p_ort), ''), notiz = nullif(trim(p_notiz), '')
     where id = v_id;
    if not found then
      raise exception 'Termin nicht gefunden' using errcode = 'P0002';
    end if;
  end if;
  for r in select id from public.termin_mitarbeiter where termin_id = v_id and not (mitarbeiter_id = any (coalesce(p_mitarbeiter, '{}'))) loop
    perform app.loeschen('termin_mitarbeiter', r.id);
  end loop;
  insert into public.termin_mitarbeiter (termin_id, mitarbeiter_id)
  select distinct v_id, m from unnest(coalesce(p_mitarbeiter, '{}')) as m
   where not exists (select 1 from public.termin_mitarbeiter x where x.termin_id = v_id and x.mitarbeiter_id = m);
  return v_id;
end $$;

create function public.termin_loeschen(p_id uuid) returns void
language plpgsql security invoker set search_path = '' as $$
declare
  r record;
begin
  for r in select id from public.termin_mitarbeiter where termin_id = p_id loop
    perform app.loeschen('termin_mitarbeiter', r.id);
  end loop;
  perform app.loeschen('termin', p_id);
end $$;

alter table public.termin add constraint termin_titel_check check (length(trim(titel)) > 0);

revoke execute on function public.termin_speichern(uuid, text, text, date, time, time, uuid[], uuid, uuid, uuid, text, text),
  public.termin_loeschen(uuid) from public, anon;
grant execute on function public.termin_speichern(uuid, text, text, date, time, time, uuid[], uuid, uuid, uuid, text, text),
  public.termin_loeschen(uuid) to authenticated;
