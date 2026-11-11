-- Lexware-Webhook (CLAUDE.md „Zahlungen“): Eingangsprotokoll der Ereignisse von Lexware.
-- Lexware liefert keine Ereignis-ID; der Schlüssel (SHA-256 aus Organisation, Ereignis, Ressource und Zeitpunkt) erkennt
-- Doppelzustellungen. Fehler stehen am Eintrag (status = fehler, fehler); eine erneute Zustellung verarbeitet ihn noch
-- einmal. Technisches Protokoll, keine Fachdaten: kein Audit-Trigger, nur der Server schreibt, Admins dürfen lesen.

create table public.lexware_ereignis (
  id uuid primary key default gen_random_uuid(),
  schluessel text not null unique,
  ereignis text not null,
  ressource_id text not null,
  ereignis_am timestamptz,
  organisation_id text,
  status text not null default 'neu' check (status in ('neu', 'verarbeitet', 'ignoriert', 'fehler')),
  fehler text,
  versuche integer not null default 1,
  eingang_am timestamptz not null default now(),
  zuletzt_am timestamptz not null default now(),
  verarbeitet_am timestamptz
);
comment on table public.lexware_ereignis is 'Eingangsprotokoll des Lexware-Webhooks (Doppelzustellungen, Fehler)';
create index lexware_ereignis_offen on public.lexware_ereignis (zuletzt_am) where status in ('neu', 'fehler');

alter table public.lexware_ereignis enable row level security;
revoke all on table public.lexware_ereignis from anon, authenticated;
grant select on table public.lexware_ereignis to authenticated;
create policy lesen on public.lexware_ereignis for select to authenticated using ((select app.ist_admin()));

-- Server: Eingang eines Ereignisses. Neu → verarbeiten. Schon bekannt → nur zählen; noch einmal verarbeiten, wenn der
-- letzte Versuch fehlschlug oder seit 2 Minuten ohne Ergebnis hängt (sonst Doppelzustellung, nichts tun).
create function public.lexware_ereignis_eingang(p_schluessel text, p_ereignis text, p_ressource text, p_am timestamptz, p_organisation text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v public.lexware_ereignis;
  v_wieder boolean;
begin
  insert into public.lexware_ereignis (schluessel, ereignis, ressource_id, ereignis_am, organisation_id)
  values (p_schluessel, p_ereignis, p_ressource, p_am, p_organisation)
  on conflict (schluessel) do nothing
  returning * into v;
  if found then
    return jsonb_build_object('id', v.id, 'verarbeiten', true, 'status', 'neu');
  end if;
  select * into v from public.lexware_ereignis where schluessel = p_schluessel for update;
  v_wieder := v.status = 'fehler' or (v.status = 'neu' and v.zuletzt_am < now() - interval '2 minutes');
  update public.lexware_ereignis
     set versuche = versuche + 1,
         zuletzt_am = now(),
         status = case when v_wieder then 'neu' else status end
   where id = v.id;
  return jsonb_build_object('id', v.id, 'verarbeiten', v_wieder, 'status', v.status);
end $$;
comment on function public.lexware_ereignis_eingang(text, text, text, timestamptz, text) is 'Server: Eingang eines Lexware-Ereignisses (idempotent)';

-- Server: Ergebnis der Verarbeitung
create function public.lexware_ereignis_ende(p_id uuid, p_status text, p_fehler text)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_status not in ('verarbeitet', 'ignoriert', 'fehler') then
    raise exception 'Ungültiger Status %', p_status;
  end if;
  update public.lexware_ereignis
     set status = p_status,
         fehler = left(p_fehler, 2000),
         verarbeitet_am = case when p_status = 'fehler' then null else now() end
   where id = p_id;
end $$;
comment on function public.lexware_ereignis_ende(uuid, text, text) is 'Server: Ergebnis eines Lexware-Ereignisses';

revoke execute on function public.lexware_ereignis_eingang(text, text, text, timestamptz, text), public.lexware_ereignis_ende(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.lexware_ereignis_eingang(text, text, text, timestamptz, text), public.lexware_ereignis_ende(uuid, text, text)
  to service_role;
