-- App do garçom: quantas pessoas sentaram na comanda e quando o garçom pediu a conta (o caixa vê na mesa).
ALTER TABLE comandas ADD COLUMN IF NOT EXISTS guests_count smallint;
ALTER TABLE comandas ADD COLUMN IF NOT EXISTS bill_requested_at timestamptz;
