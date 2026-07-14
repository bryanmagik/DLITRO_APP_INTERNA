CREATE TABLE IF NOT EXISTS promociones_precio (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  producto_id UUID REFERENCES productos(id) NOT NULL,
  precio_promo INT NOT NULL,
  nombre TEXT,
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS promociones_precio_producto_activo_unique
  ON promociones_precio (producto_id)
  WHERE (activo = true);
