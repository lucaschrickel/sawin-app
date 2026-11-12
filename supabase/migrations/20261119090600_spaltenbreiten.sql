-- Spaltenbreiten je Benutzer (Positionstabelle im Beleg-Editor, ziehbar wie in Excel): { "<tabelle>": { "<spalte>": px } }.
-- Die Zeile gehört dem Benutzer (bestehende RLS-Policies von benutzer_einstellung).
alter table public.benutzer_einstellung add column spaltenbreiten jsonb not null default '{}'::jsonb;
comment on column public.benutzer_einstellung.spaltenbreiten is 'Gezogene Spaltenbreiten je Tabelle und Spalte (px), je Benutzer';
