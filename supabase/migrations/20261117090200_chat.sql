-- Chat je Auftrag und Ticket (CLAUDE.md „Chat“): Nachrichten, Erwähnungen mit @Kürzel (Benachrichtigung), Fotos,
-- ungelesene Nachrichten je Auftrag/Ticket. Tabellen chat_nachricht, chat_gelesen, benachrichtigung bestehen seit
-- planung_arbeit. Fotos liegen im privaten Speicher chat-fotos (ohne Benutzer-Policies: hochladen nur über eine
-- signierte Adresse vom Server, anzeigen nur über signierte Adressen vom Server) und zusätzlich in OneDrive.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chat-fotos', 'chat-fotos', false, 15728640, array['image/jpeg', 'image/png', 'image/heic', 'image/heif'])
on conflict (id) do nothing;

create index if not exists chat_nachricht_auftrag on public.chat_nachricht (auftrag_id, created_at) where auftrag_id is not null;
create index if not exists chat_nachricht_ticket on public.chat_nachricht (ticket_id, created_at) where ticket_id is not null;
create unique index chat_nachricht_foto on public.chat_nachricht (foto_pfad) where foto_pfad is not null;

-- Nachrichten werden nicht bearbeitet; ändern dürfen Benutzer nur das Löschen (über app.loeschen, nur eigene)
drop policy aendern on public.chat_nachricht;
create policy aendern on public.chat_nachricht for update to authenticated using (false) with check (false);

-- Text höchstens 4000 Zeichen; Erwähnungen nur an aktive Benutzer setzt der Server, Benutzer schreiben nur für sich
alter table public.chat_nachricht add constraint chat_nachricht_text_laenge check (length(text) <= 4000);

-- ---------------------------------------------------------------------------------------------------------------------
-- Ungelesene Nachrichten des angemeldeten Benutzers je Auftrag bzw. Ticket (eigene zählen nie)
-- ---------------------------------------------------------------------------------------------------------------------
create function public.chat_ungelesen() returns table (auftrag_id uuid, ticket_id uuid, anzahl integer)
language sql stable security invoker set search_path = '' as $$
  select n.auftrag_id, n.ticket_id, count(*)::integer
    from public.chat_nachricht n
   where n.autor_id <> (select auth.uid())
     and not exists (select 1 from public.chat_gelesen g where g.nachricht_id = n.id and g.benutzer_id = (select auth.uid()))
   group by n.auftrag_id, n.ticket_id
$$;
revoke execute on function public.chat_ungelesen() from public, anon;
grant execute on function public.chat_ungelesen() to authenticated;

-- Alle Nachrichten eines Auftrags bzw. Tickets als gelesen markieren (beim Öffnen des Reiters); Anzahl zurück
create function public.chat_gelesen_setzen(p_auftrag uuid, p_ticket uuid) returns integer
language plpgsql security invoker set search_path = '' as $$
declare
  v_anzahl integer;
begin
  if not app.ist_benutzer() then
    raise exception 'Keine Berechtigung' using errcode = '42501';
  end if;
  if num_nonnulls(p_auftrag, p_ticket) <> 1 then
    raise exception 'Genau ein Auftrag oder Ticket' using errcode = '22023';
  end if;
  insert into public.chat_gelesen (nachricht_id, benutzer_id)
  select n.id, (select auth.uid())
    from public.chat_nachricht n
   where (n.auftrag_id = p_auftrag or n.ticket_id = p_ticket)
     and n.autor_id <> (select auth.uid())
     and not exists (select 1 from public.chat_gelesen g where g.nachricht_id = n.id and g.benutzer_id = (select auth.uid()))
  on conflict (nachricht_id, benutzer_id) where deleted_at is null do nothing;
  get diagnostics v_anzahl = row_count;
  return v_anzahl;
end $$;
revoke execute on function public.chat_gelesen_setzen(uuid, uuid) from public, anon;
grant execute on function public.chat_gelesen_setzen(uuid, uuid) to authenticated;
