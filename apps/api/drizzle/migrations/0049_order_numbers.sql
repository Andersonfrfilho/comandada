-- Número curto do pedido (#123), igual no painel, na cozinha, nas entregas, nas notas e no WhatsApp.
-- Antes cada tela mostrava um pedaço do id (os pedidos do seed apareciam como "00000000") e o cliente
-- recebia outro código. Sequência por restaurante em `order_counters` (sem corrida entre pedidos simultâneos).
ALTER TABLE orders ADD COLUMN IF NOT EXISTS number integer;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS order_counters (
  establishment_id uuid PRIMARY KEY REFERENCES establishments(id) ON DELETE CASCADE,
  last_number integer NOT NULL DEFAULT 0
);
--> statement-breakpoint
UPDATE orders SET number = numbered.position
FROM (
  SELECT id, (SELECT coalesce(max(number), 0) FROM orders o2 WHERE o2.establishment_id = o.establishment_id)
    + row_number() OVER (PARTITION BY establishment_id ORDER BY created_at, id) AS position
  FROM orders o WHERE number IS NULL
) AS numbered
WHERE orders.id = numbered.id;
--> statement-breakpoint
INSERT INTO order_counters (establishment_id, last_number)
SELECT establishment_id, max(number) FROM orders GROUP BY establishment_id
ON CONFLICT (establishment_id) DO UPDATE SET last_number = GREATEST(order_counters.last_number, EXCLUDED.last_number);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS orders_establishment_number_idx ON orders (establishment_id, number);
