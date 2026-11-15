-- Fechamento de caixa conferido: o dinheiro que devia estar na gaveta (só dinheiro: abertura + vendas em
-- dinheiro + suprimentos - sangrias - devoluções em dinheiro), a diferença contada e quem fechou.
ALTER TABLE "cash_registers" ADD COLUMN IF NOT EXISTS "expected_cash_amount" numeric(10, 2);
--> statement-breakpoint
ALTER TABLE "cash_registers" ADD COLUMN IF NOT EXISTS "closing_difference" numeric(10, 2);
--> statement-breakpoint
ALTER TABLE "cash_registers" ADD COLUMN IF NOT EXISTS "closed_by_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "cash_registers" ADD COLUMN IF NOT EXISTS "closing_notes" text;
