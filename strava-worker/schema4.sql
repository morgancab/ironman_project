-- Suivi propriétaire : dernière visite et progression (séances faites / prévues) de chaque compte.
ALTER TABLE users ADD COLUMN last_seen INTEGER;
ALTER TABLE users ADD COLUMN prog_done INTEGER;
ALTER TABLE users ADD COLUMN prog_total INTEGER;
