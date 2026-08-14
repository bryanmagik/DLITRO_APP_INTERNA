-- Registra ajustes al costo calculado de despacho al crear un pedido.
-- No agrega pasos al flujo de toma de pedidos.

ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS costo_despacho_calculado INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'pedidos_costo_despacho_calculado_no_negativo'
      AND conrelid = 'public.pedidos'::regclass
  ) THEN
    ALTER TABLE public.pedidos
      ADD CONSTRAINT pedidos_costo_despacho_calculado_no_negativo
      CHECK (costo_despacho_calculado IS NULL OR costo_despacho_calculado >= 0)
      NOT VALID;
  END IF;
END $$;

ALTER TABLE public.pedidos
  VALIDATE CONSTRAINT pedidos_costo_despacho_calculado_no_negativo;

CREATE TABLE IF NOT EXISTS public.pedidos_despacho_ajustes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id UUID NOT NULL,
  numero_pedido INTEGER,
  turno_id UUID NOT NULL,
  sucursal_id UUID NOT NULL,
  usuario_id UUID REFERENCES public.usuarios(id),
  operacion TEXT NOT NULL CHECK (operacion IN ('ajustado_al_crear', 'modificado_posteriormente')),
  distancia_km NUMERIC,
  costo_calculado INTEGER NOT NULL CHECK (costo_calculado >= 0),
  costo_anterior INTEGER,
  costo_cobrado INTEGER NOT NULL CHECK (costo_cobrado >= 0),
  diferencia INTEGER GENERATED ALWAYS AS (costo_cobrado - costo_calculado) STORED,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.pedidos_despacho_ajustes ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.pedidos_despacho_ajustes FROM anon;
REVOKE ALL ON TABLE public.pedidos_despacho_ajustes FROM authenticated;
GRANT SELECT ON TABLE public.pedidos_despacho_ajustes TO authenticated;
GRANT ALL ON TABLE public.pedidos_despacho_ajustes TO service_role;

CREATE INDEX IF NOT EXISTS idx_pedidos_despacho_ajustes_changed_at
  ON public.pedidos_despacho_ajustes (changed_at DESC);

CREATE INDEX IF NOT EXISTS idx_pedidos_despacho_ajustes_pedido_id
  ON public.pedidos_despacho_ajustes (pedido_id);

CREATE INDEX IF NOT EXISTS idx_pedidos_despacho_ajustes_usuario_id
  ON public.pedidos_despacho_ajustes (usuario_id);

DROP POLICY IF EXISTS pedidos_despacho_ajustes_admin_select
  ON public.pedidos_despacho_ajustes;
CREATE POLICY pedidos_despacho_ajustes_admin_select
  ON public.pedidos_despacho_ajustes
  FOR SELECT
  TO authenticated
  USING ((SELECT public.is_admin((SELECT auth.uid()))));

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.calcular_y_auditar_costo_despacho()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  costo_esperado INTEGER := 0;
  actor_id UUID := (SELECT auth.uid());
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.tipo IN ('despacho', 'delivery') THEN
      IF NEW.distancia_km IS NOT NULL AND NEW.distancia_km > 0 THEN
        SELECT td.precio
        INTO costo_esperado
        FROM public.tarifas_despacho td
        WHERE NEW.distancia_km >= td.distancia_desde
          AND NEW.distancia_km <= td.distancia_hasta
        ORDER BY td.tramo
        LIMIT 1;

        IF costo_esperado IS NULL THEN
          SELECT td.precio
          INTO costo_esperado
          FROM public.tarifas_despacho td
          ORDER BY td.tramo DESC
          LIMIT 1;
        END IF;

        costo_esperado := COALESCE(
          costo_esperado,
          public.calcular_costo_despacho(NEW.distancia_km),
          0
        );
      END IF;

      NEW.costo_despacho_calculado := costo_esperado;
    ELSE
      NEW.costo_despacho_calculado := NULL;
    END IF;

    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.calcular_y_auditar_costo_despacho()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_calcular_costo_despacho_pedido ON public.pedidos;
CREATE TRIGGER trg_calcular_costo_despacho_pedido
  BEFORE INSERT ON public.pedidos
  FOR EACH ROW
  EXECUTE FUNCTION private.calcular_y_auditar_costo_despacho();

CREATE OR REPLACE FUNCTION private.registrar_ajuste_costo_despacho()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_id UUID := COALESCE((SELECT auth.uid()), NEW.tomador_id);
BEGIN
  IF TG_OP = 'INSERT'
     AND NEW.tipo IN ('despacho', 'delivery')
     AND NEW.costo_despacho_calculado IS DISTINCT FROM COALESCE(NEW.costo_despacho, 0) THEN
    INSERT INTO public.pedidos_despacho_ajustes (
      pedido_id, numero_pedido, turno_id, sucursal_id, usuario_id,
      operacion, distancia_km, costo_calculado, costo_anterior, costo_cobrado
    ) VALUES (
      NEW.id, NEW.numero_pedido, NEW.turno_id, NEW.sucursal_id, actor_id,
      'ajustado_al_crear', NEW.distancia_km, NEW.costo_despacho_calculado,
      NULL, COALESCE(NEW.costo_despacho, 0)
    );
  ELSIF TG_OP = 'UPDATE'
        AND NEW.costo_despacho IS DISTINCT FROM OLD.costo_despacho THEN
    INSERT INTO public.pedidos_despacho_ajustes (
      pedido_id, numero_pedido, turno_id, sucursal_id, usuario_id,
      operacion, distancia_km, costo_calculado, costo_anterior, costo_cobrado
    ) VALUES (
      NEW.id, NEW.numero_pedido, NEW.turno_id, NEW.sucursal_id, actor_id,
      'modificado_posteriormente', NEW.distancia_km,
      COALESCE(NEW.costo_despacho_calculado, OLD.costo_despacho_calculado, 0),
      COALESCE(OLD.costo_despacho, 0), COALESCE(NEW.costo_despacho, 0)
    );
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.registrar_ajuste_costo_despacho()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_registrar_ajuste_costo_despacho ON public.pedidos;
CREATE TRIGGER trg_registrar_ajuste_costo_despacho
  AFTER INSERT OR UPDATE OF costo_despacho ON public.pedidos
  FOR EACH ROW
  EXECUTE FUNCTION private.registrar_ajuste_costo_despacho();
