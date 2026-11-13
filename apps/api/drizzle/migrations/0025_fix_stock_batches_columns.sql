ALTER TABLE "stock_batches" ADD COLUMN IF NOT EXISTS "establishment_id" uuid REFERENCES "establishments"("id") ON DELETE CASCADE;
--> statement-breakpoint
UPDATE "stock_batches" sb SET "establishment_id" = i."establishment_id"
  FROM "ingredients" i WHERE i."id" = sb."ingredient_id" AND sb."establishment_id" IS NULL;
--> statement-breakpoint
ALTER TABLE "stock_batches" ALTER COLUMN "establishment_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "stock_batches" ADD COLUMN IF NOT EXISTS "batch_number" varchar(100);
--> statement-breakpoint
UPDATE "stock_batches" SET "batch_number" = substr(id::text, 1, 8) WHERE "batch_number" IS NULL;
--> statement-breakpoint
ALTER TABLE "stock_batches" ALTER COLUMN "batch_number" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "stock_batches" RENAME COLUMN "unit_cost" TO "cost_per_unit";
--> statement-breakpoint
ALTER TABLE "stock_batches" ALTER COLUMN "expires_at" TYPE timestamptz USING "expires_at"::timestamptz;
--> statement-breakpoint
ALTER TABLE "stock_batches" ALTER COLUMN "expires_at" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "stock_batches" ADD COLUMN IF NOT EXISTS "updated_at" timestamptz DEFAULT now() NOT NULL;
--> statement-breakpoint
ALTER TABLE "stock_batches" DROP COLUMN IF EXISTS "purchased_at";
--> statement-breakpoint
ALTER TABLE "stock_batches" DROP COLUMN IF EXISTS "notes";

--> statement-breakpoint
ALTER TABLE "stock_movements" ADD COLUMN IF NOT EXISTS "establishment_id" uuid REFERENCES "establishments"("id") ON DELETE CASCADE;
--> statement-breakpoint
UPDATE "stock_movements" sm SET "establishment_id" = i."establishment_id"
  FROM "ingredients" i WHERE i."id" = sm."ingredient_id" AND sm."establishment_id" IS NULL;
--> statement-breakpoint
ALTER TABLE "stock_movements" ALTER COLUMN "establishment_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "stock_movements" RENAME COLUMN "type" TO "movement_type";
--> statement-breakpoint
ALTER TABLE "stock_movements" RENAME COLUMN "notes" TO "reason";
--> statement-breakpoint
ALTER TABLE "stock_movements" ALTER COLUMN "reason" TYPE varchar(255) USING "reason"::varchar(255);
--> statement-breakpoint
ALTER TABLE "stock_movements" ALTER COLUMN "user_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "stock_movements" DROP CONSTRAINT IF EXISTS "stock_movements_user_id_fkey";
--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "stock_movements" DROP CONSTRAINT IF EXISTS "stock_movements_order_id_fkey";
--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "stock_movements" DROP CONSTRAINT IF EXISTS "stock_movements_batch_id_fkey";
--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "stock_batches"("id") ON DELETE SET NULL;
