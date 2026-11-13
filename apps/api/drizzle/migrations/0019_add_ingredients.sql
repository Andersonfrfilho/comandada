CREATE TABLE IF NOT EXISTS "ingredients" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "establishment_id" uuid NOT NULL REFERENCES "establishments"("id") ON DELETE CASCADE,
  "name" varchar(255) NOT NULL,
  "unit" varchar(20) NOT NULL DEFAULT 'un',
  "cost_per_unit" numeric(10,4) NOT NULL DEFAULT 0,
  "stock_quantity" numeric(10,4) NOT NULL DEFAULT 0,
  "minimum_stock" numeric(10,4) DEFAULT 0,
  "section_id" uuid REFERENCES "sections"("id") ON DELETE SET NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
