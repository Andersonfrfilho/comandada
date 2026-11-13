CREATE TABLE IF NOT EXISTS "product_affinities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"establishment_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"suggested_product_id" uuid NOT NULL,
	"co_occurrence_count" integer NOT NULL,
	"product_order_count" integer NOT NULL,
	"confidence" numeric(5, 4) NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_affinities_pair_unique" UNIQUE("establishment_id","product_id","suggested_product_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "product_affinities" ADD CONSTRAINT "product_affinities_establishment_id_establishments_id_fk" FOREIGN KEY ("establishment_id") REFERENCES "public"."establishments"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "product_affinities" ADD CONSTRAINT "product_affinities_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "product_affinities" ADD CONSTRAINT "product_affinities_suggested_product_id_products_id_fk" FOREIGN KEY ("suggested_product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "product_affinities_lookup_idx" ON "product_affinities" USING btree ("establishment_id","product_id");
