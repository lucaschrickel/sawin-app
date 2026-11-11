-- Direkter Upload vom Browser in den Zwischenspeicher (Vercel nimmt in Serverfunktionen nur kleine Anfragen an):
-- Status „upload“, solange der Server die Datei noch nicht geprüft hat (wird nie automatisch übertragen);
-- abgelehnte Dateien werden nur als gelöscht markiert.
alter table public.ablage_datei drop constraint ablage_datei_status_check;
alter table public.ablage_datei add constraint ablage_datei_status_check check (status in ('upload', 'wartet', 'abgelegt', 'fehler'));

create or replace function public.ablage_datei_setzen(p_benutzer uuid, p_id uuid, p_daten jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := p_id;
begin
  perform set_config('app.im_namen_von', coalesce(p_benutzer::text, ''), true);
  if v_id is null then
    insert into public.ablage_datei (ordner_id, unterordner, name, quelle, beleg_id, version, mime, groesse, drive_id, item_id, web_url,
                                     status, puffer_pfad, versuche, fehler, abgelegt_am)
    values ((p_daten ->> 'ordner_id')::uuid, p_daten ->> 'unterordner', p_daten ->> 'name', p_daten ->> 'quelle',
            (p_daten ->> 'beleg_id')::uuid, (p_daten ->> 'version')::integer, p_daten ->> 'mime', (p_daten ->> 'groesse')::bigint,
            p_daten ->> 'drive_id', p_daten ->> 'item_id', p_daten ->> 'web_url', coalesce(p_daten ->> 'status', 'wartet'),
            p_daten ->> 'puffer_pfad', coalesce((p_daten ->> 'versuche')::integer, 0), left(p_daten ->> 'fehler', 2000),
            (p_daten ->> 'abgelegt_am')::timestamptz)
    returning id into v_id;
  elsif coalesce((p_daten ->> 'geloescht')::boolean, false) then
    perform app.loeschen('ablage_datei', v_id);
  else
    update public.ablage_datei set
      ordner_id = coalesce((p_daten ->> 'ordner_id')::uuid, ordner_id),
      name = coalesce(p_daten ->> 'name', name),
      mime = coalesce(p_daten ->> 'mime', mime),
      groesse = coalesce((p_daten ->> 'groesse')::bigint, groesse),
      drive_id = case when p_daten ? 'drive_id' then p_daten ->> 'drive_id' else drive_id end,
      item_id = case when p_daten ? 'item_id' then p_daten ->> 'item_id' else item_id end,
      web_url = case when p_daten ? 'web_url' then p_daten ->> 'web_url' else web_url end,
      status = coalesce(p_daten ->> 'status', status),
      puffer_pfad = case when p_daten ? 'puffer_pfad' then p_daten ->> 'puffer_pfad' else puffer_pfad end,
      versuche = coalesce((p_daten ->> 'versuche')::integer, versuche),
      fehler = case when p_daten ? 'fehler' then left(p_daten ->> 'fehler', 2000) else fehler end,
      abgelegt_am = case when p_daten ? 'abgelegt_am' then (p_daten ->> 'abgelegt_am')::timestamptz else abgelegt_am end
     where id = v_id and deleted_at is null;
  end if;
  return v_id;
end $$;
