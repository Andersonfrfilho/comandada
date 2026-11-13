ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "scheduled_for" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "deliveries" ADD COLUMN IF NOT EXISTS "fee_amount" numeric(10, 2) DEFAULT '0' NOT NULL;
--> statement-breakpoint
ALTER TABLE "deliveries" ADD COLUMN IF NOT EXISTS "distance_km" numeric(6, 2);
