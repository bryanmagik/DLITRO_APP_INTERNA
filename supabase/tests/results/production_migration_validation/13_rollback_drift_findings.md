# Rollback drill — drift found comparing pre-migration snapshot vs post-rollback state

Branch: `rls-v2-prod-validation-2`. Rollback file applied: unmodified, md5-verified
(`20260818132354_rls_v2_production_specific_ROLLBACK.sql`).

Tables/RLS: 43/43 match, 0 diff. Policies: 58/58 match, 0 diff. Grants: **83 pre
vs 84 post — not a clean match.** Diff below.

## Finding 1 — ROLLBACK BUG: over-restoration on 3 tables that never held these grants

`despachos_manuales`, `despachos_manuales_cambios`, `pedidos_despacho_ajustes`
never had `TRUNCATE` for `authenticated`, and never had `REFERENCES`/`TRIGGER`
for `anon` (they had **no** anon grant at all pre-migration). The rollback file's
dynamic restore loops add `TRUNCATE` to authenticated and `REFERENCES,TRIGGER`
to anon on every table except a hardcoded 12-table exclude list — a list that
predates these three tables' actual grant history. Result: the rollback,
if ever run for real, would hand `anon` two privileges it never had on these
three tables, and hand `authenticated` a `TRUNCATE` it never had either.

**Classification: TEST/ROLLBACK-FILE BUG** (not a migration bug, not a live
production issue today — this only fires if the rollback file is ever executed).
Required fix: use a real pre-migration snapshot (already captured in this repo,
see `03_pre_migration_grants.json`) to restore exact grants per table instead of
a blanket loop with a hardcoded exclude list.

## Finding 2 — ROLLBACK BUG: views are silently skipped

`v_stock_bajo_minimo` and `v_ventas_dia` had full `anon`+`authenticated` grants
pre-migration. The rollback's restore loops select from `pg_tables`, which
excludes views by definition — so neither view's `anon` grant is restored at all,
and `authenticated` is left missing `TRUNCATE` on both (the other privileges
happen to survive only because the migration's own blanket
`grant ... on all tables in schema public to authenticated` — which *does*
include views in Postgres — was never revoked by the rollback).

**Classification: TEST/ROLLBACK-FILE BUG.** Required fix: union `pg_tables` with
`pg_views` (or just enumerate `information_schema.tables` including views) in
both restore loops.

## Finding 3 — NOT a rollback issue: `recetas` was missed by both P0-A and P0-B

While diffing, `recetas|anon` showed as "only in pre" with the **full** legacy
grant set (`DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE`). This was
re-verified with a direct, live, read-only query against real production
(`uwymxjmyasnlmkitzvej`) — confirmed accurate, not a reconstruction artifact:
`anon` holds all 7 privileges on `public.recetas` in production **right now**.

`recetas` was never in P0-A's 12-table list nor P0-B's 25-table list — a gap in
both prior hotfixes, surfaced only now by this rollback-state comparison.
`recetas` has RLS enabled with a policy scoped to `auth.role() = 'authenticated'`,
so SELECT/INSERT/UPDATE/DELETE by `anon` are blocked at the RLS layer — but
**TRUNCATE is never subject to RLS**, so `anon` can truncate `public.recetas`
in production today, unauthenticated.

**Classification: pre-existing, currently-live production gap** (a P0-class
issue, not caused by and not related to the RLS v2 migration's own correctness).
The RLS v2 production-specific migration under validation *would* close this as
a side effect (its grants section does `revoke all on all tables in schema
public from anon`), but production is exposed until that migration — or a
narrow follow-up hotfix mirroring P0-B for this one table — is actually applied.
