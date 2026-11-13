ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "production_started_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "ready_at" timestamp with time zone;
