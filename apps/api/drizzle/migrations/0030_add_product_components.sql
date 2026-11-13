ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "is_kit" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "product_components" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kit_product_id" uuid NOT NULL,
	"component_product_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_components_pair_unique" UNIQUE("kit_product_id","component_product_id"),
	CONSTRAINT "product_components_quantity_positive" CHECK ("quantity" > 0),
	CONSTRAINT "product_components_not_self" CHECK ("kit_product_id" <> "component_product_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "product_components" ADD CONSTRAINT "product_components_kit_product_id_products_id_fk" FOREIGN KEY ("kit_product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "product_components" ADD CONSTRAINT "product_components_component_product_id_products_id_fk" FOREIGN KEY ("component_product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "product_components_kit_idx" ON "product_components" USING btree ("kit_product_id");
