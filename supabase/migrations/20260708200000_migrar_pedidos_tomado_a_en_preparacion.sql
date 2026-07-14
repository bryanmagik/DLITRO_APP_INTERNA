-- Migrar pedidos legacy con estado 'tomado' a 'en_preparacion'
UPDATE pedidos
SET estado = 'en_preparacion'
WHERE estado = 'tomado';
