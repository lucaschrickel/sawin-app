-- OneDrive-Ablage über Microsoft Graph (CLAUDE.md „OneDrive“, Entscheidung 11.11.2026): nur Dateien, die App speichert
-- die Verknüpfung (Drive-ID, Item-ID). Ordner je Anfrage (ab dem ersten Angebot), mit der AB derselbe Ordner für den
-- Auftrag; Tickets eigene Ordner. Ist Microsoft nicht erreichbar, liegt die Datei im privaten Speicher ablage-puffer
-- und wird nachgeladen. Geschrieben wird nur vom Server über ablage_* (Service-Rolle, handelnder Benutzer im Audit-Log).

-- Verbindung (Einstellungen › Verbindungen): SharePoint-Website, Bibliothek (Liste), Basisordner
alter table public.einstellung
  add column onedrive_site_id text,
  add column onedrive_liste_id text,
  add column onedrive_drive_id text,
  add column onedrive_basis_pfad text,
  add column onedrive_basis_id text,
  add column onedrive_basis_url text,
  add column onedrive_geprueft_am timestamptz;

create table public.ablage_ordner (
  id uuid primary key default gen_random_uuid(),
  anfrage_id uuid references public.anfrage (id),
  auftrag_id uuid references public.auftrag (id),
  ticket_id uuid references public.service_ticket (id),
  name text not null check (length(trim(name)) > 0),
  drive_id text,
  item_id text,
  web_url text,
  -- Unterordner: Name → Item-ID
  unterordner jsonb not null default '{}',
  status text not null default 'wartet' check (status in ('wartet', 'angelegt', 'fehler')),
  fehler text,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  deleted_at timestamptz,
  deleted_by uuid,
  check (num_nonnulls(anfrage_id, auftrag_id, ticket_id) >= 1)
);
comment on table public.ablage_ordner is 'OneDrive-Ordner einer Anfrage bzw. eines Auftrags (derselbe Ordner) oder eines Tickets';
create unique index ablage_ordner_anfrage on public.ablage_ordner (anfrage_id) where anfrage_id is not null and deleted_at is null;
create unique index ablage_ordner_auftrag on public.ablage_ordner (auftrag_id) where auftrag_id is not null and deleted_at is null;
create unique index ablage_ordner_ticket on public.ablage_ordner (ticket_id) where ticket_id is not null and deleted_at is null;

create table public.ablage_datei (
  id uuid primary key default gen_random_uuid(),
  ordner_id uuid not null references public.ablage_ordner (id),
  unterordner text,
  name text not null check (length(trim(name)) > 0),
  quelle text not null check (quelle in ('beleg', 'upload', 'formular')),
  beleg_id uuid references public.beleg (id),
  version integer,
  mime text,
  groesse bigint,
  drive_id text,
  item_id text,
  web_url text,
  status text not null default 'wartet' check (status in ('wartet', 'abgelegt', 'fehler')),
  -- Zwischenspeicher, solange Microsoft nicht erreichbar war (Bucket ablage-puffer)
  puffer_pfad text,
  versuche integer not null default 0,
  fehler text,
  abgelegt_am timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  deleted_at timestamptz,
  deleted_by uuid
);
comment on table public.ablage_datei is 'Datei im OneDrive-Ordner (Verknüpfung) bzw. wartend im Zwischenspeicher';
create unique index ablage_datei_beleg on public.ablage_datei (beleg_id, version) where beleg_id is not null and deleted_at is null;
create index ablage_datei_wartet on public.ablage_datei (created_at) where status in ('wartet', 'fehler') and deleted_at is null;
create index ablage_datei_ordner on public.ablage_datei (ordner_id);

-- Lesen: alle Benutzer; schreiben nur der Server über die Funktionen unten
select app.einrichten('ablage_ordner', '(select app.ist_benutzer())', 'false');
select app.einrichten('ablage_datei', '(select app.ist_benutzer())', 'false');

-- Zugriffstoken für Microsoft Graph, verschlüsselt (AES-256-GCM, Schlüssel nur in MS_TOKEN_SCHLUESSEL); nur der Server
create table public.ms_token (
  id smallint primary key default 1 check (id = 1),
  wert text not null,
  gueltig_bis timestamptz not null,
  updated_at timestamptz not null default now()
);
comment on table public.ms_token is 'Verschlüsseltes Zugriffstoken für Microsoft Graph (nur Server)';
alter table public.ms_token enable row level security;
revoke all on table public.ms_token from anon, authenticated;

-- Zwischenspeicher: privat, nur die Service-Rolle (keine Policies für Benutzer)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ablage-puffer', 'ablage-puffer', false, 52428800, null)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------------------------------------------------
-- Server: Ordner bzw. Datei anlegen oder ändern (jsonb mit den Spalten). Der handelnde Benutzer steht im Audit-Log.
-- ---------------------------------------------------------------------------------------------------------------------
create function public.ablage_ordner_setzen(p_benutzer uuid, p_id uuid, p_daten jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := p_id;
begin
  perform set_config('app.im_namen_von', coalesce(p_benutzer::text, ''), true);
  if v_id is null then
    insert into public.ablage_ordner (anfrage_id, auftrag_id, ticket_id, name, drive_id, item_id, web_url, unterordner, status, fehler)
    values ((p_daten ->> 'anfrage_id')::uuid, (p_daten ->> 'auftrag_id')::uuid, (p_daten ->> 'ticket_id')::uuid, p_daten ->> 'name',
            p_daten ->> 'drive_id', p_daten ->> 'item_id', p_daten ->> 'web_url', coalesce(p_daten -> 'unterordner', '{}'),
            coalesce(p_daten ->> 'status', 'wartet'), p_daten ->> 'fehler')
    returning id into v_id;
  else
    update public.ablage_ordner set
      anfrage_id = case when p_daten ? 'anfrage_id' then (p_daten ->> 'anfrage_id')::uuid else anfrage_id end,
      auftrag_id = case when p_daten ? 'auftrag_id' then (p_daten ->> 'auftrag_id')::uuid else auftrag_id end,
      ticket_id = case when p_daten ? 'ticket_id' then (p_daten ->> 'ticket_id')::uuid else ticket_id end,
      name = coalesce(p_daten ->> 'name', name),
      drive_id = case when p_daten ? 'drive_id' then p_daten ->> 'drive_id' else drive_id end,
      item_id = case when p_daten ? 'item_id' then p_daten ->> 'item_id' else item_id end,
      web_url = case when p_daten ? 'web_url' then p_daten ->> 'web_url' else web_url end,
      unterordner = coalesce(p_daten -> 'unterordner', unterordner),
      status = coalesce(p_daten ->> 'status', status),
      fehler = case when p_daten ? 'fehler' then left(p_daten ->> 'fehler', 2000) else fehler end
     where id = v_id and deleted_at is null;
  end if;
  return v_id;
end $$;

create function public.ablage_datei_setzen(p_benutzer uuid, p_id uuid, p_daten jsonb) returns uuid
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
  else
    update public.ablage_datei set
      ordner_id = coalesce((p_daten ->> 'ordner_id')::uuid, ordner_id),
      name = coalesce(p_daten ->> 'name', name),
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

comment on function public.ablage_ordner_setzen(uuid, uuid, jsonb) is 'Server: OneDrive-Ordner anlegen bzw. ändern';
comment on function public.ablage_datei_setzen(uuid, uuid, jsonb) is 'Server: Datei der Ablage anlegen bzw. ändern';
revoke execute on function public.ablage_ordner_setzen(uuid, uuid, jsonb), public.ablage_datei_setzen(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.ablage_ordner_setzen(uuid, uuid, jsonb), public.ablage_datei_setzen(uuid, uuid, jsonb) to service_role;
