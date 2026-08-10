-- Asegura despachos manuales sin quitar la edición rápida del monto.
-- La auditoría se completa automáticamente; el usuario operativo no debe
-- ingresar comentarios ni realizar pasos adicionales.

REVOKE ALL ON TABLE public.despachos_manuales FROM anon;
REVOKE ALL ON TABLE public.despachos_manuales FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.despachos_manuales TO authenticated;
GRANT ALL ON TABLE public.despachos_manuales TO service_role;

ALTER TABLE public.despachos_manuales ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.despachos_manuales
  ADD COLUMN IF NOT EXISTS creado_por UUID REFERENCES public.usuarios(id),
  ADD COLUMN IF NOT EXISTS actualizado_por UUID REFERENCES public.usuarios(id),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'despachos_manuales_monto_positivo'
      AND conrelid = 'public.despachos_manuales'::regclass
  ) THEN
    ALTER TABLE public.despachos_manuales
      ADD CONSTRAINT despachos_manuales_monto_positivo CHECK (monto > 0) NOT VALID;
  END IF;
END $$;

ALTER TABLE public.despachos_manuales
  VALIDATE CONSTRAINT despachos_manuales_monto_positivo;

CREATE INDEX IF NOT EXISTS idx_despachos_manuales_creado_por
  ON public.despachos_manuales (creado_por);

CREATE INDEX IF NOT EXISTS idx_despachos_manuales_actualizado_por
  ON public.despachos_manuales (actualizado_por);

CREATE TABLE IF NOT EXISTS public.despachos_manuales_cambios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  despacho_id UUID NOT NULL,
  turno_id UUID NOT NULL,
  despachador_id UUID NOT NULL,
  usuario_id UUID REFERENCES public.usuarios(id),
  operacion TEXT NOT NULL CHECK (operacion IN ('creado', 'monto_modificado', 'eliminado')),
  concepto TEXT NOT NULL,
  monto_anterior INT,
  monto_nuevo INT,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.despachos_manuales_cambios ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.despachos_manuales_cambios FROM anon;
REVOKE ALL ON TABLE public.despachos_manuales_cambios FROM authenticated;
GRANT SELECT ON TABLE public.despachos_manuales_cambios TO authenticated;
GRANT ALL ON TABLE public.despachos_manuales_cambios TO service_role;

CREATE INDEX IF NOT EXISTS idx_despachos_manuales_cambios_changed_at
  ON public.despachos_manuales_cambios (changed_at DESC);

CREATE INDEX IF NOT EXISTS idx_despachos_manuales_cambios_despacho_id
  ON public.despachos_manuales_cambios (despacho_id);

CREATE INDEX IF NOT EXISTS idx_despachos_manuales_cambios_usuario_id
  ON public.despachos_manuales_cambios (usuario_id);

DROP POLICY IF EXISTS despachos_manuales_select_autorizado ON public.despachos_manuales;
CREATE POLICY despachos_manuales_select_autorizado
  ON public.despachos_manuales
  FOR SELECT
  TO authenticated
  USING (
    (SELECT public.is_admin((SELECT auth.uid())))
    OR (
      (SELECT public.get_user_rol((SELECT auth.uid()))) IN ('tomador_pedidos', 'encargado')
      AND EXISTS (
        SELECT 1
        FROM public.turnos t
        WHERE t.id = despachos_manuales.turno_id
          AND t.sucursal_id = (SELECT public.get_user_sucursal((SELECT auth.uid())))
      )
    )
  );

DROP POLICY IF EXISTS despachos_manuales_insert_autorizado ON public.despachos_manuales;
CREATE POLICY despachos_manuales_insert_autorizado
  ON public.despachos_manuales
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT public.is_admin((SELECT auth.uid())))
    OR (
      (SELECT public.get_user_rol((SELECT auth.uid()))) IN ('tomador_pedidos', 'encargado')
      AND EXISTS (
        SELECT 1
        FROM public.turnos t
        WHERE t.id = despachos_manuales.turno_id
          AND t.estado = 'abierto'
          AND t.sucursal_id = (SELECT public.get_user_sucursal((SELECT auth.uid())))
      )
    )
  );

DROP POLICY IF EXISTS despachos_manuales_update_autorizado ON public.despachos_manuales;
CREATE POLICY despachos_manuales_update_autorizado
  ON public.despachos_manuales
  FOR UPDATE
  TO authenticated
  USING (
    (SELECT public.is_admin((SELECT auth.uid())))
    OR (
      (SELECT public.get_user_rol((SELECT auth.uid()))) IN ('tomador_pedidos', 'encargado')
      AND EXISTS (
        SELECT 1
        FROM public.turnos t
        WHERE t.id = despachos_manuales.turno_id
          AND t.estado = 'abierto'
          AND t.sucursal_id = (SELECT public.get_user_sucursal((SELECT auth.uid())))
      )
    )
  )
  WITH CHECK (
    (SELECT public.is_admin((SELECT auth.uid())))
    OR (
      (SELECT public.get_user_rol((SELECT auth.uid()))) IN ('tomador_pedidos', 'encargado')
      AND EXISTS (
        SELECT 1
        FROM public.turnos t
        WHERE t.id = despachos_manuales.turno_id
          AND t.estado = 'abierto'
          AND t.sucursal_id = (SELECT public.get_user_sucursal((SELECT auth.uid())))
      )
    )
  );

DROP POLICY IF EXISTS despachos_manuales_delete_autorizado ON public.despachos_manuales;
CREATE POLICY despachos_manuales_delete_autorizado
  ON public.despachos_manuales
  FOR DELETE
  TO authenticated
  USING (
    (SELECT public.is_admin((SELECT auth.uid())))
    OR (
      (SELECT public.get_user_rol((SELECT auth.uid()))) IN ('tomador_pedidos', 'encargado')
      AND EXISTS (
        SELECT 1
        FROM public.turnos t
        WHERE t.id = despachos_manuales.turno_id
          AND t.estado = 'abierto'
          AND t.sucursal_id = (SELECT public.get_user_sucursal((SELECT auth.uid())))
      )
    )
  );

DROP POLICY IF EXISTS despachos_manuales_cambios_admin_select
  ON public.despachos_manuales_cambios;
CREATE POLICY despachos_manuales_cambios_admin_select
  ON public.despachos_manuales_cambios
  FOR SELECT
  TO authenticated
  USING ((SELECT public.is_admin((SELECT auth.uid()))));

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.preparar_despacho_manual()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.creado_por := (SELECT auth.uid());
    NEW.actualizado_por := (SELECT auth.uid());
    NEW.updated_at := now();
  ELSIF TG_OP = 'UPDATE' THEN
    NEW.creado_por := OLD.creado_por;
    NEW.actualizado_por := (SELECT auth.uid());
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.preparar_despacho_manual() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_preparar_despacho_manual ON public.despachos_manuales;
CREATE TRIGGER trg_preparar_despacho_manual
  BEFORE INSERT OR UPDATE ON public.despachos_manuales
  FOR EACH ROW
  EXECUTE FUNCTION private.preparar_despacho_manual();

CREATE OR REPLACE FUNCTION private.auditar_despacho_manual()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_id UUID := (SELECT auth.uid());
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.despachos_manuales_cambios (
      despacho_id, turno_id, despachador_id, usuario_id, operacion,
      concepto, monto_anterior, monto_nuevo
    ) VALUES (
      NEW.id, NEW.turno_id, NEW.despachador_id, actor_id, 'creado',
      NEW.concepto, NULL, NEW.monto
    );
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' AND NEW.monto IS DISTINCT FROM OLD.monto THEN
    INSERT INTO public.despachos_manuales_cambios (
      despacho_id, turno_id, despachador_id, usuario_id, operacion,
      concepto, monto_anterior, monto_nuevo
    ) VALUES (
      NEW.id, NEW.turno_id, NEW.despachador_id, actor_id, 'monto_modificado',
      NEW.concepto, OLD.monto, NEW.monto
    );
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.despachos_manuales_cambios (
      despacho_id, turno_id, despachador_id, usuario_id, operacion,
      concepto, monto_anterior, monto_nuevo
    ) VALUES (
      OLD.id, OLD.turno_id, OLD.despachador_id, actor_id, 'eliminado',
      OLD.concepto, OLD.monto, NULL
    );
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.auditar_despacho_manual() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_auditar_despacho_manual ON public.despachos_manuales;
CREATE TRIGGER trg_auditar_despacho_manual
  AFTER INSERT OR UPDATE OR DELETE ON public.despachos_manuales
  FOR EACH ROW
  EXECUTE FUNCTION private.auditar_despacho_manual();
