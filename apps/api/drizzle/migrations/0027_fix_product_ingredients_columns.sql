ALTER TABLE "product_ingredients" ADD COLUMN IF NOT EXISTS "created_at" timestamptz DEFAULT now() NOT NULL;
--> statement-breakpoint
ALTER TABLE "product_ingredients" ADD COLUMN IF NOT EXISTS "updated_at" timestamptz DEFAULT now() NOT NULL;
