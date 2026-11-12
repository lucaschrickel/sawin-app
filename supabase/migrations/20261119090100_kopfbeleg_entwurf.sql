-- Kopfbeleg (übernommen, ohne Positionen) ist nur gesperrt, wenn er fertiggestellt ist; ein übernommener Entwurf
-- wird in der App fertig erfasst.
create or replace function app.beleg_bearbeitbar(p_beleg_id uuid)
returns boolean
language sql
stable security definer
set search_path to ''
as $$
  select b.status = 'entwurf'
      or ((b.art = 'angebot' and not exists (
            select 1 from public.beleg f
             where f.vorgaenger_id = b.id and f.art = 'auftragsbestaetigung' and f.deleted_at is null))
       or (b.art = 'auftragsbestaetigung' and not exists (
            select 1 from public.beleg f
             where f.kette_id = b.kette_id and f.id <> b.id and f.deleted_at is null and f.status <> 'entwurf'
               and f.art in ('teil_ab', 'lieferschein', 'abschlagsrechnung', 'rechnung'))))
     and not (b.altbestand and not exists (
            select 1 from public.beleg_position p where p.beleg_id = b.id and p.deleted_at is null))
    from public.beleg b
   where b.id = p_beleg_id
$$;
