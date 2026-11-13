ALTER TABLE "customers" ADD COLUMN "phone" varchar(20);--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "document" varchar(20);--> statement-breakpoint
CREATE TYPE "public"."comanda_status" AS ENUM('open', 'closed', 'paid');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "comandas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"establishment_id" uuid NOT NULL,
	"table_id" uuid NOT NULL,
	"code" varchar(10) NOT NULL,
	"status" "comanda_status" DEFAULT 'open' NOT NULL,
	"customer_id" uuid,
	"customer_name" varchar(255),
	"customer_phone" varchar(20),
	"customer_document" varchar(20),
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "comandas" ADD CONSTRAINT "comandas_establishment_id_establishments_id_fk" FOREIGN KEY ("establishment_id") REFERENCES "public"."establishments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comandas" ADD CONSTRAINT "comandas_table_id_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."tables"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comandas" ADD CONSTRAINT "comandas_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;
