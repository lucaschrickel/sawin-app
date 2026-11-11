-- Plantafel fertig (CLAUDE.md „Montagepläne“): Kolonnen und weitere Ressourcen als Zeilen, Farbe je Einsatz,
-- Sammelfreigabe, Reihenfolge der Gruppen. Rechte wie bisher: alle Benutzer (RLS über security invoker).

-- Reihenfolge der Gruppen in beiden Plänen, für alle Benutzer: 'kolonne:<id>', 'solo' (Ohne Kolonne), 'res' (Weitere Ressourcen)
alter table public.einstellung add column plantafel_gruppen text[];
comment on column public.einstellung.plantafel_gruppen is 'Reihenfolge der Gruppen in der Plantafel (kolonne:<id>, solo, res)';

-- ---------------------------------------------------------------------------------------------------------------------
-- Einsatz speichern: zusätzlich weitere Ressource und Farbe. Ohne Monteur nur mit Ressource (z. B. Selbstabholer).
-- ---------------------------------------------------------------------------------------------------------------------
drop function public.einsatz_speichern(uuid, uuid, uuid, timestamptz, timestamptz, uuid[], uuid, boolean, text);
create function public.einsatz_speichern(
  p_id uuid, p_auftrag_id uuid, p_ticket_id uuid, p_beginn timestamptz, p_ende timestamptz, p_monteure uuid[],
  p_fahrzeug_id uuid, p_fest boolean, p_hinweis text, p_ressource_id uuid default null, p_farbe text default null
) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  v_id uuid := p_id;
  r record;
begin
  if num_nonnulls(p_auftrag_id, p_ticket_id) <> 1 then
    raise exception 'Bitte einen Auftrag oder ein Service-Ticket wählen.' using errcode = '23502';
  end if;
  if coalesce(cardinality(p_monteure), 0) = 0 and p_ressource_id is null then
    raise exception 'Bitte mindestens einen Monteur oder eine weitere Ressource wählen.' using errcode = '23514';
  end if;
  if p_ende <= p_beginn then
    raise exception 'Das Ende muss nach dem Beginn liegen.' using errcode = '23514';
  end if;
  if p_farbe is not null and p_farbe !~ '^plan-([1-9]|10)$' and p_farbe !~ '^#[0-9A-Fa-f]{6}$' then
    raise exception 'Ungültige Farbe.' using errcode = '23514';
  end if;
  if exists (select 1 from unnest(coalesce(p_monteure, '{}')) m
              where not exists (select 1 from public.mitarbeiter x where x.id = m and x.ist_monteur and x.deleted_at is null)) then
    raise exception 'Nur Monteure können in Einsätzen stehen.' using errcode = '23514';
  end if;

  if v_id is null then
    insert into public.einsatz (auftrag_id, ticket_id, beginn, ende, fahrzeug_id, ressource_id, fest, farbe, hinweis)
    values (p_auftrag_id, p_ticket_id, p_beginn, p_ende, p_fahrzeug_id, p_ressource_id, coalesce(p_fest, false), p_farbe,
            nullif(trim(p_hinweis), ''))
    returning id into v_id;
  else
    update public.einsatz
       set auftrag_id = p_auftrag_id, ticket_id = p_ticket_id, beginn = p_beginn, ende = p_ende, fahrzeug_id = p_fahrzeug_id,
           ressource_id = p_ressource_id, fest = coalesce(p_fest, fest), farbe = p_farbe, hinweis = nullif(trim(p_hinweis), '')
     where id = v_id;
    if not found then
      raise exception 'Einsatz nicht gefunden' using errcode = 'P0002';
    end if;
  end if;

  for r in select id from public.einsatz_monteur where einsatz_id = v_id and not (mitarbeiter_id = any (coalesce(p_monteure, '{}'))) loop
    perform app.loeschen('einsatz_monteur', r.id);
  end loop;
  insert into public.einsatz_monteur (einsatz_id, mitarbeiter_id)
  select distinct v_id, m from unnest(coalesce(p_monteure, '{}')) as m
   where not exists (select 1 from public.einsatz_monteur x where x.einsatz_id = v_id and x.mitarbeiter_id = m);
  return v_id;
end $$;
comment on function public.einsatz_speichern(uuid, uuid, uuid, timestamptz, timestamptz, uuid[], uuid, boolean, text, uuid, text) is
  'Einsatz anlegen oder ändern (Team, Fahrzeug, weitere Ressource, Farbe); entfernte Monteure nur als Markierung';
revoke execute on function public.einsatz_speichern(uuid, uuid, uuid, timestamptz, timestamptz, uuid[], uuid, boolean, text, uuid, text) from public, anon;
grant execute on function public.einsatz_speichern(uuid, uuid, uuid, timestamptz, timestamptz, uuid[], uuid, boolean, text, uuid, text) to authenticated;

-- ---------------------------------------------------------------------------------------------------------------------
-- Sammelfreigabe: mehrere vorgeplante Einsätze auf einmal fest einplanen. Gibt die Anzahl der freigegebenen zurück.
-- ---------------------------------------------------------------------------------------------------------------------
create function public.einsatz_freigeben(p_ids uuid[]) returns integer
language plpgsql security invoker set search_path = '' as $$
declare
  v_anzahl integer;
begin
  update public.einsatz set fest = true where id = any (p_ids) and not fest and deleted_at is null;
  get diagnostics v_anzahl = row_count;
  return v_anzahl;
end $$;
comment on function public.einsatz_freigeben(uuid[]) is 'Vorgeplante Einsätze freigeben (fest einplanen)';
revoke execute on function public.einsatz_freigeben(uuid[]) from public, anon;
grant execute on function public.einsatz_freigeben(uuid[]) to authenticated;

-- ---------------------------------------------------------------------------------------------------------------------
-- Kolonne anlegen oder ändern: Name, Stammfahrzeug, Mitglieder in Reihenfolge. Entfernte Mitglieder nur als Markierung.
-- Änderungen gelten dauerhaft; geplante Einsätze behalten ihr Team.
-- ---------------------------------------------------------------------------------------------------------------------
create function public.kolonne_speichern(p_id uuid, p_name text, p_stammfahrzeug_id uuid, p_mitglieder uuid[]) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  v_id uuid := p_id;
  r record;
  i integer;
begin
  if coalesce(trim(p_name), '') = '' then
    raise exception 'Bitte einen Namen eingeben.' using errcode = '23514';
  end if;
  if exists (select 1 from unnest(coalesce(p_mitglieder, '{}')) m
              where not exists (select 1 from public.mitarbeiter x where x.id = m and x.ist_monteur and x.deleted_at is null)) then
    raise exception 'Nur Monteure können Mitglied einer Kolonne sein.' using errcode = '23514';
  end if;
  if v_id is null then
    insert into public.kolonne (name, stammfahrzeug_id, reihenfolge)
    values (trim(p_name), p_stammfahrzeug_id, coalesce((select max(reihenfolge) + 1 from public.kolonne where deleted_at is null), 0))
    returning id into v_id;
  else
    update public.kolonne set name = trim(p_name), stammfahrzeug_id = p_stammfahrzeug_id where id = v_id and deleted_at is null;
    if not found then
      raise exception 'Kolonne nicht gefunden' using errcode = 'P0002';
    end if;
  end if;
  for r in select id from public.kolonne_mitglied where kolonne_id = v_id and deleted_at is null
            and not (mitarbeiter_id = any (coalesce(p_mitglieder, '{}'))) loop
    perform app.loeschen('kolonne_mitglied', r.id);
  end loop;
  for i in 1 .. coalesce(cardinality(p_mitglieder), 0) loop
    update public.kolonne_mitglied set reihenfolge = i
     where kolonne_id = v_id and mitarbeiter_id = p_mitglieder[i] and deleted_at is null and reihenfolge <> i;
    if not exists (select 1 from public.kolonne_mitglied where kolonne_id = v_id and mitarbeiter_id = p_mitglieder[i] and deleted_at is null) then
      insert into public.kolonne_mitglied (kolonne_id, mitarbeiter_id, reihenfolge) values (v_id, p_mitglieder[i], i);
    end if;
  end loop;
  return v_id;
end $$;
comment on function public.kolonne_speichern(uuid, text, uuid, uuid[]) is 'Kolonne mit Stammfahrzeug und Mitgliedern speichern';

-- Monteur zwischen Kolonnen verschieben, in eine weitere duplizieren, entfernen oder innerhalb sortieren.
-- p_von/p_nach null = „Ohne Kolonne“; p_vor = Mitglied, vor das er rückt (null = ans Ende).
create function public.kolonne_monteur(p_mitarbeiter uuid, p_von uuid, p_nach uuid, p_kopieren boolean, p_vor uuid) returns void
language plpgsql security invoker set search_path = '' as $$
declare
  v_liste uuid[];
  v_name text;
  v_pos integer;
begin
  if not exists (select 1 from public.mitarbeiter where id = p_mitarbeiter and ist_monteur and deleted_at is null) then
    raise exception 'Nur Monteure können Mitglied einer Kolonne sein.' using errcode = '23514';
  end if;
  if p_nach is not null then
    select array_agg(mitarbeiter_id order by reihenfolge, created_at) into v_liste
      from public.kolonne_mitglied where kolonne_id = p_nach and deleted_at is null;
    v_liste := coalesce(v_liste, '{}');
    if p_mitarbeiter = any (v_liste) and p_von is distinct from p_nach then
      select name into v_name from public.kolonne where id = p_nach;
      raise exception 'Der Monteur ist schon in %.', v_name using errcode = '23505';
    end if;
    v_liste := array_remove(v_liste, p_mitarbeiter);
    v_pos := array_position(v_liste, p_vor);
    v_liste := case when v_pos is null then v_liste || p_mitarbeiter
                    else v_liste[1:v_pos - 1] || p_mitarbeiter || v_liste[v_pos:] end;
    perform public.kolonne_speichern(k.id, k.name, k.stammfahrzeug_id, v_liste) from public.kolonne k where k.id = p_nach and k.deleted_at is null;
    if not found then
      raise exception 'Kolonne nicht gefunden' using errcode = 'P0002';
    end if;
  end if;
  -- verschieben (nicht kopieren) bzw. „Ohne Kolonne“: aus der bisherigen Kolonne entfernen
  if p_von is not null and p_von is distinct from p_nach and not coalesce(p_kopieren, false) then
    perform app.loeschen('kolonne_mitglied', m.id)
       from public.kolonne_mitglied m where m.kolonne_id = p_von and m.mitarbeiter_id = p_mitarbeiter and m.deleted_at is null;
  end if;
end $$;
comment on function public.kolonne_monteur(uuid, uuid, uuid, boolean, uuid) is 'Monteur in Kolonnen verschieben, duplizieren, entfernen oder sortieren';

-- Kolonne löschen (Markierung, samt Mitgliedschaften); geplante Einsätze behalten ihr Team
create function public.kolonne_loeschen(p_id uuid) returns void
language plpgsql security invoker set search_path = '' as $$
declare
  r record;
begin
  for r in select id from public.kolonne_mitglied where kolonne_id = p_id and deleted_at is null loop
    perform app.loeschen('kolonne_mitglied', r.id);
  end loop;
  perform app.loeschen('kolonne', p_id);
end $$;
comment on function public.kolonne_loeschen(uuid) is 'Kolonne als gelöscht markieren';

-- Weitere Ressource löschen (Markierung): nur ohne künftige Einsätze
create function public.ressource_loeschen(p_id uuid) returns void
language plpgsql security invoker set search_path = '' as $$
begin
  if exists (select 1 from public.einsatz where ressource_id = p_id and deleted_at is null and ende > now()) then
    raise exception 'Die Zeile hat noch geplante Einsätze. Bitte diese zuerst verschieben.' using errcode = '23514';
  end if;
  perform app.loeschen('ressource', p_id);
end $$;
comment on function public.ressource_loeschen(uuid) is 'Weitere Ressource als gelöscht markieren (nur ohne künftige Einsätze)';

revoke execute on function public.kolonne_speichern(uuid, text, uuid, uuid[]), public.kolonne_monteur(uuid, uuid, uuid, boolean, uuid),
  public.kolonne_loeschen(uuid), public.ressource_loeschen(uuid) from public, anon;
grant execute on function public.kolonne_speichern(uuid, text, uuid, uuid[]), public.kolonne_monteur(uuid, uuid, uuid, boolean, uuid),
  public.kolonne_loeschen(uuid), public.ressource_loeschen(uuid) to authenticated;
