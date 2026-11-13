CREATE TABLE IF NOT EXISTS "sections" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "establishment_id" uuid NOT NULL REFERENCES "establishments"("id") ON DELETE CASCADE,
  "name" varchar(100) NOT NULL,
  "description" text,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "section_id" uuid REFERENCES "sections"("id") ON DELETE SET NULL;
