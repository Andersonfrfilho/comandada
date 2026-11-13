-- Encomenda e reserva ocupam horário no schema `scheduling` (SDK); aqui fica só o elo com o pedido/mesa.
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "schedule_booking_id" uuid;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "orders_scheduled_for_idx" ON "orders" ("establishment_id", "scheduled_for") WHERE "scheduled_for" IS NOT NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "table_reservations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "establishment_id" uuid NOT NULL REFERENCES "establishments"("id") ON DELETE CASCADE,
  "booking_id" uuid NOT NULL,
  "customer_id" uuid REFERENCES "customers"("id") ON DELETE SET NULL,
  "table_id" uuid REFERENCES "tables"("id") ON DELETE SET NULL,
  "code" varchar(40) NOT NULL,
  "party_size" integer NOT NULL,
  "starts_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "table_reservations_booking_idx" ON "table_reservations" ("booking_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "table_reservations_day_idx" ON "table_reservations" ("establishment_id", "starts_at");
