-- Lembretes do n8n: o aceite de marketing que o bot pergunta ("quer receber novidades?") passa a ficar
-- guardado no cliente (nulo = ainda não perguntado), e o último lembrete enviado segura o intervalo
-- mínimo entre um lembrete e outro.
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "marketing_opt_in" boolean;
--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "marketing_opt_in_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "last_marketing_at" timestamp with time zone;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "customers_marketing_opt_in_idx" ON "customers" ("establishment_id") WHERE "marketing_opt_in" = true;
