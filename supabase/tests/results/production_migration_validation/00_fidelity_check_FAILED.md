# RLS v2 production-specific migration — validation attempt, 2026-08-18

## Outcome: BLOCKED at the fidelity check (Fase 3), before any SQL was applied.

## What was done

1. Confirmed parent project: `uwymxjmyasnlmkitzvej` (`main`, `is_default: true`).
2. Created a temporary, non-persistent Supabase preview branch from that parent:
   - name: `rls-v2-prod-validation`
   - project_ref: `rymmtoqhjtzjdshekqua`
   - parent_project_ref: `uwymxjmyasnlmkitzvej`
   - is_default: `false` (confirmed not `main`)
   - initial status after creation: `MIGRATIONS_FAILED`
3. Ran the same read-only fidelity queries used for the production snapshot
   (table existence + RLS/FORCE RLS state) against the new branch.

## Result

`select ... from pg_class ... where nspname='public' and relkind in ('r','v')`
returned **zero rows** on the new branch. A follow-up
`select schema_name from information_schema.schemata` confirmed only the
default Supabase system schemas exist (`auth`, `extensions`, `graphql`,
`net`, `pgbouncer`, `public`, `realtime`, `storage`, `supabase_functions`,
`supabase_migrations`, `vault`) — no custom types (`rol_usuario` enum),
no application tables, nothing from production's actual schema.

`supabase migration list --project-ref rymmtoqhjtzjdshekqua` showed every
migration file under the local `supabase/migrations/` folder with an empty
"Remote" column, i.e. none of them were applied either.

## Conclusion

This branch does **not** represent production in any usable way — it is an
empty, freshly-provisioned Postgres instance whose migration-replay step
failed early (consistent with the `MIGRATIONS_FAILED` status). It is not a
schema drift or a partial mismatch; there is no application schema at all.

Per the explicit STOP condition in this task's Fase 3 ("Si el clon ya
contiene RLS v2 o no representa correctamente producción: STOP"), validation
was halted here. The RLS v2 production-specific migration was **not**
applied to this branch or to production. No test suite was run. No rollback
drill was performed.

## Cleanup performed

The empty/failed branch was deleted (`supabase branches delete
rls-v2-prod-validation`) immediately after this diagnosis, because
`supabase branches get` was run once during this session and printed the
branch's full credential set (DB password, JWT secret, `service_role`,
`anon` key) into the tool output — an operational mistake, flagged to the
user at the time. Deleting the branch invalidates those credentials. No
credential value is recorded in this file or anywhere else in the repo.

Production (`uwymxjmyasnlmkitzvej`) was never written to during this
attempt — only read-only queries were run against it (via the same
temporary, read-only CLI link pattern used in prior sessions), and it was
not modified by creating or deleting a sibling preview branch.
