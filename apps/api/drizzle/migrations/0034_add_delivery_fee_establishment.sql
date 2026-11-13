-- Tabelas que nasceram no schema legado do bot (database/schema.sql). Criadas aqui para que um banco novo
-- chegue nesta migration; em banco que já as tem, IF NOT EXISTS não muda nada.
CREATE TABLE IF NOT EXISTS order_types (
  id          SERIAL PRIMARY KEY,
  name        TEXT UNIQUE NOT NULL,   -- slug: delivery | retirada | mesa
  type        TEXT NOT NULL,          -- home_delivery | pickup | dine_in
  label       TEXT NOT NULL,          -- texto exibido ao cliente
  config      JSONB DEFAULT '{}',
  active      BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now(),
  deleted_at  TIMESTAMPTZ
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS payment_types (
  id          SERIAL PRIMARY KEY,
  name        TEXT UNIQUE NOT NULL,   -- slug: pix | cartao | dinheiro
  type        TEXT NOT NULL,          -- digital | card | cash
  label       TEXT NOT NULL,          -- texto exibido ao cliente
  config      JSONB DEFAULT '{}',     -- {chave, nome} para pix, etc.
  active      BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now(),
  deleted_at  TIMESTAMPTZ
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS bot_settings (
  id          SERIAL PRIMARY KEY,
  key         TEXT UNIQUE NOT NULL,
  value       TEXT NOT NULL,
  description TEXT,
  group_name  TEXT DEFAULT 'general',  -- general | schedule | messages | delivery | integrations
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now(),
  deleted_at  TIMESTAMPTZ
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS delivery_fee_rules (
  id            SERIAL PRIMARY KEY,
  order_type_id INTEGER NOT NULL REFERENCES order_types(id) ON DELETE CASCADE,
  mode          TEXT NOT NULL DEFAULT 'fixed'
                  CHECK (mode IN ('fixed','per_km','per_route_min','zones_km','zones_min')),
  base_fee      NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  per_km_rate   NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  per_min_rate  NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  free_above    NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  max_radius_km NUMERIC(10,2) NOT NULL DEFAULT 10.00,
  active        BOOLEAN       NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ            DEFAULT now(),
  updated_at    TIMESTAMPTZ            DEFAULT now(),
  deleted_at    TIMESTAMPTZ
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS delivery_fee_zones (
  id                   SERIAL PRIMARY KEY,
  delivery_fee_rule_id INTEGER NOT NULL REFERENCES delivery_fee_rules(id) ON DELETE CASCADE,
  zone_type            TEXT NOT NULL DEFAULT 'km' CHECK (zone_type IN ('km','min')),
  min_value            NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  max_value            NUMERIC(10,2) NOT NULL,
  fee                  NUMERIC(10,2) NOT NULL,
  label                TEXT,
  active               BOOLEAN NOT NULL DEFAULT true,
  created_at           TIMESTAMPTZ DEFAULT now(),
  updated_at           TIMESTAMPTZ DEFAULT now(),
  deleted_at           TIMESTAMPTZ
);
--> statement-breakpoint
ALTER TABLE "delivery_fee_rules" ADD COLUMN IF NOT EXISTS "establishment_id" uuid REFERENCES "establishments"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "delivery_fee_zones" ADD COLUMN IF NOT EXISTS "establishment_id" uuid REFERENCES "establishments"("id") ON DELETE CASCADE;
--> statement-breakpoint
-- Regra de taxa nasceu do schema legado do bot, sem tenant. Enquanto houver um
-- único estabelecimento a atribuição é inequívoca; com mais de um, as regras
-- ficam sem dono e precisam de decisão humana, não de um chute da migration.
UPDATE "delivery_fee_rules" SET "establishment_id" = (SELECT "id" FROM "establishments")
WHERE "establishment_id" IS NULL AND (SELECT COUNT(*) FROM "establishments") = 1;
--> statement-breakpoint
UPDATE "delivery_fee_zones" SET "establishment_id" = (SELECT "id" FROM "establishments")
WHERE "establishment_id" IS NULL AND (SELECT COUNT(*) FROM "establishments") = 1;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "delivery_fee_rules_establishment_idx" ON "delivery_fee_rules" ("establishment_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "delivery_fee_zones_establishment_idx" ON "delivery_fee_zones" ("establishment_id");
