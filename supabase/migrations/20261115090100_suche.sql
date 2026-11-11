-- Globale Suche in der Kopfzeile (CLAUDE.md „Suche“): Kunden, Anfragen, Aufträge, Belege (auch Positionen, Tags,
-- Kommentar), Service-Tickets. Läuft mit den Rechten des Benutzers (security invoker, RLS gilt, gelöschte Zeilen
-- blendet RLS aus). Konditionen werden nie durchsucht. Je Bereich höchstens p_je_bereich Treffer, Nummern zuerst.
-- fundstelle/fundtext nennen, wo der Begriff steht (z. B. „Position“ und deren Titel).

create function public.suche(p_q text, p_je_bereich integer default 3)
returns table (bereich text, id uuid, nummer text, titel text, details text, art text, betrag numeric, status text, fundstelle text, fundtext text)
language plpgsql stable security invoker set search_path = '' as $$
declare
  v text;
  v_n integer := least(greatest(coalesce(p_je_bereich, 3), 1), 50);
begin
  if length(trim(coalesce(p_q, ''))) < 2 then
    return;
  end if;
  v := '%' || replace(replace(replace(trim(p_q), '\', '\\'), '%', '\%'), '_', '\_') || '%';

  return query
  (select 'kunde'::text, k.id, k.nummer, k.name,
          concat_ws(', ', nullif(k.ansprechpartner, ''), nullif(concat_ws(' ', k.strasse, k.plz, k.ort), '')),
          null::text, null::numeric, null::text,
          case when k.nummer ilike v then 'Nummer' when k.name ilike v then 'Name'
               when k.ansprechpartner ilike v then 'Ansprechpartner' when concat_ws(' ', k.strasse, k.plz, k.ort) ilike v then 'Adresse'
               when k.telefon ilike v then 'Telefon' when k.email ilike v then 'E-Mail' when la.text is not null then 'Lieferadresse'
               else 'Notiz' end,
          case when k.nummer ilike v or k.name ilike v then null when k.ansprechpartner ilike v then k.ansprechpartner
               when concat_ws(' ', k.strasse, k.plz, k.ort) ilike v then concat_ws(' ', k.strasse, k.plz, k.ort)
               when k.telefon ilike v then k.telefon when k.email ilike v then k.email when la.text is not null then la.text
               else left(k.notiz, 160) end
     from public.kunde k
     left join lateral (select concat_ws(' ', l.bezeichnung, l.strasse, l.plz, l.ort) as text from public.kunde_lieferadresse l
                         where l.kunde_id = k.id and concat_ws(' ', l.bezeichnung, l.strasse, l.plz, l.ort) ilike v limit 1) la on true
    where k.nummer ilike v or k.name ilike v or k.ansprechpartner ilike v or concat_ws(' ', k.strasse, k.plz, k.ort) ilike v
       or k.telefon ilike v or k.email ilike v or k.notiz ilike v or la.text is not null
    order by (k.nummer ilike v or k.name ilike v) desc, k.name
    limit v_n)
  union all
  (select 'anfrage'::text, a.id, a.nummer, a.titel, concat_ws(' · ', ku.name, nullif(a.objekt, '')),
          null::text, a.geschaetzter_wert, coalesce(a.archiv, a.status),
          case when a.nummer ilike v then 'Nummer' when a.titel ilike v then 'Titel' when ku.name ilike v then 'Kunde'
               when a.objekt ilike v then 'Objekt' when a.beschreibung ilike v then 'Beschreibung' else 'Notiz' end,
          case when a.nummer ilike v or a.titel ilike v or ku.name ilike v then null when a.objekt ilike v then a.objekt
               when a.beschreibung ilike v then left(a.beschreibung, 160) else left(a.notiz, 160) end
     from public.anfrage a left join public.kunde ku on ku.id = a.kunde_id
    where a.nummer ilike v or a.titel ilike v or ku.name ilike v or a.objekt ilike v or a.beschreibung ilike v or a.notiz ilike v
    order by (a.nummer ilike v) desc, a.eingang desc
    limit v_n)
  union all
  (select 'auftrag'::text, au.id, au.nummer, au.titel, concat_ws(' · ', ku.name, nullif(au.objekt, '')),
          null::text, null::numeric, au.phase,
          case when au.nummer ilike v then 'Nummer' when au.titel ilike v then 'Titel' when ku.name ilike v then 'Kunde'
               when au.objekt ilike v then 'Objekt' else 'Bemerkung' end,
          case when au.nummer ilike v or au.titel ilike v or ku.name ilike v then null when au.objekt ilike v then au.objekt
               else left(au.bemerkung, 160) end
     from public.auftrag au left join public.kunde ku on ku.id = au.kunde_id
    where au.nummer ilike v or au.titel ilike v or ku.name ilike v or au.objekt ilike v or au.bemerkung ilike v
    order by (au.nummer ilike v) desc, au.nummer desc
    limit v_n)
  union all
  (select 'beleg'::text, b.id, b.nummer, coalesce(nullif(b.titel, ''), b.art),
          concat_ws(' · ', coalesce(ku.name, b.adresse_name), nullif(b.bauvorhaben, ''), nullif(b.objekt, '')),
          b.art, b.summe_brutto, b.status,
          case when b.nummer ilike v then 'Nummer' when b.titel ilike v then 'Titel' when coalesce(ku.name, b.adresse_name) ilike v then 'Kunde'
               when b.bauvorhaben ilike v then 'Bauvorhaben' when b.objekt ilike v then 'Objekt'
               when exists (select 1 from unnest(b.tags) t where t ilike v) then 'Tag'
               when b.kommentar_intern ilike v then 'Kommentar' else 'Position' end,
          case when b.nummer ilike v or b.titel ilike v or coalesce(ku.name, b.adresse_name) ilike v then null
               when b.bauvorhaben ilike v then b.bauvorhaben when b.objekt ilike v then b.objekt
               when exists (select 1 from unnest(b.tags) t where t ilike v) then (select t from unnest(b.tags) t where t ilike v limit 1)
               when b.kommentar_intern ilike v then left(b.kommentar_intern, 160) else pos.text end
     from public.beleg b
     left join public.kunde ku on ku.id = b.kunde_id
     left join lateral (select concat_ws(': ', p.titel, nullif(left(regexp_replace(coalesce(p.beschreibung_html, ''), '<[^>]+>', ' ', 'g'), 120), '')) as text
                          from public.beleg_position p
                         where p.beleg_id = b.id and (p.titel ilike v or regexp_replace(coalesce(p.beschreibung_html, ''), '<[^>]+>', ' ', 'g') ilike v)
                         order by p.reihenfolge limit 1) pos on true
    where b.nummer ilike v or b.titel ilike v or coalesce(ku.name, b.adresse_name) ilike v or b.bauvorhaben ilike v or b.objekt ilike v
       or exists (select 1 from unnest(b.tags) t where t ilike v) or b.kommentar_intern ilike v or pos.text is not null
    order by (b.nummer ilike v) desc, b.datum desc
    limit v_n)
  union all
  (select 'ticket'::text, t.id, t.nummer, t.thema, concat_ws(' · ', ku.name, nullif(t.objekt, '')),
          t.art, null::numeric, t.status,
          case when t.nummer ilike v then 'Nummer' when t.thema ilike v then 'Thema' when ku.name ilike v then 'Kunde'
               when t.objekt ilike v then 'Objekt' else 'Problem' end,
          case when t.nummer ilike v or t.thema ilike v or ku.name ilike v then null when t.objekt ilike v then t.objekt
               else left(t.problem, 160) end
     from public.service_ticket t left join public.kunde ku on ku.id = t.kunde_id
    where t.nummer ilike v or t.thema ilike v or ku.name ilike v or t.objekt ilike v or t.problem ilike v
    order by (t.nummer ilike v) desc, t.nummer desc
    limit v_n);
end $$;
comment on function public.suche(text, integer) is 'Globale Suche (Kunden, Anfragen, Aufträge, Belege, Tickets) mit den Rechten des Benutzers';
revoke execute on function public.suche(text, integer) from public, anon;
grant execute on function public.suche(text, integer) to authenticated;
