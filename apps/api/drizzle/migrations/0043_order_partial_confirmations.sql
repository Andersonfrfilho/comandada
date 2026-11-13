-- Confirmação parcial: a equipe avisa que itens faltaram e o cliente responde SIM (segue sem eles)
-- ou NÃO (cancela) pelo WhatsApp. Fica registrado o que foi perguntado e o que o cliente respondeu.
CREATE TABLE IF NOT EXISTS "order_partial_confirmations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "establishment_id" uuid NOT NULL REFERENCES "establishments"("id") ON DELETE cascade,
  "order_id" uuid NOT NULL REFERENCES "orders"("id") ON DELETE cascade,
  "unavailable_item_ids" jsonb NOT NULL,
  "status" varchar(20) DEFAULT 'pending' NOT NULL,
  "requested_by_user_id" uuid REFERENCES "users"("id") ON DELETE set null,
  "answered_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "order_partial_confirmations_order_idx" ON "order_partial_confirmations" ("order_id", "status");
