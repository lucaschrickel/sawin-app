-- Sicherheitsprüfung, Block C (docs/sicherheit.md M7, F06/F100, F07): Anmeldung und Rechte.
--
-- 1. Sperre je Konto: 10 Fehlversuche (Passwort, Zwei-Faktor-Code, Passwort ändern) innerhalb von 15 Minuten sperren
--    die Anmeldung für 15 Minuten. Der Zähler gilt je E-Mail-Adresse, auch für unbekannte Adressen (verrät nicht, ob es
--    ein Konto gibt), und speichert nur die SHA-256 der Adresse. Ereignisse bekannter Konten stehen im Audit-Log
--    (konto_ereignis): anmeldung_fehlgeschlagen, konto_gesperrt, angemeldet. Nur der Server ruft die Funktionen auf.
-- 2. Konto-Historie (Sicherheitsereignisse) nur für den Benutzer selbst und für Admins.
-- 3. Funktionen im Schema app: nicht mehr für PUBLIC ausführbar, nur gezielt für angemeldete Benutzer (alles, was
--    Policies, Sichten oder als Aufrufer laufende Funktionen und Trigger brauchen) und für die Service-Rolle.

-- 1. Sperre je Konto ------------------------------------------------------------------------------------------------
create table app.anmelde_sperre (
  schluessel text primary key,          -- sha256(lower(email)), hex
  fehler integer not null default 0,
  seit timestamptz,
  gesperrt_bis timestamptz
);
alter table app.anmelde_sperre enable row level security;
revoke all on app.anmelde_sperre from public, anon, authenticated;
comment on table app.anmelde_sperre is 'Fehlversuche der Anmeldung je Konto (nur Server)';

create function app.anmelde_schluessel(p_email text) returns text
language sql immutable set search_path = '' as $$
  select encode(sha256(convert_to(lower(trim(coalesce(p_email, ''))), 'UTF8')), 'hex')
$$;

create function app.konto_von(p_email text) returns uuid
language sql stable security definer set search_path = '' as $$
  select b.id from public.benutzer b where lower(b.email) = lower(trim(p_email)) and b.deleted_at is null limit 1
$$;

/** Gesperrt bis (oder null) */
create function public.anmeldung_gesperrt(p_email text) returns timestamptz
language sql stable security definer set search_path = '' as $$
  select s.gesperrt_bis from app.anmelde_sperre s
   where s.schluessel = app.anmelde_schluessel(p_email) and s.gesperrt_bis > now()
$$;

/** Fehlversuch zählen; liefert „gesperrt bis“, sobald die Grenze erreicht ist */
create function public.anmeldung_fehlversuch(p_email text, p_art text) returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare
  v_s app.anmelde_sperre;
  v_konto uuid := app.konto_von(p_email);
begin
  if p_art not in ('passwort', 'code', 'passwort_aendern') then
    raise exception 'Unbekannte Art' using errcode = '22023';
  end if;
  insert into app.anmelde_sperre as s (schluessel, fehler, seit)
  values (app.anmelde_schluessel(p_email), 1, now())
  on conflict (schluessel) do update
    set fehler = case when s.seit is null or s.seit < now() - interval '15 minutes' then 1 else s.fehler + 1 end,
        seit = case when s.seit is null or s.seit < now() - interval '15 minutes' then now() else s.seit end
  returning * into v_s;
  if v_konto is not null then
    perform public.konto_ereignis(v_konto, 'anmeldung_fehlgeschlagen', jsonb_build_object('art', p_art, 'versuch', v_s.fehler));
  end if;
  if v_s.fehler >= 10 then
    update app.anmelde_sperre set fehler = 0, seit = null, gesperrt_bis = now() + interval '15 minutes'
     where schluessel = v_s.schluessel
    returning * into v_s;
    if v_konto is not null then
      perform public.konto_ereignis(v_konto, 'konto_gesperrt', jsonb_build_object('bis', v_s.gesperrt_bis));
    end if;
    return v_s.gesperrt_bis;
  end if;
  return null;
end $$;

/** Vollständige Anmeldung (zweiter Faktor bestätigt): Zähler zurücksetzen, Ereignis protokollieren */
create function public.anmeldung_erfolgreich(p_email text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_konto uuid := app.konto_von(p_email);
begin
  delete from app.anmelde_sperre where schluessel = app.anmelde_schluessel(p_email) and (gesperrt_bis is null or gesperrt_bis <= now());
  if v_konto is not null then
    perform public.konto_ereignis(v_konto, 'angemeldet', '{}'::jsonb);
  end if;
end $$;

revoke all on function public.anmeldung_gesperrt(text), public.anmeldung_fehlversuch(text, text),
  public.anmeldung_erfolgreich(text) from public, anon, authenticated;
grant execute on function public.anmeldung_gesperrt(text), public.anmeldung_fehlversuch(text, text),
  public.anmeldung_erfolgreich(text) to service_role;

-- 2. Konto-Historie -------------------------------------------------------------------------------------------------
create or replace function app.historie(p_tabelle text, p_id uuid)
returns table(zeit timestamptz, benutzer_id uuid, benutzer_name text, db_rolle text, aktion text, geaendert text[], vorher jsonb, nachher jsonb)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.ist_benutzer() then
    raise exception 'Keine Berechtigung' using errcode = '42501';
  end if;
  -- Vertrauliche und persönliche Tabellen nur mit dem passenden Recht; Konto-Ereignisse nur eigene oder als Admin
  if (p_tabelle in ('kunde_kondition', 'lieferant_kondition') and not app.darf_konditionen())
     or (p_tabelle in ('benutzer', 'benutzer_einstellung', 'chat_gelesen', 'benachrichtigung') and not app.ist_admin())
     or (p_tabelle = 'konto' and p_id is distinct from auth.uid() and not app.ist_admin()) then
    return;
  end if;
  return query
    select l.zeit, l.benutzer_id, b.name, l.db_rolle, l.aktion, l.geaendert, l.vorher, l.nachher
      from audit.log l
      left join public.benutzer b on b.id = l.benutzer_id
     where l.tabelle = p_tabelle and l.datensatz_id = p_id
     order by l.zeit desc, l.id desc;
end $$;

-- 3. Funktionen im Schema app ---------------------------------------------------------------------------------------
revoke execute on all functions in schema app from public;
alter default privileges in schema app revoke execute on functions from public;
grant execute on all functions in schema app to service_role;
alter default privileges in schema app grant execute on functions to service_role;

do $$
declare
  v_neu integer;
  r record;
begin
  -- Gebraucht von angemeldeten Benutzern: in Policies und Sichten, in Funktionen und Triggern, die mit den Rechten des
  -- Benutzers laufen (security invoker), und transitiv in so freigegebenen app-Funktionen.
  create temp table frei (oid oid primary key) on commit drop;
  loop
    insert into frei
    select p.oid
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'app' and p.oid not in (select oid from frei)
       and (exists (select 1 from pg_policies pol
                     where coalesce(pol.qual, '') || ' ' || coalesce(pol.with_check, '') ~ ('app\.' || p.proname || '\M'))
         or exists (select 1 from pg_views v
                     where v.schemaname in ('public', 'app') and v.definition ~ ('app\.' || p.proname || '\M'))
         or exists (select 1 from pg_proc q join pg_namespace m on m.oid = q.pronamespace
                     where m.nspname in ('public', 'app', 'audit') and not q.prosecdef
                       and (m.nspname <> 'app' or q.prorettype = 'trigger'::regtype or q.oid in (select oid from frei))
                       and q.prosrc ~ ('app\.' || p.proname || '\M')));
    get diagnostics v_neu = row_count;
    exit when v_neu = 0;
  end loop;
  for r in select p.oid::regprocedure as f from frei join pg_proc p on p.oid = frei.oid loop
    execute format('grant execute on function %s to authenticated', r.f);
  end loop;
end $$;
