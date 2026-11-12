-- Datenübernahme: import_stand = Zeitpunkt, zu dem der Import die Zeile zuletzt geschrieben hat (gleich updated_at in
-- derselben Transaktion). Ein erneuter Lauf überschreibt nur Zeilen mit updated_at = import_stand, also nichts, was
-- danach in der App oder vom Server (z. B. Zahlungsabgleich) geändert wurde.
do $$
declare t text;
begin
  foreach t in array array['kunde', 'kunde_lieferadresse', 'anfrage', 'auftrag', 'aufgabe', 'bestellung', 'bestellzeile', 'ablage_ordner', 'beleg'] loop
    execute format('alter table public.%I add column import_stand timestamptz', t);
  end loop;
end $$;

create or replace function app.import_felder_schutz()
returns trigger
language plpgsql
set search_path to ''
as $$
declare
  v jsonb;
  v_alt jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) else '{}'::jsonb end;
begin
  if auth.uid() is null then
    return new;
  end if;
  v := jsonb_build_object('airtable_id', v_alt -> 'airtable_id', 'import_stand', v_alt -> 'import_stand');
  if tg_table_name in ('kunde', 'beleg', 'ablage_ordner') then
    v := v || jsonb_build_object('altbestand', coalesce(v_alt -> 'altbestand', 'false'::jsonb));
  end if;
  if tg_table_name = 'beleg' then
    v := v || jsonb_build_object('lexware_link', v_alt -> 'lexware_link');
  end if;
  new := jsonb_populate_record(new, v);
  return new;
end $$;
