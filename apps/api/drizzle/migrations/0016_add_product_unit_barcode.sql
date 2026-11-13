ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "unit" varchar(20) DEFAULT 'un';
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "barcode" varchar(20);
