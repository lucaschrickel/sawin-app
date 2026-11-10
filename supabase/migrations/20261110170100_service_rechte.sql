-- Die Trigger-Hilfsfunktionen des Service-Moduls laufen auch für Server-Prozesse (Service-Rolle, z. B. Datenübernahme)
grant execute on function app.naechster_montag(), app.hat_aktiven_einsatz(uuid) to service_role;
