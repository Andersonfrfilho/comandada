-- Quantas pessoas estão na comanda. O mapa e a grade de Mesas desenham as cadeiras da mesa
-- (capacidade) e destacam as ocupadas por esse número. Nulo = não informado.
ALTER TABLE comandas ADD COLUMN IF NOT EXISTS guests_count smallint;
