-- Tamanho/variação: produtos do mesmo grupo aparecem uma vez no bot, que pergunta o tamanho.
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "variant_group" varchar(80);
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "variant_label" varchar(40);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "products_variant_group_idx" ON "products" ("establishment_id", "variant_group");
--> statement-breakpoint
-- Tipos padrão: sem eles um banco novo deixa o bot sem forma de entrega nem de pagamento.
INSERT INTO order_types (name, type, label, active) VALUES
  ('delivery', 'home_delivery', 'Entregar 🛵', true),
  ('retirada', 'pickup', 'Retirada no local 📤', true),
  ('mesa', 'dine_in', 'Pedido na mesa 🍽️', false)
ON CONFLICT (name) DO NOTHING;
--> statement-breakpoint
INSERT INTO payment_types (name, type, label, config) VALUES
  ('pix', 'digital', 'PIX', '{"chave":"","nome":""}'),
  ('cartao', 'card', 'Cartão (débito/crédito)', '{}'),
  ('dinheiro', 'cash', 'Dinheiro', '{}')
ON CONFLICT (name) DO NOTHING;
