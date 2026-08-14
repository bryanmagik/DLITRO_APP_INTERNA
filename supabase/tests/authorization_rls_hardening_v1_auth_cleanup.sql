-- Removes only the two deterministic synthetic Auth identities used by v1 tests.
-- public.usuarios rows are removed by the existing ON DELETE CASCADE foreign key.
delete from auth.users
where email in (
  'rls-v1-a@suscxwjloggmbsqdlgpj.test',
  'rls-v1-b@suscxwjloggmbsqdlgpj.test'
);
