-- MANUAL EMERGENCY ROLLBACK for 20260818160154_p0c_recetas_anon_lockdown.sql.
--
-- This is NOT a migration. Do not place it in supabase/migrations/ and do not let
-- any automated tool (`supabase db push`, CI, etc.) apply it. It exists only to be
-- run by hand against production (uwymxjmyasnlmkitzvej) if the P0-C hotfix causes
-- an unexpected regression.
--
-- Restores EXACTLY the grants that existed immediately before P0-C (confirmed by
-- the same precheck snapshot used to write the hotfix): anon held DELETE, INSERT,
-- REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.recetas. REFERENCES and
-- TRIGGER were never touched by the hotfix, so they are not part of this rollback.
--
-- Using this rollback re-opens the exposure the hotfix was meant to close:
-- unauthenticated read/write and TRUNCATE on public.recetas. Only run it if the
-- hotfix itself is confirmed to be causing a worse operational problem than the
-- exposure it closes.

grant select, insert, update, delete, truncate on public.recetas to anon;
