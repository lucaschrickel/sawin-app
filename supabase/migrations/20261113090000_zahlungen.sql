-- =====================================================================================================================
-- Zahlungen (Belege, Punkt 1 nach Schritt 2):
--   * Zahlungsstand von Rechnungen und Abschlägen: offener Betrag = offener Betrag laut Lexware − App-Buchungen, die
--     Lexware noch nicht kennt („in Lexware noch buchen“); offen 0 → „bezahlt“
--   * „Als bezahlt markieren“ (zahlung_erfassen) mit optionaler Zahlungsbestätigung (eigener App-Beleg, ZB-Nummer)
--   * Abgleich mit Lexware nur über die Serverfunktion lexware_zahlungen (Service-Rolle); App-Buchung und
--     Lexware-Zahlung gelten als dieselbe, wenn Beleg und Betrag gleich sind (bei mehreren: nächstes Datum)
--   * Auftrag in „Abnahme“ bzw. „Baustelle fertig“ mit fertiger Schlussrechnung und ohne offene Beträge wird
--     „Abgeschlossen“ (Historie: System)
-- =====================================================================================================================

alter table public.beleg add column lexware_offen numeric(12, 2);
comment on column public.beleg.lexware_offen is 'Offener Betrag laut Lexware (letzter Abgleich); offen_betrag zieht davon App-Buchungen ab, die Lexware noch nicht kennt';
update public.beleg set lexware_offen = summe_brutto where lexware_id is not null and lexware_offen is null;

alter table public.einstellung add column lexware_zahlung_abgleich_am timestamptz;
comment on column public.einstellung.lexware_zahlung_abgleich_am is 'Zeitpunkt des letzten Zahlungsabgleichs mit Lexware (höchstens alle 5 Minuten)';

alter table public.zahlung add column lexware_art text;
comment on column public.zahlung.lexware_art is 'Art des Zahlungspostens laut Lexware (z. B. partPaymentFinancialTransaction)';
comment on column public.zahlung.lexware_id is 'Schlüssel des Zahlungspostens in Lexware (Lexware vergibt keine ID: Beleg, Art, Datum, Betrag, laufende Nummer)';

-- ---------------------------------------------------------------------------------------------------------------------
-- Status-Regeln: wie bisher; zusätzlich ändern offener Betrag und Status von Rechnung, Abschlag und Gutschrift nur die
-- Zahlungsfunktionen (Vorgang „zahlung“) bzw. der Server; die Zahlungsbestätigung entsteht fertiggestellt.
-- ---------------------------------------------------------------------------------------------------------------------
create or replace function app.beleg_status_regeln() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_vorgang text := coalesce(current_setting('app.beleg_vorgang', true), '');
begin
  if auth.uid() is null then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.art = 'zahlungsbestaetigung' then
      if v_vorgang <> 'zahlung' then
        raise exception 'Eine Zahlungsbestätigung entsteht zu einer Zahlung.' using errcode = '42501';
      end if;
      new.status := 'fertiggestellt';
      new.fertiggestellt_am := now();
      new.fertiggestellt_von := auth.uid();
    else
      new.status := 'entwurf';
      new.fertiggestellt_am := null;
      new.fertiggestellt_von := null;
    end if;
    new.lexware_id := null;
    new.lexware_status := null;
    new.lexware_fehler := null;
    new.lexware_versuch_am := null;
    new.lexware_offen := null;
    new.offen_betrag := null;
    new.abschlag_nr := null;
    new.steuern := '[]'::jsonb;
    new.version := 1;
    new.eingefroren_version := null;
    return new;
  end if;
  new.lexware_id := old.lexware_id;
  new.lexware_status := old.lexware_status;
  new.lexware_fehler := old.lexware_fehler;
  new.lexware_versuch_am := old.lexware_versuch_am;
  new.lexware_offen := old.lexware_offen;
  new.abschlag_nr := old.abschlag_nr;
  new.steuern := old.steuern;
  if v_vorgang <> 'zahlung' then
    new.offen_betrag := old.offen_betrag;
  end if;
  if new.deleted_at is not null and old.deleted_at is null and old.lexware_status = 'uebertragung'
     and old.lexware_versuch_am > now() - interval '3 minutes' then
    raise exception 'Der Beleg wird gerade an Lexware übertragen.' using errcode = '42501';
  end if;
  if v_vorgang <> 'fertigstellen' then
    new.fertiggestellt_am := old.fertiggestellt_am;
    new.fertiggestellt_von := old.fertiggestellt_von;
  end if;
  if v_vorgang <> 'speichern' and v_vorgang <> 'uebergeben' then
    new.version := old.version;
    new.eingefroren_version := old.eingefroren_version;
  end if;
  if new.status = old.status then
    return new;
  end if;
  if old.status = 'entwurf' then
    if v_vorgang <> 'fertigstellen' or new.art in ('rechnung', 'abschlagsrechnung', 'gutschrift') then
      raise exception 'Belege werden über „Fertigstellen“ abgeschlossen.' using errcode = '42501';
    end if;
    return new;
  end if;
  if new.art in ('rechnung', 'abschlagsrechnung') and v_vorgang = 'zahlung'
     and old.status in ('offen', 'bezahlt') and new.status in ('offen', 'bezahlt') then
    return new;
  end if;
  if new.art = 'angebot' then
    if old.status = 'offen' and new.status in ('angenommen', 'abgelehnt') then
      return new;
    end if;
    if old.status = 'offen' and new.status = 'nicht_beauftragt' and v_vorgang = 'fertigstellen' then
      return new;
    end if;
    if old.status in ('angenommen', 'abgelehnt') and new.status = 'offen'
       and not exists (select 1 from public.beleg f where f.vorgaenger_id = old.id and f.art = 'auftragsbestaetigung'
                          and f.deleted_at is null) then
      return new;
    end if;
  end if;
  raise exception 'Dieser Statuswechsel ist nicht möglich.' using errcode = '42501';
end $$;

-- Ergebnis von Lexware übernehmen: wie bisher, zusätzlich offener Betrag laut Lexware
create or replace function public.lexware_fertig(p_id uuid, p_benutzer uuid, p_daten jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_b public.beleg;
begin
  perform set_config('app.im_namen_von', p_benutzer::text, true);
  update public.beleg set
    lexware_id = p_daten ->> 'lexware_id',
    nummer = p_daten ->> 'nummer',
    status = 'offen',
    summe_netto = (p_daten ->> 'summe_netto')::numeric,
    summe_brutto = (p_daten ->> 'summe_brutto')::numeric,
    steuern = coalesce(p_daten -> 'steuern', '[]'::jsonb),
    offen_betrag = (p_daten ->> 'summe_brutto')::numeric,
    lexware_offen = (p_daten ->> 'summe_brutto')::numeric,
    faellig_am = nullif(p_daten ->> 'faellig_am', '')::date,
    pdf_pfad = nullif(p_daten ->> 'pdf_pfad', ''),
    lexware_status = case when nullif(p_daten ->> 'pdf_pfad', '') is null then 'pdf_fehlt' else 'fertig' end,
    lexware_fehler = null,
    fertiggestellt_am = now(),
    fertiggestellt_von = p_benutzer
  where id = p_id and status = 'entwurf' and deleted_at is null
  returning * into v_b;
  if v_b.id is null then
    raise exception 'Beleg nicht gefunden oder schon fertiggestellt' using errcode = 'P0002';
  end if;
  if v_b.art = 'rechnung' and v_b.ticket_id is not null then
    update public.service_ticket set status = 'abgerechnet' where id = v_b.ticket_id and status <> 'abgerechnet';
  end if;
end $$;

-- ---------------------------------------------------------------------------------------------------------------------
-- Auftrag automatisch abschließen: Phase „Abnahme“ oder „Baustelle fertig“, Schluss- bzw. Rechnung fertig, kein
-- offener Betrag mehr. Läuft ohne Benutzer (Historie: System).
-- ---------------------------------------------------------------------------------------------------------------------
create function app.auftrag_auto_abschluss(p_auftrag uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_im_namen text := current_setting('app.im_namen_von', true);
begin
  if p_auftrag is null then
    return;
  end if;
  if exists (select 1 from public.auftrag where id = p_auftrag and phase in ('abnahme', 'baustelle_fertig') and deleted_at is null)
     and exists (select 1 from public.beleg where auftrag_id = p_auftrag and art = 'rechnung' and not teil
                  and status <> 'entwurf' and deleted_at is null)
     and not exists (select 1 from public.beleg where auftrag_id = p_auftrag and art in ('rechnung', 'abschlagsrechnung')
                      and status = 'offen' and deleted_at is null) then
    perform set_config('app.im_namen_von', '', true);
    update public.auftrag set phase = 'abgeschlossen' where id = p_auftrag;
    perform set_config('app.im_namen_von', coalesce(v_im_namen, ''), true);
  end if;
end $$;

-- ---------------------------------------------------------------------------------------------------------------------
-- Zahlungsstand eines Belegs neu berechnen (nach jeder Änderung an seinen Zahlungen)
-- ---------------------------------------------------------------------------------------------------------------------
create function app.zahlstand(p_beleg uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_b public.beleg;
  v_offen numeric;
  v_status text;
begin
  select * into v_b from public.beleg where id = p_beleg;
  if v_b.id is null or v_b.art not in ('rechnung', 'abschlagsrechnung') or v_b.status not in ('offen', 'bezahlt') then
    return;
  end if;
  select greatest(0, coalesce(v_b.lexware_offen, v_b.summe_brutto) - coalesce(sum(z.betrag), 0)) into v_offen
    from public.zahlung z
   where z.beleg_id = p_beleg and z.quelle = 'app' and z.lex_abgleich = 'offen' and z.deleted_at is null;
  v_status := case when v_offen <= 0 then 'bezahlt' else 'offen' end;
  if v_offen is distinct from v_b.offen_betrag or v_status <> v_b.status then
    perform set_config('app.beleg_vorgang', 'zahlung', true);
    update public.beleg set offen_betrag = v_offen, status = v_status where id = p_beleg;
  end if;
  if v_status = 'bezahlt' then
    perform app.auftrag_auto_abschluss(v_b.auftrag_id);
  end if;
end $$;

-- Zahlungen: Benutzer buchen nur in der App (Quelle app, „in Lexware noch buchen“); Betrag, Quelle und Abgleich
-- ändern sie nicht. Verbinden mit der Zahlungsbestätigung nur über deren Funktion. Danach Zahlungsstand neu.
create function app.zahlung_regeln() returns trigger
language plpgsql set search_path = '' as $$
begin
  if auth.uid() is not null then
    if tg_op = 'INSERT' then
      new.quelle := 'app';
      new.lex_abgleich := 'offen';
      new.lexware_id := null;
      new.lexware_art := null;
      new.zahlungsbestaetigung_id := null;
    else
      if (to_jsonb(new) - array['zahlungsbestaetigung_id', 'deleted_at', 'deleted_by', 'updated_at', 'updated_by'])
         is distinct from (to_jsonb(old) - array['zahlungsbestaetigung_id', 'deleted_at', 'deleted_by', 'updated_at', 'updated_by']) then
        raise exception 'Zahlungen lassen sich nicht ändern.' using errcode = '42501';
      end if;
      if new.zahlungsbestaetigung_id is distinct from old.zahlungsbestaetigung_id
         and (old.zahlungsbestaetigung_id is not null or coalesce(current_setting('app.beleg_vorgang', true), '') <> 'zahlung') then
        raise exception 'Die Zahlungsbestätigung entsteht über „Zahlungsbestätigung erstellen“.' using errcode = '42501';
      end if;
      if new.deleted_at is not null and old.deleted_at is null
         and (old.quelle <> 'app' or old.lex_abgleich <> 'offen' or old.zahlungsbestaetigung_id is not null) then
        raise exception 'Nur eigene, noch nicht abgeglichene Zahlungen ohne Zahlungsbestätigung lassen sich entfernen.' using errcode = '42501';
      end if;
    end if;
  end if;
  return new;
end $$;
create trigger zahlung_regeln before insert or update on public.zahlung
  for each row execute function app.zahlung_regeln();

create function app.zahlung_danach() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform app.zahlstand(coalesce(new.beleg_id, old.beleg_id));
  return null;
end $$;
create trigger zahlung_danach after insert or update on public.zahlung
  for each row execute function app.zahlung_danach();

-- ---------------------------------------------------------------------------------------------------------------------
-- Zahlungsbestätigung zu einer Zahlung (höchstens eine): App-Beleg ohne Positionen und ohne Umsatzsteuer
-- ---------------------------------------------------------------------------------------------------------------------
create function public.zahlungsbestaetigung_erstellen(p_zahlung uuid) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  v_z public.zahlung;
  v_r public.beleg;
  v_id uuid;
begin
  perform set_config('app.beleg_vorgang', 'zahlung', true);
  select * into v_z from public.zahlung where id = p_zahlung and deleted_at is null for update;
  if v_z.id is null then
    raise exception 'Zahlung nicht gefunden' using errcode = 'P0002';
  end if;
  if v_z.zahlungsbestaetigung_id is not null then
    raise exception 'Zu dieser Zahlung gibt es schon eine Zahlungsbestätigung.' using errcode = '23505';
  end if;
  select * into v_r from public.beleg where id = v_z.beleg_id and deleted_at is null;
  if v_r.id is null or v_r.art not in ('rechnung', 'abschlagsrechnung') or v_r.status = 'entwurf' then
    raise exception 'Eine Zahlungsbestätigung gehört zu einer Rechnung oder Abschlagsrechnung.' using errcode = '23514';
  end if;
  insert into public.beleg (art, vorgaenger_id, auftrag_id, ticket_id, kunde_id, adresse_name, adresse_zusatz, adresse_strasse,
                            adresse_plz, adresse_ort, adresse_land, kundennummer, datum, titel, bauvorhaben, objekt,
                            steuerart, summe_netto, summe_brutto)
  values ('zahlungsbestaetigung', v_r.id, v_r.auftrag_id, v_r.ticket_id, v_r.kunde_id, v_r.adresse_name, v_r.adresse_zusatz, v_r.adresse_strasse,
          v_r.adresse_plz, v_r.adresse_ort, v_r.adresse_land, v_r.kundennummer, (now() at time zone 'Europe/Berlin')::date,
          'Zahlungsbestätigung', v_r.bauvorhaben, v_r.objekt, v_r.steuerart, v_z.betrag, v_z.betrag)
  returning id into v_id;
  update public.zahlung set zahlungsbestaetigung_id = v_id where id = p_zahlung;
  return v_id;
end $$;

-- ---------------------------------------------------------------------------------------------------------------------
-- „Als bezahlt markieren“: App-Buchung (Bar, Karte, Überweisung …), Teilzahlung möglich; optional mit Bestätigung
-- ---------------------------------------------------------------------------------------------------------------------
create function public.zahlung_erfassen(p_beleg uuid, p_datum date, p_betrag numeric, p_zahlungsart text, p_bestaetigung boolean)
returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  v_b public.beleg;
  v_zid uuid;
  v_zb uuid;
begin
  select * into v_b from public.beleg where id = p_beleg and deleted_at is null for update;
  if v_b.id is null then
    raise exception 'Beleg nicht gefunden' using errcode = 'P0002';
  end if;
  if v_b.art not in ('rechnung', 'abschlagsrechnung') or v_b.status <> 'offen' then
    raise exception 'Nur offene Rechnungen und Abschlagsrechnungen lassen sich als bezahlt markieren.' using errcode = '23514';
  end if;
  if p_betrag is null or p_betrag <= 0 then
    raise exception 'Bitte einen Betrag über 0 € angeben.' using errcode = '23514';
  end if;
  if p_betrag > coalesce(v_b.offen_betrag, v_b.summe_brutto) then
    raise exception 'Der Betrag ist höher als der offene Betrag.' using errcode = '23514';
  end if;
  if p_datum is null or p_datum > (now() at time zone 'Europe/Berlin')::date then
    raise exception 'Bitte ein Datum bis heute angeben.' using errcode = '23514';
  end if;
  insert into public.zahlung (beleg_id, datum, betrag, zahlungsart, quelle)
  values (p_beleg, p_datum, round(p_betrag, 2), p_zahlungsart, 'app')
  returning id into v_zid;
  if p_bestaetigung then
    v_zb := public.zahlungsbestaetigung_erstellen(v_zid);
  end if;
  return jsonb_build_object('zahlung_id', v_zid, 'zahlungsbestaetigung_id', v_zb);
end $$;

-- ---------------------------------------------------------------------------------------------------------------------
-- Server: Zahlungsstand aus Lexware übernehmen. p_daten = {offen, status, posten: [{schluessel, art, datum, betrag}]}
-- Geldeingänge werden zu Zahlungen (passende App-Buchung wird abgeglichen statt doppelt gezählt); Gutschriften und
-- andere Verrechnungen ändern nur den offenen Betrag.
-- ---------------------------------------------------------------------------------------------------------------------
create function public.lexware_zahlungen(p_beleg uuid, p_benutzer uuid, p_daten jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_b public.beleg;
  v_p jsonb;
  v_app uuid;
begin
  perform set_config('app.im_namen_von', coalesce(p_benutzer::text, ''), true);
  select * into v_b from public.beleg where id = p_beleg and lexware_id is not null and status <> 'entwurf' for update;
  if v_b.id is null then
    return;
  end if;
  for v_p in select * from jsonb_array_elements(coalesce(p_daten -> 'posten', '[]'::jsonb)) loop
    continue when exists (select 1 from public.zahlung where lexware_id = v_p ->> 'schluessel');
    select z.id into v_app from public.zahlung z
     where z.beleg_id = p_beleg and z.quelle = 'app' and z.lex_abgleich = 'offen' and z.deleted_at is null
       and z.betrag = (v_p ->> 'betrag')::numeric
     order by abs(z.datum - (v_p ->> 'datum')::date), z.created_at
     limit 1;
    if v_app is not null then
      update public.zahlung set lex_abgleich = 'abgeglichen', lexware_id = v_p ->> 'schluessel', lexware_art = v_p ->> 'art'
       where id = v_app;
    else
      insert into public.zahlung (beleg_id, datum, betrag, zahlungsart, quelle, lex_abgleich, lexware_id, lexware_art)
      values (p_beleg, (v_p ->> 'datum')::date, (v_p ->> 'betrag')::numeric, 'ueberweisung', 'lexware', 'abgeglichen',
              v_p ->> 'schluessel', v_p ->> 'art');
    end if;
  end loop;
  if v_b.art = 'gutschrift' then
    update public.beleg set
      lexware_offen = (p_daten ->> 'offen')::numeric,
      offen_betrag = (p_daten ->> 'offen')::numeric,
      status = case when p_daten ->> 'status' in ('paid', 'paidoff') then 'bezahlt' else 'offen' end
     where id = p_beleg;
  else
    update public.beleg set lexware_offen = (p_daten ->> 'offen')::numeric where id = p_beleg;
    perform app.zahlstand(p_beleg);
  end if;
end $$;
comment on function public.lexware_zahlungen(uuid, uuid, jsonb) is 'Server: Zahlungsstand eines Belegs aus Lexware übernehmen';

-- Server: Abgleich beginnen (höchstens alle p_abstand); gibt den vorigen Zeitpunkt zurück bzw. null, wenn zu früh
create function public.lexware_abgleich_beginnen(p_abstand interval) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_vorher timestamptz;
begin
  select lexware_zahlung_abgleich_am into v_vorher from public.einstellung for update;
  if v_vorher is not null and v_vorher > now() - p_abstand then
    return jsonb_build_object('starten', false);
  end if;
  update public.einstellung set lexware_zahlung_abgleich_am = now();
  return jsonb_build_object('starten', true, 'vorher', v_vorher);
end $$;

revoke execute on function public.lexware_zahlungen(uuid, uuid, jsonb), public.lexware_abgleich_beginnen(interval)
  from public, anon, authenticated;
grant execute on function public.lexware_zahlungen(uuid, uuid, jsonb), public.lexware_abgleich_beginnen(interval) to service_role;
revoke execute on function public.zahlung_erfassen(uuid, date, numeric, text, boolean), public.zahlungsbestaetigung_erstellen(uuid)
  from public, anon;
grant execute on function public.zahlung_erfassen(uuid, date, numeric, text, boolean), public.zahlungsbestaetigung_erstellen(uuid)
  to authenticated;
