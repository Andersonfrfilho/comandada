CREATE TABLE IF NOT EXISTS "stock_batches" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "ingredient_id" uuid NOT NULL REFERENCES "ingredients"("id") ON DELETE CASCADE,
  "quantity" numeric(10,4) NOT NULL,
  "remaining_quantity" numeric(10,4) NOT NULL,
  "unit_cost" numeric(10,4) NOT NULL,
  "expires_at" date,
  "purchased_at" timestamptz DEFAULT now(),
  "notes" text,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "stock_movements" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "ingredient_id" uuid NOT NULL REFERENCES "ingredients"("id") ON DELETE CASCADE,
  "batch_id" uuid REFERENCES "stock_batches"("id"),
  "type" varchar(20) NOT NULL,
  "quantity" numeric(10,4) NOT NULL,
  "order_id" uuid REFERENCES "orders"("id"),
  "user_id" uuid NOT NULL REFERENCES "users"("id"),
  "notes" text,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
