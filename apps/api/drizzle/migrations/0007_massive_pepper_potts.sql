ALTER TABLE "fiscal_documents" ADD COLUMN "delivery_status" varchar(20);--> statement-breakpoint
ALTER TABLE "fiscal_documents" ADD COLUMN "delivered_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "fiscal_documents" ADD COLUMN "delivery_error" text;