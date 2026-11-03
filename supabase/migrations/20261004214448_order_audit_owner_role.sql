-- Dedicated read-only business owner. No operational permissions are inherited.
alter type public.rol_usuario add value if not exists 'dueno_dlitro';
