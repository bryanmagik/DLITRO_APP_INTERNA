-- Pure date calculation required by trg_set_fecha_dlitro during turno INSERT.
revoke all on function public.get_dlitro_day(timestamptz) from public, anon, authenticated;
grant execute on function public.get_dlitro_day(timestamptz) to authenticated;
