-- =====================================================================================================================
-- Benutzer, Rechte-Funktionen, Mitarbeiter, Fahrzeuge, Kolonnen, Ressourcen, Abwesenheiten
-- =====================================================================================================================

create table public.mitarbeiter (
  id uuid primary key default gen_random_uuid(),
  kuerzel text not null check (kuerzel ~ '^[A-ZÄÖÜ]{1,4}$'),
  name text not null check (length(trim(name)) > 0),
  rolle text,
  telefon text,
  ist_monteur boolean not null default false,
  aktiv boolean not null default true,
  reihenfolge integer not null default 0,
  like app.basis including defaults
);
comment on table public.mitarbeiter is 'Mitarbeiter mit und ohne App-Zugang. Nur Monteure erscheinen in der Plantafel.';
create unique index mitarbeiter_kuerzel_uk on public.mitarbeiter (kuerzel) where deleted_at is null;

create table public.benutzer (
  id uuid primary key references auth.users (id) on delete restrict,
  name text not null,
  email text not null,
  mitarbeiter_id uuid references public.mitarbeiter (id),
  admin boolean not null default false,
  konditionen boolean not null default false,
  aktiv boolean not null default true,
  dashboard_start text not null default 'gf' check (dashboard_start in ('gf', 'montage', 'einkauf')),
  like app.basis including defaults
);
comment on table public.benutzer is 'App-Benutzer (nur per Einladung). Rechte: admin, konditionen. Ändern nur durch Admins.';
comment on column public.benutzer.konditionen is 'Recht „Konditionen sehen“ für Kunden- und Lieferanten-Konditionen';

-- ---------------------------------------------------------------------------------------------------------------------
-- Rechte-Funktionen für RLS. SECURITY DEFINER, damit sie benutzer ohne RLS-Rekursion lesen.
-- MFA ist Pflicht: ohne bestätigten zweiten Faktor (aal2) gilt niemand als Benutzer.
-- ---------------------------------------------------------------------------------------------------------------------
create function app.ist_benutzer() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
     and exists (select 1 from public.benutzer b where b.id = auth.uid() and b.aktiv and b.deleted_at is null)
$$;

create function app.ist_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
     and exists (select 1 from public.benutzer b where b.id = auth.uid() and b.aktiv and b.admin and b.deleted_at is null)
$$;

create function app.darf_konditionen() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
     and exists (select 1 from public.benutzer b where b.id = auth.uid() and b.aktiv and b.konditionen and b.deleted_at is null)
$$;

grant execute on function app.ist_benutzer(), app.ist_admin(), app.darf_konditionen() to authenticated, service_role;

select app.einrichten('mitarbeiter', '(select app.ist_benutzer())', '(select app.ist_benutzer())');
select app.einrichten('benutzer', '(select app.ist_benutzer())', '(select app.ist_admin())');

-- Mindestens ein aktiver Admin muss bleiben (gilt für Änderungen durch angemeldete Benutzer)
create function app.admin_bleibt() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    return null;
  end if;
  if old.admin and old.aktiv and old.deleted_at is null
     and (tg_op = 'DELETE' or not (new.admin and new.aktiv and new.deleted_at is null))
     and not exists (select 1 from public.benutzer b
                      where b.id <> old.id and b.admin and b.aktiv and b.deleted_at is null) then
    raise exception 'Mindestens ein aktiver Admin muss bleiben' using errcode = 'P0001';
  end if;
  return null;
end $$;
create trigger admin_bleibt after update or delete on public.benutzer
  for each row execute function app.admin_bleibt();

create table public.benutzer_einstellung (
  id uuid primary key default gen_random_uuid(),
  benutzer_id uuid not null default auth.uid() references public.benutzer (id),
  farbschema text not null default 'hell' check (farbschema in ('hell', 'dunkel', 'system')),
  seitenleiste_hell boolean not null default false,
  seitenleiste_eingeklappt boolean not null default false,
  ansichten jsonb not null default '{}'::jsonb,
  like app.basis including defaults
);
comment on table public.benutzer_einstellung is 'Darstellung je Benutzer (Farbschema, Seitenleiste, gemerkte Listen-/Board-Ansichten). Jeder nur seine eigene.';
create unique index benutzer_einstellung_uk on public.benutzer_einstellung (benutzer_id) where deleted_at is null;
select app.einrichten('benutzer_einstellung',
  'benutzer_id = (select auth.uid()) and (select app.ist_benutzer())',
  'benutzer_id = (select auth.uid()) and (select app.ist_benutzer())');

-- ---------------------------------------------------------------------------------------------------------------------
-- Fahrzeuge, Kolonnen, Ressourcen
-- ---------------------------------------------------------------------------------------------------------------------
create table public.fahrzeug (
  id uuid primary key default gen_random_uuid(),
  kennzeichen text not null,
  typ text,
  km_stand integer check (km_stand >= 0),
  hinweise text,
  tuev_am date,
  service_am date,
  uvv_am date,
  like app.basis including defaults
);
create unique index fahrzeug_kennzeichen_uk on public.fahrzeug (kennzeichen) where deleted_at is null;
select app.einrichten('fahrzeug', '(select app.ist_benutzer())', '(select app.ist_benutzer())');

create table public.fahrzeug_werkstatt (
  id uuid primary key default gen_random_uuid(),
  fahrzeug_id uuid not null references public.fahrzeug (id),
  von date not null,
  bis date not null,
  notiz text,
  like app.basis including defaults,
  check (bis >= von)
);
select app.einrichten('fahrzeug_werkstatt', '(select app.ist_benutzer())', '(select app.ist_benutzer())');

create table public.kolonne (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  stammfahrzeug_id uuid references public.fahrzeug (id),
  reihenfolge integer not null default 0,
  like app.basis including defaults
);
comment on table public.kolonne is 'Feste Teams mit Stammfahrzeug, gepflegt in der Plantafel. Die Kolonne eines Fahrzeugs ergibt sich aus stammfahrzeug_id.';
select app.einrichten('kolonne', '(select app.ist_benutzer())', '(select app.ist_benutzer())');

create table public.kolonne_mitglied (
  id uuid primary key default gen_random_uuid(),
  kolonne_id uuid not null references public.kolonne (id),
  mitarbeiter_id uuid not null references public.mitarbeiter (id),
  reihenfolge integer not null default 0,
  like app.basis including defaults
);
create unique index kolonne_mitglied_uk on public.kolonne_mitglied (kolonne_id, mitarbeiter_id) where deleted_at is null;
select app.einrichten('kolonne_mitglied', '(select app.ist_benutzer())', '(select app.ist_benutzer())');

-- Nur Monteure können Mitglied einer Kolonne sein und in Einsätzen stehen
create function app.nur_monteur() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.deleted_at is null and not exists (select 1 from public.mitarbeiter m
                                             where m.id = new.mitarbeiter_id and m.ist_monteur and m.deleted_at is null) then
    raise exception 'Nur Monteure können eingeteilt werden' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger nur_monteur before insert or update on public.kolonne_mitglied
  for each row execute function app.nur_monteur();

create table public.ressource (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  notiz text,
  reihenfolge integer not null default 0,
  like app.basis including defaults
);
comment on table public.ressource is 'Weitere Zeilen der Plantafel (z. B. Selbstabholer, Lager / Werkstatt, Subunternehmer).';
select app.einrichten('ressource', '(select app.ist_benutzer())', '(select app.ist_benutzer())');

-- ---------------------------------------------------------------------------------------------------------------------
-- Abwesenheiten: Genehmigen und Ablehnen nur durch Admins, Krankmeldungen gelten sofort
-- ---------------------------------------------------------------------------------------------------------------------
create table public.abwesenheit (
  id uuid primary key default gen_random_uuid(),
  mitarbeiter_id uuid not null references public.mitarbeiter (id),
  art text not null check (art in ('urlaub', 'krank', 'schulung', 'ueberstundenabbau', 'sonstiges')),
  von date not null,
  bis date not null,
  status text not null default 'beantragt' check (status in ('beantragt', 'genehmigt', 'abgelehnt')),
  notiz text,
  entschieden_von uuid references public.benutzer (id),
  entschieden_am timestamptz,
  like app.basis including defaults,
  check (bis >= von)
);
comment on column public.abwesenheit.entschieden_von is 'Admin, der genehmigt oder abgelehnt hat (bei Krankmeldungen leer: gilt automatisch)';
select app.einrichten('abwesenheit', '(select app.ist_benutzer())', '(select app.ist_benutzer())');

create function app.abwesenheit_status() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return new; -- Server-Prozesse (z. B. Datenübernahme)
  end if;

  if new.art = 'krank' then
    -- Krankmeldungen gelten ohne Genehmigung
    if tg_op = 'INSERT' or old.status is distinct from 'genehmigt' or old.art is distinct from 'krank' then
      new.status := 'genehmigt';
      new.entschieden_von := null;
      new.entschieden_am := now();
    else
      new.status := old.status;
      new.entschieden_von := old.entschieden_von;
      new.entschieden_am := old.entschieden_am;
    end if;
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.status <> 'beantragt' then
      if not app.ist_admin() then
        raise exception 'Nur ein Admin darf Abwesenheiten genehmigen oder ablehnen' using errcode = '42501';
      end if;
      new.entschieden_von := v_uid;
      new.entschieden_am := now();
    else
      new.entschieden_von := null;
      new.entschieden_am := null;
    end if;
    return new;
  end if;

  -- UPDATE
  if new.status is distinct from old.status then
    if not app.ist_admin() then
      raise exception 'Nur ein Admin darf Abwesenheiten genehmigen oder ablehnen' using errcode = '42501';
    end if;
    if new.status = 'beantragt' then
      new.entschieden_von := null;
      new.entschieden_am := null;
    else
      new.entschieden_von := v_uid;
      new.entschieden_am := now();
    end if;
  elsif not app.ist_admin()
        and old.status <> 'beantragt'
        and (new.von, new.bis, new.art, new.mitarbeiter_id) is distinct from (old.von, old.bis, old.art, old.mitarbeiter_id) then
    -- Geänderter Zeitraum einer entschiedenen Abwesenheit muss neu genehmigt werden
    new.status := 'beantragt';
    new.entschieden_von := null;
    new.entschieden_am := null;
  else
    new.entschieden_von := old.entschieden_von;
    new.entschieden_am := old.entschieden_am;
  end if;
  return new;
end $$;
create trigger abwesenheit_status before insert or update on public.abwesenheit
  for each row execute function app.abwesenheit_status();
