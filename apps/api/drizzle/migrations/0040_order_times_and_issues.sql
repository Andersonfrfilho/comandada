-- Hora em que o pedido saiu para entrega.
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "dispatched_at" timestamp with time zone;
--> statement-breakpoint
-- Problemas relatados pelo cliente (WhatsApp), base da métrica de pedidos com problema.
CREATE TABLE IF NOT EXISTS "order_issues" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "establishment_id" uuid NOT NULL REFERENCES "establishments"("id") ON DELETE cascade,
  "order_id" uuid REFERENCES "orders"("id") ON DELETE set null,
  "customer_id" uuid REFERENCES "customers"("id") ON DELETE set null,
  "category" varchar(40) NOT NULL,
  "description" text,
  "channel" varchar(20) DEFAULT 'whatsapp' NOT NULL,
  "status" varchar(20) DEFAULT 'open' NOT NULL,
  "resolved_at" timestamp with time zone,
  "resolved_by_user_id" uuid REFERENCES "users"("id") ON DELETE set null,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "order_issues_establishment_created_idx" ON "order_issues" ("establishment_id", "created_at");
