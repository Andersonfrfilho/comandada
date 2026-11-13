CREATE TABLE IF NOT EXISTS "bot_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "establishment_id" uuid NOT NULL REFERENCES "establishments"("id") ON DELETE CASCADE,
  "whatsapp_number" varchar(20) NOT NULL,
  "state" varchar(50) DEFAULT 'start' NOT NULL,
  "cart" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "reservation_draft" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "last_activity_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "bot_sessions_establishment_number_idx" ON "bot_sessions" ("establishment_id", "whatsapp_number");
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "code" varchar(40);
