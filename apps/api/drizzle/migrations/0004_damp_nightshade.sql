ALTER TABLE "orders" ADD COLUMN "fiscal_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "fiscal_configurations" ADD COLUMN "emit_trigger" varchar(20) DEFAULT 'on_payment' NOT NULL;--> statement-breakpoint
ALTER TABLE "fiscal_configurations" ADD COLUMN "email_provider" varchar(20) DEFAULT 'resend' NOT NULL;