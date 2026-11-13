-- Pagamento online pelo WhatsApp (Mercado Pago): conta por restaurante, cobrança por pedido,
-- idempotência do webhook e o pedido segurado fora da cozinha até o pagamento cair.
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "payment_status" varchar(20) DEFAULT 'not_required' NOT NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "payment_accounts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "establishment_id" uuid NOT NULL REFERENCES "establishments"("id") ON DELETE cascade,
  "provider" varchar(30) NOT NULL,
  "credentials" text NOT NULL,
  "access_token_hint" varchar(12),
  "payer_email" varchar(255),
  "pix_enabled" boolean DEFAULT true NOT NULL,
  "card_link_enabled" boolean DEFAULT true NOT NULL,
  "expiration_minutes" integer DEFAULT 30 NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "payment_accounts_establishment_provider_unique" UNIQUE("establishment_id", "provider")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "payment_charges" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "establishment_id" uuid NOT NULL REFERENCES "establishments"("id") ON DELETE cascade,
  "order_id" uuid NOT NULL REFERENCES "orders"("id") ON DELETE cascade,
  "provider" varchar(30) NOT NULL,
  "kind" varchar(20) NOT NULL,
  "provider_charge_id" varchar(100) NOT NULL,
  "provider_payment_id" varchar(100),
  "status" varchar(20) NOT NULL,
  "amount" numeric(10, 2) NOT NULL,
  "pix_copy_paste" text,
  "payment_url" text,
  "expires_at" timestamp with time zone,
  "paid_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "payment_charges_provider_charge_unique" UNIQUE("provider", "provider_charge_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payment_charges_order_idx" ON "payment_charges" ("order_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "payment_webhook_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "establishment_id" uuid NOT NULL REFERENCES "establishments"("id") ON DELETE cascade,
  "provider" varchar(30) NOT NULL,
  "event_id" varchar(150) NOT NULL,
  "type" varchar(40) NOT NULL,
  "order_id" uuid REFERENCES "orders"("id") ON DELETE set null,
  "received_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "payment_webhook_events_unique" UNIQUE("establishment_id", "provider", "event_id")
);
