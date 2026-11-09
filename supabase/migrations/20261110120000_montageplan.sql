-- =====================================================================================================================
-- Modul Montageplan (erster Schritt): Einsätze mit Team speichern und löschen, Konfliktprüfung, Arbeitszeit in Stunden
-- Alle Funktionen SECURITY INVOKER: RLS, Audit-Log und die Trigger der Tabellen gelten für den Benutzer.
-- =====================================================================================================================

-- Das Stundenraster der Plantafel folgt der Arbeitszeit; deshalb nur volle Stunden
alter table public.einstellung add constraint einstellung_arbeitszeit_volle_stunden
  check (extract(minute from arbeitszeit_von) = 0 and extract(minute from arbeitszeit_bis) = 0);

-- ---------------------------------------------------------------------------------------------------------------------
-- Einsatz anlegen oder ändern, samt Monteuren, in einem Schritt. Entfernte Monteure werden nur als gelöscht markiert.
-- ---------------------------------------------------------------------------------------------------------------------
create function public.einsatz_speichern(
  p_id uuid, p_auftrag_id uuid, p_beginn timestamptz, p_ende timestamptz, p_monteure uuid[], p_fest boolean, p_hinweis text
) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  v_id uuid := p_id;
  r record;
begin
  if p_auftrag_id is null then
    raise exception 'Bitte einen Auftrag wählen.' using errcode = '23502';
  end if;
  if coalesce(cardinality(p_monteure), 0) = 0 then
    raise exception 'Bitte mindestens einen Monteur wählen.' using errcode = '23514';
  end if;
  if p_ende <= p_beginn then
    raise exception 'Das Ende muss nach dem Beginn liegen.' using errcode = '23514';
  end if;

  if v_id is null then
    insert into public.einsatz (auftrag_id, beginn, ende, fest, hinweis)
    values (p_auftrag_id, p_beginn, p_ende, coalesce(p_fest, false), nullif(trim(p_hinweis), ''))
    returning id into v_id;
  else
    update public.einsatz
       set auftrag_id = p_auftrag_id, beginn = p_beginn, ende = p_ende, fest = coalesce(p_fest, fest),
           hinweis = nullif(trim(p_hinweis), '')
     where id = v_id and ticket_id is null;
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
comment on function public.einsatz_speichern(uuid, uuid, timestamptz, timestamptz, uuid[], boolean, text) is
  'Einsatz zu einem Auftrag mit Team speichern (neu, wenn p_id leer). p_fest = freigegeben; leer lässt den Stand.';

-- Einsatz samt Team als gelöscht markieren
create function public.einsatz_loeschen(p_id uuid) returns void
language plpgsql security invoker set search_path = '' as $$
declare
  r record;
begin
  for r in select id from public.einsatz_monteur where einsatz_id = p_id loop
    perform app.loeschen('einsatz_monteur', r.id);
  end loop;
  perform app.loeschen('einsatz', p_id);
end $$;
comment on function public.einsatz_loeschen(uuid) is 'Löscht einen Einsatz und seine Monteur-Zuordnungen als Markierung';

-- ---------------------------------------------------------------------------------------------------------------------
-- Konflikte im Zeitraum: Monteur gleichzeitig in einem anderen Einsatz oder abwesend (beantragt oder genehmigt).
-- Die Warnung blockiert nicht (CLAUDE.md). Abwesenheiten gelten ganztägig nach deutscher Ortszeit.
-- ---------------------------------------------------------------------------------------------------------------------
create function public.einsatz_konflikte(p_von timestamptz, p_bis timestamptz)
returns table (einsatz_id uuid, mitarbeiter_id uuid, art text, detail text)
language sql stable security invoker set search_path = '' as $$
  with em as (
    select e.id as einsatz_id, e.beginn, e.ende, m.mitarbeiter_id
      from public.einsatz e
      join public.einsatz_monteur m on m.einsatz_id = e.id
     where e.beginn < p_bis and e.ende > p_von
  )
  select a.einsatz_id, a.mitarbeiter_id, 'ueberschneidung', coalesce(au.nummer, 'Einsatz')
    from em a
    join public.einsatz b on b.id <> a.einsatz_id and b.beginn < a.ende and b.ende > a.beginn
    join public.einsatz_monteur bm on bm.einsatz_id = b.id and bm.mitarbeiter_id = a.mitarbeiter_id
    left join public.auftrag au on au.id = b.auftrag_id
  union all
  select a.einsatz_id, a.mitarbeiter_id, 'abwesend', w.art || ':' || w.status
    from em a
    join public.abwesenheit w on w.mitarbeiter_id = a.mitarbeiter_id and w.status in ('beantragt', 'genehmigt')
     and w.von <= (a.ende at time zone 'Europe/Berlin')::date
     and w.bis >= (a.beginn at time zone 'Europe/Berlin')::date
$$;
comment on function public.einsatz_konflikte(timestamptz, timestamptz) is
  'Konflikte der Einsätze im Zeitraum: art ueberschneidung (detail = Nummer des anderen Auftrags) oder abwesend (detail = art:status)';

revoke execute on function public.einsatz_speichern(uuid, uuid, timestamptz, timestamptz, uuid[], boolean, text),
  public.einsatz_loeschen(uuid), public.einsatz_konflikte(timestamptz, timestamptz) from public, anon;
grant execute on function public.einsatz_speichern(uuid, uuid, timestamptz, timestamptz, uuid[], boolean, text),
  public.einsatz_loeschen(uuid), public.einsatz_konflikte(timestamptz, timestamptz) to authenticated;
