DELETE FROM public.inventario_cierre a
USING public.inventario_cierre b
WHERE a.ctid < b.ctid
  AND a.turno_id = b.turno_id
  AND a.insumo_id = b.insumo_id;

ALTER TABLE public.inventario_cierre
  ADD CONSTRAINT inventario_cierre_turno_insumo_unique UNIQUE (turno_id, insumo_id);