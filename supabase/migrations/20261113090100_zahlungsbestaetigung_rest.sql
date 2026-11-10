-- Zahlungsbestätigung: Restbetrag der Rechnung zum Zeitpunkt der Bestätigung am Beleg speichern (offen_betrag der ZB)
create or replace function public.zahlungsbestaetigung_erstellen(p_zahlung uuid) returns uuid
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
  -- Restbetrag der Rechnung zum Zeitpunkt der Bestätigung (steht auf dem PDF)
  update public.beleg set offen_betrag = coalesce(v_r.offen_betrag, v_r.summe_brutto) where id = v_id;
  update public.zahlung set zahlungsbestaetigung_id = v_id where id = p_zahlung;
  return v_id;
end $$;
