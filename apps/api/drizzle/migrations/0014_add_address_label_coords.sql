ALTER TABLE "addresses" ADD COLUMN IF NOT EXISTS "label" varchar(50);
--> statement-breakpoint
ALTER TABLE "addresses" ADD COLUMN IF NOT EXISTS "lat" double precision;
--> statement-breakpoint
ALTER TABLE "addresses" ADD COLUMN IF NOT EXISTS "lng" double precision;
