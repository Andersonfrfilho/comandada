-- App do garçom: quando o garçom pediu a conta da comanda (o caixa vê na mesa e é avisado).
-- `guests_count` já veio na 0056.
ALTER TABLE comandas ADD COLUMN IF NOT EXISTS bill_requested_at timestamptz;
