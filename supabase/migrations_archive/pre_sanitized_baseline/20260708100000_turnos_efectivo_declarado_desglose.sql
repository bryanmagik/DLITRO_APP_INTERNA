ALTER TABLE turnos
ADD COLUMN IF NOT EXISTS efectivo_declarado_caja_chica INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS efectivo_declarado_sobre INT DEFAULT 0;
