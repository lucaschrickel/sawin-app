-- =====================================================================================================================
-- Anfragen, Aufträge, Service-Tickets
-- Bestellstatus, Liefer-KW und aktuelle Pipeline-Stufe werden abgeleitet, nicht gespeichert.
-- =====================================================================================================================

create table public.anfrage (
  id uuid primary key default gen_random_uuid(),
  nummer text not null,
  titel text not null check (length(trim(titel)) > 0),
  kunde_id uuid references public.kunde (id),
  name text,
  telefon text,
  email text,
  objekt text,
  beschreibung text,
  herkunft text,
  produkte text[] not null default '{}',
  geschaetzter_wert numeric(12, 2),
  zustaendig_id uuid references public.mitarbeiter (id),
  wiedervorlage date,
  aufmass_termin timestamptz,
  notiz text,
  eingang date not null default current_date,
  status text not null default 'neu'
    check (status in ('neu', 'in_klaerung', 'aufmass', 'angebot_erstellen', 'angebot_versendet')),
  archiv text check (archiv in ('gewonnen', 'verloren')),
  verlust_grund text,
  archiviert_am timestamptz,
  nachtrag_zu uuid,
  like app.basis including defaults,
  check (archiv is distinct from 'verloren' or verlust_grund is not null)
);
comment on table public.anfrage is 'Anfragen, händisch erfasst. Ohne Bestandskunde mit Name/Telefon/E-Mail; der Kunde entsteht, sobald ein Angebot entsteht.';
comment on column public.anfrage.nachtrag_zu is 'Nachtragsanfrage: Verweis auf den Ursprungsauftrag';
create unique index anfrage_nummer_uk on public.anfrage (nummer);
select app.einrichten('anfrage', '(select app.ist_benutzer())', '(select app.ist_benutzer())');
create trigger nummer before insert or update on public.anfrage
  for each row execute function app.nummer_vergeben('anfrage');

create table public.auftrag (
  id uuid primary key default gen_random_uuid(),
  nummer text not null,
  kunde_id uuid not null references public.kunde (id),
  anfrage_id uuid references public.anfrage (id),
  nachtrag_zu uuid references public.auftrag (id),
  titel text not null default '',
  objekt text,
  phase text not null default 'bestellung'
    check (phase in ('bestellung', 'montage', 'abnahme', 'baustelle_fertig', 'reklamation', 'abgeschlossen')),
  montagestatus text not null default 'nicht_begonnen'
    check (montagestatus in ('nicht_begonnen', 'bereit', 'in_arbeit', 'teilweise_abgeschlossen', 'abgeschlossen')),
  herkunft text,
  zustaendig_id uuid references public.mitarbeiter (id),
  produkte text[] not null default '{}',
  bemerkung text,
  liefertermin date,
  noch_nicht_bestellt text,
  warten_auf_kunde boolean not null default false,
  stufe_lieferung_datum date,
  stufe_abschlag_datum date,
  stufe_warten_datum date,
  pruefhinweis text,
  onedrive_ordner text,
  abgeschlossen_am timestamptz,
  like app.basis including defaults
);
comment on table public.auftrag is 'Auftrag entsteht nur beim Fertigstellen der AB und übernimmt deren Nummer (Auftragsnummer = AB-Nummer).';
comment on column public.auftrag.pruefhinweis is 'Gesetzt von Datenübernahme oder Plausibilitätsprüfung, entfernt per „Geprüft, Hinweis entfernen“';
create unique index auftrag_nummer_uk on public.auftrag (nummer);
select app.einrichten('auftrag', '(select app.ist_benutzer())', '(select app.ist_benutzer())');

alter table public.anfrage add constraint anfrage_nachtrag_zu_fkey foreign key (nachtrag_zu) references public.auftrag (id);

-- Auftragsnummer ändert sich nie
create function app.auftrag_nummer_fest() returns trigger
language plpgsql set search_path = '' as $$
begin
  if auth.uid() is not null then
    new.nummer := old.nummer;
  end if;
  return new;
end $$;
create trigger nummer before update on public.auftrag
  for each row execute function app.auftrag_nummer_fest();

create table public.service_ticket (
  id uuid primary key default gen_random_uuid(),
  nummer text not null,
  kunde_id uuid not null references public.kunde (id),
  auftrag_id uuid references public.auftrag (id),
  thema text not null,
  art text not null default 'reparatur'
    check (art in ('reklamation', 'wartung', 'reparatur', 'einstellung', 'sonstiges')),
  abrechnung text not null default 'kostenpflichtig' check (abrechnung in ('garantie', 'kulanz', 'kostenpflichtig')),
  prioritaet text not null default 'normal' check (prioritaet in ('niedrig', 'normal', 'hoch')),
  problem text,
  wunschtermin date,
  vorab_datum date,
  zustaendig_id uuid references public.mitarbeiter (id),
  objekt text,
  status text not null default 'neu' check (status in ('neu', 'eingeplant', 'in_arbeit', 'erledigt', 'abgerechnet')),
  like app.basis including defaults
);
comment on column public.service_ticket.auftrag_id is 'Ursprungsauftrag (optional)';
comment on column public.service_ticket.vorab_datum is 'Tag in der Zeile „Terminierbar“ des Service-Plans, solange kein Termin besteht';
create unique index service_ticket_nummer_uk on public.service_ticket (nummer);
select app.einrichten('service_ticket', '(select app.ist_benutzer())', '(select app.ist_benutzer())');
create trigger nummer before insert or update on public.service_ticket
  for each row execute function app.nummer_vergeben('service_ticket');
