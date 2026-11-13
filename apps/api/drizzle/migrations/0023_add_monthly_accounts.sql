CREATE TABLE IF NOT EXISTS "monthly_accounts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "establishment_id" uuid NOT NULL REFERENCES "establishments"("id") ON DELETE CASCADE,
  "description" varchar(255) NOT NULL,
  "category" varchar(50) NOT NULL DEFAULT 'outros',
  "amount" numeric(10,2) NOT NULL,
  "due_day" integer NOT NULL,
  "recurrence" varchar(20) NOT NULL DEFAULT 'monthly',
  "status" varchar(20) NOT NULL DEFAULT 'pending',
  "paid_at" timestamptz,
  "notes" text,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
