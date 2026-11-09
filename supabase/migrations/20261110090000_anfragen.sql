-- =====================================================================================================================
-- Modul Anfragen: Zuständig = Benutzer, Kunde Pflicht, Auftrag anlegen (Übergang), Status- und Löschregeln
-- =====================================================================================================================

-- ---------------------------------------------------------------------------------------------------------------------
-- „Zuständig“ ist ein Benutzer (Büro), nicht ein Mitarbeiter (Entscheidung 10.11.2026). Tabellen sind noch leer.
-- ---------------------------------------------------------------------------------------------------------------------
alter table public.anfrage drop constraint anfrage_zustaendig_id_fkey,
  add constraint anfrage_zustaendig_id_fkey foreign key (zustaendig_id) references public.benutzer (id);
alter table public.aufgabe drop constraint aufgabe_zustaendig_id_fkey,
  add constraint aufgabe_zustaendig_id_fkey foreign key (zustaendig_id) references public.benutzer (id);
alter table public.auftrag drop constraint auftrag_zustaendig_id_fkey,
  add constraint auftrag_zustaendig_id_fkey foreign key (zustaendig_id) references public.benutzer (id);
alter table public.service_ticket drop constraint service_ticket_zustaendig_id_fkey,
  add constraint service_ticket_zustaendig_id_fkey foreign key (zustaendig_id) references public.benutzer (id);

-- Jede Anfrage gehört zu einem Kunden (ein neuer Interessent wird direkt als Kunde angelegt)
alter table public.anfrage alter column kunde_id set not null;

-- ---------------------------------------------------------------------------------------------------------------------
-- Status: ein Aufmaß-Termin stellt eine neue Anfrage auf „Aufmaß“. Archiv: gewonnen mit Auftrag bleibt gewonnen.
-- ---------------------------------------------------------------------------------------------------------------------
create function app.anfrage_regeln() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.aufmass_termin is not null and new.status = 'neu'
     and (tg_op = 'INSERT' or old.aufmass_termin is distinct from new.aufmass_termin) then
    new.status := 'aufmass';
  end if;
  if new.archiv is distinct from coalesce(old.archiv, null) then
    new.archiviert_am := case when new.archiv is null then null else now() end;
  end if;
  if tg_op = 'UPDATE' and old.archiv = 'gewonnen' and new.archiv is distinct from 'gewonnen'
     and exists (select 1 from public.auftrag a where a.anfrage_id = old.id and a.deleted_at is null) then
    raise exception 'Die Anfrage ist gewonnen und hat einen Auftrag. Sie lässt sich nicht zurücksetzen.' using errcode = 'P0001';
  end if;
  if new.archiv is distinct from 'verloren' then
    new.verlust_grund := null;
  end if;
  return new;
end $$;
create trigger anfrage_regeln before insert or update on public.anfrage
  for each row execute function app.anfrage_regeln();

-- Löschen (Markierung) nur ohne Auftrag und ohne Belege
create function app.anfrage_loeschen_pruefen() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_teile text[] := '{}';
begin
  if new.deleted_at is null or old.deleted_at is not null then
    return new;
  end if;
  if exists (select 1 from public.auftrag where anfrage_id = old.id and deleted_at is null) then v_teile := array_append(v_teile, 'einen Auftrag'); end if;
  if exists (select 1 from public.beleg where anfrage_id = old.id and deleted_at is null) then v_teile := array_append(v_teile, 'Belege'); end if;
  if cardinality(v_teile) > 0 then
    raise exception 'Die Anfrage hat %. Sie kann deshalb nicht gelöscht werden.', array_to_string(v_teile, ' und ')
      using errcode = '23503';
  end if;
  return new;
end $$;
create trigger loeschen_pruefen before update on public.anfrage
  for each row execute function app.anfrage_loeschen_pruefen();

-- ---------------------------------------------------------------------------------------------------------------------
-- Übergang bis zum Beleg-Modul: „Gewonnen – Auftrag anlegen“. Der Auftrag bekommt seine Nummer aus dem AB-Nummernkreis;
-- die spätere AB dieses Auftrags übernimmt genau diese Nummer (Auftragsnummer = AB-Nummer). SECURITY INVOKER: RLS und
-- Audit-Log gelten für den Benutzer.
-- ---------------------------------------------------------------------------------------------------------------------
create function public.anfrage_auftrag_anlegen(p_anfrage_id uuid) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  v_q public.anfrage;
  v_auftrag uuid;
begin
  select * into v_q from public.anfrage where id = p_anfrage_id for update;
  if not found then
    raise exception 'Anfrage nicht gefunden' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.auftrag where anfrage_id = p_anfrage_id and deleted_at is null) then
    raise exception 'Zu dieser Anfrage gibt es schon einen Auftrag.' using errcode = '23505';
  end if;
  if v_q.archiv = 'verloren' then
    raise exception 'Die Anfrage ist als verloren archiviert.' using errcode = 'P0001';
  end if;
  insert into public.auftrag (nummer, kunde_id, anfrage_id, nachtrag_zu, titel, objekt, herkunft, zustaendig_id, produkte)
  values (app.naechste_nummer('auftragsbestaetigung'), v_q.kunde_id, v_q.id, v_q.nachtrag_zu, v_q.titel, v_q.objekt,
          v_q.herkunft, v_q.zustaendig_id, v_q.produkte)
  returning id into v_auftrag;
  update public.anfrage set archiv = 'gewonnen' where id = p_anfrage_id;
  return v_auftrag;
end $$;
comment on function public.anfrage_auftrag_anlegen(uuid) is 'Übergang bis zum Beleg-Modul: Auftrag aus gewonnener Anfrage, Nummer aus dem AB-Nummernkreis';
revoke execute on function public.anfrage_auftrag_anlegen(uuid) from public, anon;
grant execute on function public.anfrage_auftrag_anlegen(uuid) to authenticated;
