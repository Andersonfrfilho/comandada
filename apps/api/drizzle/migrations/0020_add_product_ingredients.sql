CREATE TABLE IF NOT EXISTS "product_ingredients" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "product_id" uuid NOT NULL REFERENCES "products"("id") ON DELETE CASCADE,
  "ingredient_id" uuid NOT NULL REFERENCES "ingredients"("id") ON DELETE RESTRICT,
  "quantity" numeric(10,4) NOT NULL,
  "unit" varchar(20) NOT NULL DEFAULT 'un',
  "notes" text,
  UNIQUE("product_id", "ingredient_id")
);
