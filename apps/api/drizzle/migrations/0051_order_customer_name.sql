-- Nome digitado no pedido do painel (balcão, mesa, encomenda) quando o cliente não tem cadastro:
-- antes o campo existia na tela, mas a API descartava e a Agenda mostrava só "Cliente".
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_name varchar(255);
