-- Estorno de pedido: devolução pelo provedor (Pix/link de cartão) ou na mão (dinheiro, maquininha).
-- Cada devolução vira uma linha aqui e uma saída "refund" no caixa; o pedido guarda quanto já voltou.
ALTER TYPE "cash_movement_type" ADD VALUE IF NOT EXISTS 'refund';
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "refunded_amount" numeric(10, 2) DEFAULT '0' NOT NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "payment_refunds" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "establishment_id" uuid NOT NULL REFERENCES "establishments"("id") ON DELETE cascade,
  "order_id" uuid NOT NULL REFERENCES "orders"("id") ON DELETE cascade,
  "charge_id" uuid REFERENCES "payment_charges"("id") ON DELETE set null,
  "method" varchar(20) NOT NULL,
  "provider" varchar(30),
  "provider_refund_id" varchar(100),
  "payment_method" varchar(20),
  "amount" numeric(10, 2) NOT NULL,
  "status" varchar(20) NOT NULL,
  "reason" text,
  "failure_message" text,
  "created_by_user_id" uuid REFERENCES "users"("id") ON DELETE set null,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payment_refunds_order_idx" ON "payment_refunds" ("order_id");
