select routine_name, grantee, privilege_type from information_schema.routine_privileges
where routine_schema='public' and routine_name in ('is_admin','is_superadmin','get_user_rol','get_user_sucursal','get_turno_abierto')
order by routine_name, grantee;
