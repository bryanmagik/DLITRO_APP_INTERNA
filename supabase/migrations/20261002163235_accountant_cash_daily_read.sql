-- Accounting already reads shifts/cash across branches. Missing reference and
-- settlement reads hid branch names and excluded dispatcher costs from cash.
-- Reuse existing SELECT policies; do not grant management or audit privileges.
insert into private.role_permissions (role, permission)
values
  ('contador_rrhh', 'branches.read'),
  ('contador_rrhh', 'dispatcher_payments.read')
on conflict (role, permission) do nothing;
