ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "preparation_time_minutes" integer;
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "preparation_instructions" text;
