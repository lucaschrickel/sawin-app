-- Startwerte der Nummernkreise für den Go-live (Entscheidung 12.11.2026, geprüft gegen Sawins Lexware: dort als
-- Nächstes AG1260510, AB2260237, LS0012, Kunde 10875). Die App vergibt ab einem eigenen, deutlich höheren Bereich,
-- damit sich App- und Lexware-Nummern nie überschneiden:
--   Angebot AG1261000, Auftragsbestätigung AB2261000, Lieferschein LS1000 (vierstellig, ohne Jahr wie in Lexware),
--   Kunden ab 30000. Rechnungen, Abschläge und Gutschriften nummeriert weiterhin Lexware.
-- start = erste laufende Nummer; naechste_nummer vergibt nie weniger. Bei jährlichen Kreisen gilt start nur im Jahr
-- start_jahr (ab dem Folgejahr beginnt der Kreis wieder bei 1, z. B. AG1270001). Gilt in Staging und Produktion; auch
-- „Staging leeren“ und die Datenübernahme setzen den Kreis nie unter den Startwert.

alter table public.nummernkreis
  add column start integer check (start >= 1),
  add column start_jahr integer check (start_jahr between 2000 and 2100);
comment on column public.nummernkreis.start is 'Erste laufende Nummer (Go-live); naechste_nummer vergibt nie weniger';
comment on column public.nummernkreis.start_jahr is 'Jährliche Kreise: Jahr, in dem start gilt';

update public.nummernkreis set start = 1000, start_jahr = 2026 where art in ('angebot', 'auftragsbestaetigung') and deleted_at is null;
update public.nummernkreis set muster = 'LS{NNNN}', jaehrlich = false, start = 1000, start_jahr = null where art = 'lieferschein' and deleted_at is null;
update public.nummernkreis set start = 30000 where art = 'kunde' and deleted_at is null;

create or replace function app.naechste_nummer(p_art text)
returns text
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_kreis public.nummernkreis;
  v_jahr integer := extract(year from (now() at time zone 'Europe/Berlin'))::integer;
  v_nr integer;
  v_stellen integer;
  v_text text;
begin
  if auth.uid() is not null and not app.ist_benutzer() then
    raise exception 'Keine Berechtigung' using errcode = '42501';
  end if;
  select * into v_kreis from public.nummernkreis where art = p_art and deleted_at is null for update;
  if not found then
    raise exception 'Kein Nummernkreis für %', p_art;
  end if;
  v_nr := case when v_kreis.jaehrlich and v_kreis.jahr <> v_jahr then 1 else v_kreis.letzte + 1 end;
  if v_kreis.start is not null and (not v_kreis.jaehrlich or v_kreis.start_jahr = v_jahr) then
    v_nr := greatest(v_nr, v_kreis.start);
  end if;
  update public.nummernkreis set letzte = v_nr, jahr = v_jahr where id = v_kreis.id;
  v_text := replace(v_kreis.muster, '{JJ}', lpad((v_jahr % 100)::text, 2, '0'));
  v_stellen := length((regexp_match(v_text, '\{(N+)\}'))[1]);
  return regexp_replace(v_text, '\{N+\}', lpad(v_nr::text, greatest(v_stellen, length(v_nr::text)), '0'));
end $$;
