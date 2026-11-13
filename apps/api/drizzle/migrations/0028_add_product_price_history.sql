CREATE TABLE IF NOT EXISTS "product_price_history" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "establishment_id" uuid NOT NULL REFERENCES "establishments"("id") ON DELETE CASCADE,
  "product_id" uuid NOT NULL REFERENCES "products"("id") ON DELETE CASCADE,
  "user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "previous_price" numeric(10,2) NOT NULL,
  "new_price" numeric(10,2) NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "product_price_history_product_id_idx" ON "product_price_history" ("product_id");
