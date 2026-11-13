DO $$ BEGIN
 CREATE TYPE "public"."comanda_status" AS ENUM('open', 'closed', 'paid');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."fiscal_document_status" AS ENUM('pending', 'emitting', 'authorized', 'rejected', 'cancelled');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."fiscal_model" AS ENUM('sat', 'nfce', 'nfe', 'none');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
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
CREATE TABLE IF NOT EXISTS "conversation_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"establishment_id" uuid NOT NULL,
	"whatsapp_number" varchar(20) NOT NULL,
	"current_state" varchar(50) DEFAULT 'start' NOT NULL,
	"context" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"mode" varchar(10) DEFAULT 'bot' NOT NULL,
	"assigned_user_id" uuid,
	"human_requested_at" timestamp with time zone,
	"last_inbound_at" timestamp with time zone,
	"last_agent_read_at" timestamp with time zone,
	"last_activity" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conversation_sessions_establishment_whatsapp_unique" UNIQUE("establishment_id","whatsapp_number")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "conversation_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"establishment_id" uuid NOT NULL,
	"whatsapp_number" varchar(20) NOT NULL,
	"direction" varchar(10) NOT NULL,
	"sender" varchar(10) NOT NULL,
	"agent_user_id" uuid,
	"type" varchar(20) NOT NULL,
	"content" text,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"wa_message_id" varchar(255),
	"status" varchar(20) DEFAULT 'sent' NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "fiscal_configurations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"establishment_id" uuid NOT NULL,
	"model" "fiscal_model" DEFAULT 'none' NOT NULL,
	"cnpj" varchar(18),
	"inscricao_estadual" varchar(50),
	"razao_social" varchar(255),
	"uf" varchar(2),
	"municipio" varchar(100),
	"cep" varchar(9),
	"logradouro" text,
	"numero" varchar(20),
	"complemento" varchar(100),
	"bairro" varchar(100),
	"crt" varchar(1) DEFAULT '1',
	"provider_config" jsonb DEFAULT '{}'::jsonb,
	"environment" varchar(20) DEFAULT 'homologacao' NOT NULL,
	"active" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fiscal_configurations_establishment_id_unique" UNIQUE("establishment_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "fiscal_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"establishment_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"model" "fiscal_model" NOT NULL,
	"status" "fiscal_document_status" DEFAULT 'pending' NOT NULL,
	"numero_documento" integer,
	"serie" varchar(5),
	"chave_acesso" varchar(44),
	"protocolo" varchar(50),
	"total_bruto" numeric(10, 2),
	"total_desconto" numeric(10, 2) DEFAULT '0',
	"total_liquido" numeric(10, 2),
	"xml_autorizado" text,
	"qr_code_url" text,
	"danfe_pdf_url" text,
	"cancelled_at" timestamp with time zone,
	"cancellation_reason" text,
	"cancellation_protocol" varchar(50),
	"provider_response" jsonb DEFAULT '{}'::jsonb,
	"error_code" varchar(20),
	"error_message" text,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"last_attempt_at" timestamp with time zone,
	"authorized_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fiscal_documents_chave_acesso_unique" UNIQUE("chave_acesso")
);
--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN IF NOT EXISTS "ncm_code" varchar(8) DEFAULT '21069090';--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN IF NOT EXISTS "cfop_code" varchar(4) DEFAULT '5102';--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN IF NOT EXISTS "cst_icms" varchar(3) DEFAULT '400';--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "phone" varchar(20);--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "document" varchar(20);--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "birth_date" date;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "comandas" ADD CONSTRAINT "comandas_establishment_id_establishments_id_fk" FOREIGN KEY ("establishment_id") REFERENCES "public"."establishments"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "comandas" ADD CONSTRAINT "comandas_table_id_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."tables"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "comandas" ADD CONSTRAINT "comandas_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "conversation_sessions" ADD CONSTRAINT "conversation_sessions_establishment_id_establishments_id_fk" FOREIGN KEY ("establishment_id") REFERENCES "public"."establishments"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "conversation_sessions" ADD CONSTRAINT "conversation_sessions_assigned_user_id_users_id_fk" FOREIGN KEY ("assigned_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "conversation_messages" ADD CONSTRAINT "conversation_messages_establishment_id_establishments_id_fk" FOREIGN KEY ("establishment_id") REFERENCES "public"."establishments"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "conversation_messages" ADD CONSTRAINT "conversation_messages_agent_user_id_users_id_fk" FOREIGN KEY ("agent_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "fiscal_configurations" ADD CONSTRAINT "fiscal_configurations_establishment_id_establishments_id_fk" FOREIGN KEY ("establishment_id") REFERENCES "public"."establishments"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "fiscal_documents" ADD CONSTRAINT "fiscal_documents_establishment_id_establishments_id_fk" FOREIGN KEY ("establishment_id") REFERENCES "public"."establishments"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "fiscal_documents" ADD CONSTRAINT "fiscal_documents_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "conversation_messages_whatsapp_created_idx" ON "conversation_messages" USING btree ("whatsapp_number","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "conversation_messages_wa_message_id_idx" ON "conversation_messages" USING btree ("wa_message_id");