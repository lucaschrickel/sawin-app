-- Vorläufiger Versand in Version 1 (CLAUDE.md „Versand in Version 1“): Die App lädt das PDF herunter und öffnet
-- Outlook per mailto. beleg_versenden protokolliert den Versand (Empfänger, BCC, Betreff, Text, Dateiname) und friert
-- bei Angebot und AB die Version ein. Rechnung, Abschlag und Gutschrift nur mit dem Lexware-Original-PDF.

create function public.beleg_versenden(p_id uuid, p_empfaenger text[], p_bcc text[], p_betreff text, p_text text, p_datei text)
returns integer
language plpgsql security invoker set search_path = '' as $$
declare
  v_b public.beleg;
  v_adresse constant text := '^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$';
begin
  select * into v_b from public.beleg where id = p_id and deleted_at is null for update;
  if not found then
    raise exception 'Beleg nicht gefunden' using errcode = 'P0002';
  end if;
  if v_b.status = 'entwurf' then
    raise exception 'Ein Entwurf kann nicht versendet werden. Bitte zuerst fertigstellen.' using errcode = '23514';
  end if;
  if v_b.art in ('rechnung', 'abschlagsrechnung', 'gutschrift') and v_b.pdf_pfad is null then
    raise exception 'Versendet wird nur das Original-PDF von Lexware. Es liegt noch nicht vor.' using errcode = '23514';
  end if;
  if coalesce(cardinality(p_empfaenger), 0) = 0 then
    raise exception 'Bitte mindestens einen Empfänger angeben.' using errcode = '23514';
  end if;
  if exists (select 1 from unnest(p_empfaenger || coalesce(p_bcc, '{}')) a where a !~ v_adresse) then
    raise exception 'Bitte gültige E-Mail-Adressen angeben.' using errcode = '23514';
  end if;

  -- Angebot und AB: aktuelle Version einfrieren (wie „Als übergeben markieren“)
  if v_b.art in ('angebot', 'auftragsbestaetigung') and coalesce(v_b.eingefroren_version, 0) < v_b.version then
    perform set_config('app.beleg_vorgang', 'uebergeben', true);
    insert into public.beleg_version (beleg_id, version, daten, pdf_pfad)
    values (p_id, v_b.version,
            to_jsonb(v_b) || jsonb_build_object('positionen', coalesce((
              select jsonb_agg(to_jsonb(p) order by p.reihenfolge) from public.beleg_position p
               where p.beleg_id = p_id and p.deleted_at is null), '[]'::jsonb)),
            v_b.pdf_pfad);
    update public.beleg set eingefroren_version = v_b.version where id = p_id;
  end if;

  insert into public.beleg_versand (beleg_id, version, kanal, empfaenger, bcc, betreff, text, pdfs)
  values (p_id, v_b.version, 'email', p_empfaenger, coalesce(p_bcc, '{}'), left(p_betreff, 500), left(p_text, 5000),
          jsonb_build_array(jsonb_build_object('name', left(p_datei, 200), 'art', 'beleg')));
  return v_b.version;
end $$;
comment on function public.beleg_versenden(uuid, text[], text[], text, text, text) is
  'Vorläufiger Versand (mailto): protokollieren, bei Angebot und AB die Version einfrieren';
revoke execute on function public.beleg_versenden(uuid, text[], text[], text, text, text) from public, anon;
grant execute on function public.beleg_versenden(uuid, text[], text[], text, text, text) to authenticated;
