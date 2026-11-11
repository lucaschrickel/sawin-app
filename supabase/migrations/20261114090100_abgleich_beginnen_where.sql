-- Korrektur: lexware_abgleich_beginnen schlug immer fehl („UPDATE requires a WHERE clause“, Erweiterung safeupdate),
-- dadurch lief der Zahlungsabgleich beim Öffnen der Seiten nie. Die Tabelle einstellung hat genau eine Zeile.
create or replace function public.lexware_abgleich_beginnen(p_abstand interval) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_vorher timestamptz;
begin
  select lexware_zahlung_abgleich_am into v_vorher from public.einstellung for update;
  if v_vorher is not null and v_vorher > now() - p_abstand then
    return jsonb_build_object('starten', false);
  end if;
  update public.einstellung set lexware_zahlung_abgleich_am = now() where true;
  return jsonb_build_object('starten', true, 'vorher', v_vorher);
end $$;
