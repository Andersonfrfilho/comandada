CREATE TABLE IF NOT EXISTS "expenses" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "establishment_id" uuid NOT NULL REFERENCES "establishments"("id") ON DELETE CASCADE,
  "description" varchar(255) NOT NULL,
  "category" varchar(50) NOT NULL DEFAULT 'outros',
  "amount" numeric(10,2) NOT NULL,
  "expense_date" date NOT NULL DEFAULT CURRENT_DATE,
  "supplier" varchar(255),
  "receipt_url" text,
  "notes" text,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
