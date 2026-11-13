-- Migration 003: establishments table — suporte multi-estabelecimento
-- Idempotente: seguro re-executar.

-- ── 1. Tabela principal ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS establishments (
  id                        UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                      TEXT          UNIQUE NOT NULL,
  whatsapp_number           TEXT          UNIQUE NOT NULL DEFAULT '',
  name                      TEXT          NOT NULL,
  phone                     TEXT,
  logo_url                  TEXT,
  address                   TEXT,
  lat                       NUMERIC(10,7) NOT NULL DEFAULT 0,
  lng                       NUMERIC(10,7) NOT NULL DEFAULT 0,
  city                      TEXT,
  -- Horário
  opening_time              TEXT          NOT NULL DEFAULT '18:00',
  closing_time              TEXT          NOT NULL DEFAULT '23:00',
  working_days              TEXT          NOT NULL DEFAULT 'tue,wed,thu,fri,sat,sun',
  -- Mensagens
  msg_welcome               TEXT          NOT NULL DEFAULT 'Olá! Bem-vindo!',
  msg_closed                TEXT          NOT NULL DEFAULT E'Estamos fechados agora!\n\nEm breve retornamos!',
  -- Operacional
  min_order_value           NUMERIC(10,2) NOT NULL DEFAULT 0,
  prep_time_min             INT           NOT NULL DEFAULT 30,
  session_ttl_min           INT           NOT NULL DEFAULT 60,
  ignore_hours              BOOLEAN       NOT NULL DEFAULT false,
  -- Features
  feature_delivery          BOOLEAN       NOT NULL DEFAULT true,
  feature_retirada          BOOLEAN       NOT NULL DEFAULT true,
  feature_reservas          BOOLEAN       NOT NULL DEFAULT false,
  feature_pedido_mesa       BOOLEAN       NOT NULL DEFAULT false,
  -- Contatos internos
  kitchen_phone             TEXT,
  agent_phone               TEXT,
  -- Integração Chatwoot (por estabelecimento)
  chatwoot_account_id       TEXT,
  chatwoot_api_token        TEXT,
  chatwoot_inbox_id         TEXT,
  -- Lembretes
  reminder_interval_days    INT           NOT NULL DEFAULT 7,
  reminder_min_gap_days     INT           NOT NULL DEFAULT 7,
  reminder_send_hour        INT           NOT NULL DEFAULT 12,
  reminder_message_template TEXT,
  reservation_reminder_hour INT           NOT NULL DEFAULT 10,
  -- Meta
  active                    BOOLEAN       NOT NULL DEFAULT true,
  created_at                TIMESTAMPTZ            DEFAULT now(),
  updated_at                TIMESTAMPTZ            DEFAULT now(),
  deleted_at                TIMESTAMPTZ
);

-- ── 2. Estabelecimento padrão a partir das settings existentes ───────────────
INSERT INTO establishments (
  slug, whatsapp_number, name, address, lat, lng, city,
  opening_time, closing_time, working_days,
  msg_welcome, msg_closed,
  min_order_value, prep_time_min, session_ttl_min, ignore_hours,
  kitchen_phone, agent_phone,
  chatwoot_account_id, chatwoot_api_token, chatwoot_inbox_id,
  reminder_interval_days, reminder_min_gap_days, reminder_send_hour,
  reminder_message_template, reservation_reminder_hour
)
SELECT
  'default',
  COALESCE(NULLIF((SELECT value FROM settings WHERE key = 'whatsapp_number'  LIMIT 1), ''), ''),
  COALESCE((SELECT value FROM settings WHERE key = 'establishment_name'      LIMIT 1), 'Estabelecimento'),
  NULLIF((SELECT value FROM settings WHERE key = 'establishment_address'     LIMIT 1), ''),
  COALESCE((SELECT value::NUMERIC FROM settings WHERE key = 'establishment_lat' LIMIT 1), 0),
  COALESCE((SELECT value::NUMERIC FROM settings WHERE key = 'establishment_lng' LIMIT 1), 0),
  NULLIF((SELECT value FROM settings WHERE key = 'establishment_city'        LIMIT 1), ''),
  COALESCE((SELECT value FROM settings WHERE key = 'opening_time'            LIMIT 1), '18:00'),
  COALESCE((SELECT value FROM settings WHERE key = 'closing_time'            LIMIT 1), '23:00'),
  COALESCE((SELECT value FROM settings WHERE key = 'working_days'            LIMIT 1), 'tue,wed,thu,fri,sat,sun'),
  COALESCE((SELECT value FROM settings WHERE key = 'msg_welcome'             LIMIT 1), 'Olá! Bem-vindo!'),
  COALESCE((SELECT value FROM settings WHERE key = 'msg_closed'              LIMIT 1), 'Estamos fechados.'),
  COALESCE((SELECT value::NUMERIC FROM settings WHERE key = 'min_order_value'  LIMIT 1), 0),
  COALESCE((SELECT value::INT     FROM settings WHERE key = 'prep_time_min'    LIMIT 1), 30),
  COALESCE((SELECT value::INT     FROM settings WHERE key = 'session_ttl_min'  LIMIT 1), 60),
  COALESCE((SELECT value FROM settings WHERE key = 'ignore_hours'            LIMIT 1), 'false')::BOOLEAN,
  NULLIF((SELECT value FROM settings WHERE key = 'kitchen_phone'             LIMIT 1), ''),
  NULLIF((SELECT value FROM settings WHERE key = 'agent_phone'               LIMIT 1), ''),
  NULLIF((SELECT value FROM settings WHERE key = 'chatwoot_account_id'       LIMIT 1), ''),
  NULLIF((SELECT value FROM settings WHERE key = 'chatwoot_api_token'        LIMIT 1), ''),
  NULLIF((SELECT value FROM settings WHERE key = 'chatwoot_inbox_id'         LIMIT 1), ''),
  COALESCE((SELECT value::INT FROM settings WHERE key = 'reminder_interval_days'    LIMIT 1), 7),
  COALESCE((SELECT value::INT FROM settings WHERE key = 'reminder_min_gap_days'     LIMIT 1), 7),
  COALESCE((SELECT value::INT FROM settings WHERE key = 'reminder_send_hour'        LIMIT 1), 12),
  (SELECT value FROM settings WHERE key = 'reminder_message_template'        LIMIT 1),
  COALESCE((SELECT value::INT FROM settings WHERE key = 'reservation_reminder_hour' LIMIT 1), 10)
ON CONFLICT (slug) DO NOTHING;

-- ── 3. Coluna establishment_id em todas as tabelas de dados ─────────────────
ALTER TABLE categories          ADD COLUMN IF NOT EXISTS establishment_id UUID REFERENCES establishments(id);
ALTER TABLE products            ADD COLUMN IF NOT EXISTS establishment_id UUID REFERENCES establishments(id);
ALTER TABLE payment_types       ADD COLUMN IF NOT EXISTS establishment_id UUID REFERENCES establishments(id);
ALTER TABLE order_types         ADD COLUMN IF NOT EXISTS establishment_id UUID REFERENCES establishments(id);
ALTER TABLE delivery_fee_rules  ADD COLUMN IF NOT EXISTS establishment_id UUID REFERENCES establishments(id);
ALTER TABLE delivery_fee_zones  ADD COLUMN IF NOT EXISTS establishment_id UUID REFERENCES establishments(id);
ALTER TABLE tables              ADD COLUMN IF NOT EXISTS establishment_id UUID REFERENCES establishments(id);
ALTER TABLE orders              ADD COLUMN IF NOT EXISTS establishment_id UUID REFERENCES establishments(id);
ALTER TABLE customers           ADD COLUMN IF NOT EXISTS establishment_id UUID REFERENCES establishments(id);
ALTER TABLE sessions            ADD COLUMN IF NOT EXISTS establishment_id UUID REFERENCES establishments(id);
ALTER TABLE reservations        ADD COLUMN IF NOT EXISTS establishment_id UUID REFERENCES establishments(id);
ALTER TABLE faq                 ADD COLUMN IF NOT EXISTS establishment_id UUID REFERENCES establishments(id);
ALTER TABLE promotions          ADD COLUMN IF NOT EXISTS establishment_id UUID REFERENCES establishments(id);
ALTER TABLE question_logs       ADD COLUMN IF NOT EXISTS establishment_id UUID REFERENCES establishments(id);

-- ── 4. Vincula todos os dados existentes ao estabelecimento padrão ───────────
DO $$
DECLARE
  default_id UUID;
BEGIN
  SELECT id INTO default_id FROM establishments WHERE slug = 'default' LIMIT 1;
  IF default_id IS NOT NULL THEN
    UPDATE categories         SET establishment_id = default_id WHERE establishment_id IS NULL;
    UPDATE products           SET establishment_id = default_id WHERE establishment_id IS NULL;
    UPDATE payment_types      SET establishment_id = default_id WHERE establishment_id IS NULL;
    UPDATE order_types        SET establishment_id = default_id WHERE establishment_id IS NULL;
    UPDATE delivery_fee_rules SET establishment_id = default_id WHERE establishment_id IS NULL;
    UPDATE delivery_fee_zones SET establishment_id = default_id WHERE establishment_id IS NULL;
    UPDATE tables             SET establishment_id = default_id WHERE establishment_id IS NULL;
    UPDATE orders             SET establishment_id = default_id WHERE establishment_id IS NULL;
    UPDATE customers          SET establishment_id = default_id WHERE establishment_id IS NULL;
    UPDATE sessions           SET establishment_id = default_id WHERE establishment_id IS NULL;
    UPDATE reservations       SET establishment_id = default_id WHERE establishment_id IS NULL;
    UPDATE faq                SET establishment_id = default_id WHERE establishment_id IS NULL;
    UPDATE promotions         SET establishment_id = default_id WHERE establishment_id IS NULL;
    UPDATE question_logs      SET establishment_id = default_id WHERE establishment_id IS NULL;
  END IF;
END $$;

-- ── 5. NOT NULL nas tabelas críticas (após migração dos dados) ───────────────
ALTER TABLE categories          ALTER COLUMN establishment_id SET NOT NULL;
ALTER TABLE products            ALTER COLUMN establishment_id SET NOT NULL;
ALTER TABLE tables              ALTER COLUMN establishment_id SET NOT NULL;
ALTER TABLE orders              ALTER COLUMN establishment_id SET NOT NULL;
ALTER TABLE reservations        ALTER COLUMN establishment_id SET NOT NULL;
-- payment_types, order_types: constraint de nome atualizada abaixo (passo 6)
-- customers, sessions: nullable — phone é PK global; FK composta é migração futura (004)
-- delivery_fee_*, faq, promotions, question_logs: nullable — vinculados mas sem hard constraint

-- ── 6. Atualiza constraints de unicidade para suporte multi-tenant ───────────
-- payment_types: 'name' deixa de ser globalmente único → único por estabelecimento
ALTER TABLE payment_types ALTER COLUMN establishment_id SET NOT NULL;
ALTER TABLE payment_types DROP CONSTRAINT IF EXISTS payment_types_name_key;
ALTER TABLE payment_types ADD  CONSTRAINT IF NOT EXISTS payment_types_estab_name_key UNIQUE (establishment_id, name);

-- order_types: mesmo padrão
ALTER TABLE order_types ALTER COLUMN establishment_id SET NOT NULL;
ALTER TABLE order_types DROP CONSTRAINT IF EXISTS order_types_name_key;
ALTER TABLE order_types ADD  CONSTRAINT IF NOT EXISTS order_types_estab_name_key UNIQUE (establishment_id, name);

-- ── 7. Índices ───────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_establishments_number ON establishments(whatsapp_number) WHERE active = true AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_products_estab        ON products(establishment_id, available) WHERE available = true AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_categories_estab      ON categories(establishment_id, sort_order) WHERE active = true AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_orders_estab          ON orders(establishment_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_customers_estab       ON customers(establishment_id, phone);
CREATE INDEX IF NOT EXISTS idx_sessions_estab        ON sessions(establishment_id, phone);
CREATE INDEX IF NOT EXISTS idx_faq_estab             ON faq(establishment_id, active) WHERE active = true AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_reservations_estab    ON reservations(establishment_id, date, time);

-- ── 8. Trigger de changelog ──────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tr_establishments_changelog') THEN
    CREATE TRIGGER tr_establishments_changelog
      AFTER INSERT OR UPDATE OR DELETE ON establishments
      FOR EACH ROW EXECUTE FUNCTION fn_changelog();
  END IF;
END $$;

-- ── Notas para migração futura (004) ─────────────────────────────────────────
-- sessions: PK é 'phone TEXT' — em multi-tenant a mesma sessão de cliente pode existir
--           em dois estabelecimentos. Para isolamento total: DROP CONSTRAINT sessions_pkey;
--           ADD CONSTRAINT sessions_pkey PRIMARY KEY (establishment_id, phone);
--           Isso quebra qualquer upsert ON CONFLICT (phone) — necessário avaliar impacto no n8n.
--
-- customers: phone TEXT UNIQUE — considerar se um cliente é global (mesmo registro em todos
--            os estabelecimentos) ou isolado por estabelecimento. Atual: global.
