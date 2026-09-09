# RLS v2 production-specific migration — fix + revalidation round

Follow-up to `supabase/tests/results/production_migration_validation/` (first
round, which found the two bugs fixed here). This folder's evidence is from a
**third** temporary branch (`rls-v2-prod-validation-3`, project_ref
`naixgiyixkivgbewgigw`), created fresh and deleted at the end of this session —
not a reuse of either branch from the first round.

## Methodology note: a third fidelity issue found and fixed during this round

While reconstructing the branch's schema (same catalog-introspection procedure
as the first round, since `pg_dump`/Docker/psql remain unavailable in this
environment), every table and every recreated function came out with far
broader `anon`/`authenticated` grants than production actually has, and
`anon`/`PUBLIC` execute grants on `is_admin`/`is_superadmin`/`get_user_rol`/
`get_user_sucursal` that production does not have either.

Root cause: `pg_default_acl` on this Supabase project has entries for role
`postgres` in schema `public` that auto-grant full privileges (tables) /
EXECUTE (functions) to `anon`, `authenticated`, and `service_role` on any
newly created object — a standard Supabase provisioning default. My explicit,
narrower `GRANT` statements after each `CREATE TABLE`/`CREATE FUNCTION` only
*added* to that default, they never *removed* it, so the reconstruction ended
up wide open until this was diagnosed and each object's privileges were
explicitly revoked back to the exact pre-migration snapshot. This is a
property of the *validation environment's reconstruction procedure*, not of
production or of the migration — flagged here for anyone repeating this
procedure in a future round.

## Outcome

- `get_turno_abierto(uuid)` fix: confirmed working (anon and PUBLIC both DENY
  after the migration; authenticated/service_role unaffected).
- Rollback grants fix: confirmed working — PRE vs AFTER-ROLLBACK diff is 0
  across tables/RLS, policies, grants (all 83 rows, including the two views
  and the two previously over-restored tables), and storage policies.
- All 5 required suites re-run; 4/5 at 100%; the RPC suite's 3 remaining
  failures are the same, already-known, explicitly out-of-scope enumeration-
  oracle finding for `is_admin`/`get_user_rol`/`get_user_sucursal` (Fase 9 of
  this task — re-validated, not fixed, not new).
