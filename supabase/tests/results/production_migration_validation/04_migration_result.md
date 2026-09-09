# Migration application result — second validation attempt (schema-reconstructed branch)

Branch: `rls-v2-prod-validation-2` (project_ref `ltsswsugyqsjaogfeetj`, deleted after this session).

Migration file applied: `20260818132354_rls_v2_production_specific.sql`, unmodified
(md5 verified identical to the repo copy before and after application).

Applied via `supabase db query --linked --project-ref ltsswsugyqsjaogfeetj -f <file>`
(same mechanism as production hotfixes, not `db push`). Result: 0 errors, empty row
set (expected for a pure-DDL/DML script whose only `SELECT`-shaped output would be
from a failed invariant — none fired).

## Verification query result (all checks except one)

```json
{
  "tables_total": 41,
  "tables_with_rls": 41,
  "legacy_policies_remaining": 0,
  "v2_policies_created": 83,
  "role_permissions_rows": 238,
  "role_permissions_roles": 9,
  "private_helpers_present": 8,
  "private_legacy_preserved": 4,
  "anon_grants_remaining": 0,
  "authenticated_truncate_remaining": 0,
  "storage_v2_policies": 4,
  "storage_legacy_remaining": 0,
  "get_turno_abierto_anon": true,
  "is_admin_untouched_semantics": true
}
```

Every check passed except `get_turno_abierto_anon`, which should have been `false`.

## Root cause (confirmed against real production, read-only)

`information_schema.routine_privileges` on **production** shows
`public.get_turno_abierto(uuid)` granted to `PUBLIC`, `postgres`, `authenticated`,
and `anon`. The migration's `revoke execute on function
public.get_turno_abierto(uuid) from anon;` only removes the `anon`-specific grant.
Because `anon` (like every role) implicitly inherits whatever `PUBLIC` holds, the
`PUBLIC` grant keeps the function callable by `anon` regardless. This is a real,
confirmed characteristic of production, not a validation-environment artifact —
verified with a live, read-only query against `uwymxjmyasnlmkitzvej`.

**Classification: MIGRATION BUG.** The fix (not yet applied anywhere) is to also
revoke from `PUBLIC`:

```sql
revoke execute on function public.get_turno_abierto(uuid) from public;
```

No other object touched by this migration carries a `PUBLIC` grant on production
(confirmed for `is_admin`/`is_superadmin`/`get_user_rol`/`get_user_sucursal` via the
same live query — only `service_role`/`authenticated`/`postgres`, no `PUBLIC`, no
`anon`). This appears to be specific to `get_turno_abierto`.
