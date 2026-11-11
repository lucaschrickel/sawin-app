-- aufmass_speichern mit den Rechten des Benutzers (SECURITY INVOKER, RLS gilt) statt SECURITY DEFINER (Advisor 0029).
-- Entfernte Zeilen markiert app.loeschen (die Lese-Policy blendet gelöschte Zeilen aus, ein direktes UPDATE scheitert).
create or replace function public.aufmass_speichern(p_id uuid, p_datum date, p_hinweise text, p_zeilen jsonb) returns timestamptz
language plpgsql security invoker set search_path = '' as $$
declare
  v_ids uuid[];
  v_weg uuid;
  z jsonb;
  i integer := 0;
  v_breite integer;
  v_hoehe integer;
  v_anzahl integer;
begin
  if not app.ist_benutzer() then
    raise exception 'Keine Berechtigung' using errcode = '42501';
  end if;
  if not exists (select 1 from public.formular where id = p_id and typ = 'aufmass') then
    raise exception 'Aufmaß nicht gefunden.' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.formular where id = p_id and status = 'entwurf') then
    raise exception 'Das Aufmaß ist abgeschlossen. Bitte zuerst „Wieder öffnen“.' using errcode = 'P0001';
  end if;
  if jsonb_typeof(p_zeilen) <> 'array' or jsonb_array_length(p_zeilen) > 500 then
    raise exception 'Ungültige Zeilen.' using errcode = '22023';
  end if;

  update public.formular
     set datum = coalesce(p_datum, datum), hinweise = nullif(left(trim(coalesce(p_hinweise, '')), 4000), '')
   where id = p_id
     and (datum, hinweise) is distinct from (coalesce(p_datum, datum), nullif(left(trim(coalesce(p_hinweise, '')), 4000), ''));

  select coalesce(array_agg((x ->> 'id')::uuid), '{}') into v_ids from jsonb_array_elements(p_zeilen) x;
  for v_weg in select id from public.aufmass_zeile where formular_id = p_id and not (id = any (v_ids)) loop
    perform app.loeschen('aufmass_zeile', v_weg);
  end loop;

  for z in select * from jsonb_array_elements(p_zeilen) loop
    i := i + 1;
    v_breite := case when (z ->> 'breite_mm') ~ '^\d{1,6}$' and (z ->> 'breite_mm')::integer > 0 then (z ->> 'breite_mm')::integer end;
    v_hoehe := case when (z ->> 'hoehe_mm') ~ '^\d{1,6}$' and (z ->> 'hoehe_mm')::integer > 0 then (z ->> 'hoehe_mm')::integer end;
    v_anzahl := case when (z ->> 'anzahl') ~ '^\d{1,5}$' and (z ->> 'anzahl')::integer > 0 then (z ->> 'anzahl')::integer else 1 end;
    insert into public.aufmass_zeile as a (id, formular_id, reihenfolge, raum, element, breite_mm, hoehe_mm, anzahl, anschlag, bemerkung)
    values ((z ->> 'id')::uuid, p_id, i,
            nullif(left(trim(coalesce(z ->> 'raum', '')), 200), ''),
            nullif(left(trim(coalesce(z ->> 'element', '')), 200), ''),
            v_breite, v_hoehe, v_anzahl,
            nullif(left(trim(coalesce(z ->> 'anschlag', '')), 100), ''),
            nullif(left(trim(coalesce(z ->> 'bemerkung', '')), 1000), ''))
    on conflict (id) do update set
      reihenfolge = excluded.reihenfolge, raum = excluded.raum, element = excluded.element, breite_mm = excluded.breite_mm,
      hoehe_mm = excluded.hoehe_mm, anzahl = excluded.anzahl, anschlag = excluded.anschlag, bemerkung = excluded.bemerkung
     where a.formular_id = p_id
       and (a.reihenfolge, a.raum, a.element, a.breite_mm, a.hoehe_mm, a.anzahl, a.anschlag, a.bemerkung)
           is distinct from (excluded.reihenfolge, excluded.raum, excluded.element, excluded.breite_mm, excluded.hoehe_mm,
                             excluded.anzahl, excluded.anschlag, excluded.bemerkung);
  end loop;
  return now();
end $$;
