-- Übergang Lexware → App: Stichtag (Go-live-Datum). Ab diesem Tag entstehen Angebote, ABs und Lieferscheine nur noch in
-- der App. Die App prüft Lexware regelmäßig (nur lesend) auf solche Belege ab dem Stichtag und zeigt sie im Dashboard.
alter table public.einstellung
  add column golive_datum date,
  add column lexware_fremdbelege jsonb not null default '[]'::jsonb,
  add column lexware_fremdbelege_am timestamptz;
comment on column public.einstellung.golive_datum is 'Stichtag: ab hier Angebote, ABs und Lieferscheine nur in der App';
comment on column public.einstellung.lexware_fremdbelege is 'Lexware-Angebote, -ABs und -Lieferscheine ab dem Stichtag (nicht aus der App), zuletzt geprüft lexware_fremdbelege_am';
