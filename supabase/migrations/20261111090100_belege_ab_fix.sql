-- =====================================================================================================================
-- Korrektur: Beim Fertigstellen der AB wurden die Entwürfe anderer Varianten verworfen – einschließlich der AB selbst,
-- solange sie noch als Entwurf an der Anfrage hing. Die AB ist jetzt ausgenommen.
-- =====================================================================================================================

create or replace function public.beleg_fertigstellen(p_id uuid) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  v_b public.beleg;
  v_q public.anfrage;
  v_auftrag uuid;
  v_nr text;
  r record;
begin
  perform set_config('app.beleg_vorgang', 'fertigstellen', true);
  select * into v_b from public.beleg where id = p_id for update;
  if not found then
    raise exception 'Beleg nicht gefunden' using errcode = 'P0002';
  end if;
  if v_b.status <> 'entwurf' then
    raise exception 'Der Beleg ist schon fertiggestellt.' using errcode = '23514';
  end if;
  if v_b.art not in ('angebot', 'auftragsbestaetigung', 'lieferschein') then
    raise exception 'Diese Belegart wird über Lexware fertiggestellt.' using errcode = '22023';
  end if;
  if v_b.kunde_id is null then
    raise exception 'Bitte einen Kunden wählen.' using errcode = '23514';
  end if;
  if not exists (select 1 from public.beleg_position where beleg_id = p_id and deleted_at is null and typ = 'artikel') then
    raise exception 'Der Beleg braucht mindestens eine Position.' using errcode = '23514';
  end if;
  if exists (select 1 from public.beleg_position where beleg_id = p_id and deleted_at is null and typ = 'artikel'
              and trim(titel) = '') then
    raise exception 'Jede Position braucht einen Titel.' using errcode = '23514';
  end if;
  if v_b.art = 'lieferschein' and v_b.auftrag_id is null then
    raise exception 'Ein Lieferschein gehört zu einem Auftrag.' using errcode = '23514';
  end if;

  if v_b.art = 'angebot' then
    update public.beleg set status = 'offen', fertiggestellt_am = now(), fertiggestellt_von = auth.uid() where id = p_id;
    update public.anfrage set status = 'angebot_versendet'
     where id = v_b.anfrage_id and archiv is null and status <> 'angebot_versendet';
  elsif v_b.art = 'lieferschein' then
    update public.beleg set status = 'fertiggestellt', fertiggestellt_am = now(), fertiggestellt_von = auth.uid() where id = p_id;
  else
    v_auftrag := v_b.auftrag_id;
    if v_auftrag is null then
      select * into v_q from public.anfrage where id = v_b.anfrage_id;
      if v_q.archiv = 'verloren' then
        raise exception 'Die Anfrage ist als verloren archiviert.' using errcode = 'P0001';
      end if;
      if v_q.id is not null and exists (select 1 from public.auftrag where anfrage_id = v_q.id and deleted_at is null) then
        raise exception 'Zu dieser Anfrage gibt es schon einen Auftrag.' using errcode = '23505';
      end if;
      -- Auftrag mit der nächsten AB-Nummer; die AB übernimmt sie beim Fertigstellen (Auftragsnummer = AB-Nummer)
      insert into public.auftrag (nummer, kunde_id, anfrage_id, nachtrag_zu, titel, objekt, herkunft, zustaendig_id, produkte)
      select app.naechste_nummer('auftragsbestaetigung'), v_b.kunde_id, v_q.id, v_q.nachtrag_zu,
             coalesce(v_q.titel, v_b.titel, ''), coalesce(v_b.objekt, v_q.objekt), coalesce(v_q.herkunft, k.herkunft),
             v_q.zustaendig_id, coalesce(v_q.produkte, '{}')
        from public.kunde k where k.id = v_b.kunde_id
      returning id into v_auftrag;
      -- übrige Belege der Kette von der Anfrage auf den Auftrag umhängen
      update public.beleg set anfrage_id = null, auftrag_id = v_auftrag
       where kette_id = v_b.kette_id and id <> p_id and deleted_at is null;
      if v_q.id is not null then
        -- übrige Varianten: offene „Nicht beauftragt“, Entwürfe verwerfen
        update public.beleg set status = 'nicht_beauftragt'
         where anfrage_id = v_q.id and art = 'angebot' and status = 'offen' and deleted_at is null;
        for r in select id from public.beleg where anfrage_id = v_q.id and status = 'entwurf' and deleted_at is null and id <> p_id loop
          perform app.loeschen('beleg', r.id);
        end loop;
        update public.anfrage set archiv = 'gewonnen' where id = v_q.id;
      end if;
    end if;
    update public.beleg set status = 'fertiggestellt', anfrage_id = null, auftrag_id = v_auftrag,
           fertiggestellt_am = now(), fertiggestellt_von = auth.uid()
     where id = p_id;
    -- Angebot der Kette ist angenommen
    update public.beleg set status = 'angenommen'
     where id = v_b.vorgaenger_id and art = 'angebot' and status = 'offen';
  end if;
  select nummer into v_nr from public.beleg where id = p_id;
  return jsonb_build_object('nummer', v_nr, 'auftrag_id', coalesce(v_auftrag, v_b.auftrag_id));
end $$;
