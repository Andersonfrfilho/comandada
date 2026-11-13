-- Previsão prometida ao cliente: pronto para retirar ou entregue, conforme o tipo do pedido.
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "estimated_at" timestamp with time zone;
