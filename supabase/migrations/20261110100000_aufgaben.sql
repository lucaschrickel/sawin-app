-- =====================================================================================================================
-- Modul Aufgaben: Bezug zu Kunde, Anfrage, Auftrag oder Ticket (höchstens einer), Zeitpunkt „erledigt“
-- Entscheidung 10.11.2026: Aufgaben hängen optional an Kunde, Anfrage, Auftrag oder Service-Ticket.
-- =====================================================================================================================

alter table public.aufgabe
  add column kunde_id uuid references public.kunde (id),
  add column anfrage_id uuid references public.anfrage (id),
  add column erledigt_am timestamptz;
alter table public.aufgabe drop constraint aufgabe_check;
alter table public.aufgabe add constraint aufgabe_bezug check (num_nonnulls(kunde_id, anfrage_id, auftrag_id, ticket_id) <= 1);
create index aufgabe_kunde_id_idx on public.aufgabe (kunde_id);
create index aufgabe_anfrage_id_idx on public.aufgabe (anfrage_id);
create index aufgabe_offen_idx on public.aufgabe (zustaendig_id, faellig) where status <> 'erledigt' and deleted_at is null;
comment on column public.aufgabe.erledigt_am is 'Zeitpunkt des Abhakens (setzt der Trigger beim Status „erledigt“)';

create function app.aufgabe_erledigt() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.status = 'erledigt' and (tg_op = 'INSERT' or old.status is distinct from 'erledigt') then
    new.erledigt_am := now();
  elsif new.status <> 'erledigt' then
    new.erledigt_am := null;
  else
    new.erledigt_am := old.erledigt_am;
  end if;
  return new;
end $$;
create trigger aufgabe_erledigt before insert or update on public.aufgabe
  for each row execute function app.aufgabe_erledigt();
