# Historical migrations — archive only

This directory preserves the complete pre-baseline migration history for audit and archaeology.

Do **not** execute these files when provisioning a new database. New installations must use only the sanitized baseline located in `supabase/migrations/`.

The archived SQL is intentionally preserved byte-for-byte. It contains historical ordering assumptions, data transformations, backfills, deduplication steps, and superseded authorization states that are not suitable for a clean installation.

This archive is not part of the active Supabase migration directory and must never be copied back into `supabase/migrations/` as part of an automated deployment.
