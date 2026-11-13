-- Migration 001: initial schema
-- Idempotent: safe to run on a DB that already has these tables.

CREATE TABLE IF NOT EXISTS changelogs (
  id          BIGSERIAL PRIMARY KEY,
  table_name  TEXT NOT NULL,
  record_id   TEXT,
  action      TEXT NOT NULL,
  old_data    JSONB,
  new_data    JSONB,
  changed_by  TEXT DEFAULT 'system',
  created_at  TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_changelogs_table ON changelogs(table_name, record_id);
CREATE INDEX IF NOT EXISTS idx_changelogs_time  ON changelogs(created_at DESC);

CREATE OR REPLACE FUNCTION fn_changelog()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO changelogs (table_name, record_id, action, old_data, new_data)
    VALUES (TG_TABLE_NAME, COALESCE(to_jsonb(NEW)->>'id', to_jsonb(NEW)->>'phone'), 'INSERT', NULL, to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO changelogs (table_name, record_id, action, old_data, new_data)
    VALUES (TG_TABLE_NAME, COALESCE(to_jsonb(OLD)->>'id', to_jsonb(OLD)->>'phone'), 'UPDATE', to_jsonb(OLD), to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO changelogs (table_name, record_id, action, old_data, new_data)
    VALUES (TG_TABLE_NAME, COALESCE(to_jsonb(OLD)->>'id', to_jsonb(OLD)->>'phone'), 'DELETE', to_jsonb(OLD), NULL);
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS tables (
  id          SERIAL PRIMARY KEY,
  number      INT NOT NULL,
  capacity    INT NOT NULL,
  description TEXT,
  active      BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now(),
  deleted_at  TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS categories (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  emoji       TEXT DEFAULT '🍽️',
  description TEXT,
  sort_order  INT DEFAULT 0,
  active      BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now(),
  deleted_at  TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS products (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT,
  category_id INT REFERENCES categories(id),
  price       DECIMAL(10,2) NOT NULL,
  available   BOOLEAN DEFAULT true,
  image_url   TEXT,
  attributes  JSONB DEFAULT '{}',
  notes       TEXT,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now(),
  deleted_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_products_avail ON products(available) WHERE available = true;
CREATE INDEX IF NOT EXISTS idx_products_cat   ON products(category_id);

CREATE TABLE IF NOT EXISTS payment_types (
  id          SERIAL PRIMARY KEY,
  name        TEXT UNIQUE NOT NULL,
  type        TEXT NOT NULL,
  label       TEXT NOT NULL,
  config      JSONB DEFAULT '{}',
  active      BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now(),
  deleted_at  TIMESTAMPTZ
);
INSERT INTO payment_types (name, type, label, config) VALUES
  ('pix',      'digital', 'PIX',                    '{"key":"","holder":""}'),
  ('cartao',   'card',    'Cartão (débito/crédito)', '{}'),
  ('dinheiro', 'cash',    'Dinheiro',                '{}')
ON CONFLICT (name) DO NOTHING;

CREATE TABLE IF NOT EXISTS order_types (
  id          SERIAL PRIMARY KEY,
  name        TEXT UNIQUE NOT NULL,
  type        TEXT NOT NULL,
  label       TEXT NOT NULL,
  config      JSONB DEFAULT '{}',
  active      BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now(),
  deleted_at  TIMESTAMPTZ
);
INSERT INTO order_types (name, type, label, active) VALUES
  ('delivery', 'home_delivery', 'Entregar 🛵',         true),
  ('retirada', 'pickup',        'Retirada no local 📤', true),
  ('mesa',     'dine_in',       'Pedido na mesa 🍽️',  false)
ON CONFLICT (name) DO NOTHING;

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
INSERT INTO delivery_fee_rules (order_type_id, mode, base_fee, per_km_rate, per_min_rate, free_above, max_radius_km)
SELECT id, 'fixed', 0.00, 2.00, 0.50, 0.00, 10.00 FROM order_types WHERE name = 'delivery'
AND NOT EXISTS (SELECT 1 FROM delivery_fee_rules);

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

CREATE TABLE IF NOT EXISTS settings (
  id          SERIAL PRIMARY KEY,
  key         TEXT UNIQUE NOT NULL,
  value       TEXT NOT NULL,
  description TEXT,
  group_name  TEXT DEFAULT 'general',
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now(),
  deleted_at  TIMESTAMPTZ
);
-- n8n reuses this table internally without some columns — add them if missing
ALTER TABLE settings ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS group_name  TEXT DEFAULT 'general';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS created_at  TIMESTAMPTZ DEFAULT now();
ALTER TABLE settings ADD COLUMN IF NOT EXISTS updated_at  TIMESTAMPTZ DEFAULT now();
ALTER TABLE settings ADD COLUMN IF NOT EXISTS deleted_at  TIMESTAMPTZ;

INSERT INTO settings (key, value, description, group_name) VALUES
  ('establishment_name',        'Sakura Restaurante',                        'Name shown in messages',                                 'general'),
  ('opening_time',              '18:00',                                     'Opening time (HH:MM)',                                   'schedule'),
  ('closing_time',              '23:00',                                     'Closing time (HH:MM)',                                   'schedule'),
  ('working_days',              'tue,wed,thu,fri,sat,sun',                   'Working days (mon,tue,wed,thu,fri,sat,sun)',              'schedule'),
  ('msg_closed',                E'Olá! No momento estamos fechados 🌙\n\nHorário: Ter-Dom 18h-23h\n\nEm breve retornamos! 🌸', 'Out-of-hours message', 'messages'),
  ('msg_welcome',               'Olá! Bem-vindo ao Sakura 🌸',               'First message to customer',                             'messages'),
  ('min_order_value',           '30',                                        'Minimum order value in BRL',                            'delivery'),
  ('prep_time_min',             '30',                                        'Average prep time in minutes',                          'general'),
  ('establishment_lat',         '0',                                         'Establishment latitude',                                 'delivery'),
  ('establishment_lng',         '0',                                         'Establishment longitude',                                'delivery'),
  ('ignore_hours',              'false',                                     'Ignore opening hours (true in dev/qa)',                  'general'),
  ('establishment_city',        'São Paulo, SP',                             'City (used to validate deliveries)',                    'delivery'),
  ('establishment_address',     'Rua Exemplo, 123 — São Paulo, SP',          'Full address shown to customer',                        'delivery'),
  ('kitchen_phone',             '',                                          'Kitchen WhatsApp number for notifications',             'general'),
  ('session_ttl_min',           '60',                                        'Inactivity minutes before session expires (0=never)',   'general'),
  ('reminder_interval_days',    '7',                                         'Days since last order to send reminder (0=disabled)',   'general'),
  ('reminder_min_gap_days',     '7',                                         'Minimum days between two reminders to same customer',   'general'),
  ('reminder_send_hour',        '12',                                        'Hour of day (0-23) to send reminders',                  'general'),
  ('reminder_message_template', 'Olá, {name}! 😊 Faz {days} dias que você pediu {last_item}. Que saudade! Bora repetir? Digite *2* para pedir 🛒', 'Reminder template — vars: {name} {days} {last_item}', 'messages'),
  ('reservation_reminder_hour', '10',                                        'Hour of day (0-23) to send reservation reminders',     'general'),
  ('chatwoot_url',              'http://chatwoot:3000',                      'Internal Chatwoot URL',                                 'integrations'),
  ('chatwoot_public_url',       'http://localhost:3010',                     'Public Chatwoot URL — sent to agents',                  'integrations'),
  ('chatwoot_account_id',       '',                                          'Chatwoot account ID',                                   'integrations'),
  ('chatwoot_api_token',        '',                                          'Chatwoot agent API token',                              'integrations'),
  ('chatwoot_inbox_id',         '',                                          'Chatwoot WhatsApp inbox ID',                            'integrations'),
  ('agent_phone',               '',                                          'Agent WhatsApp number for handoff link',                'integrations')
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS faq (
  id          SERIAL PRIMARY KEY,
  category    TEXT,
  question    TEXT NOT NULL,
  answer      TEXT NOT NULL,
  keywords    TEXT,
  active      BOOLEAN DEFAULT true,
  usage_count INT DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now(),
  deleted_at  TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS customers (
  id               SERIAL PRIMARY KEY,
  phone            TEXT UNIQUE NOT NULL,
  name             TEXT,
  addresses        JSONB DEFAULT '[]',
  preferences      JSONB DEFAULT '{}',
  total_sessions   INT DEFAULT 0,
  total_spent      DECIMAL(10,2) DEFAULT 0,
  marketing_opt_in BOOLEAN DEFAULT NULL,
  last_promo_at    TIMESTAMPTZ,
  first_session_at TIMESTAMPTZ DEFAULT now(),
  last_session_at  TIMESTAMPTZ DEFAULT now(),
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now(),
  deleted_at       TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_customers_mktg ON customers(marketing_opt_in) WHERE marketing_opt_in = true AND deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS orders (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code           TEXT UNIQUE NOT NULL,
  customer_phone TEXT NOT NULL REFERENCES customers(phone),
  items          JSONB NOT NULL,
  subtotal       DECIMAL(10,2) NOT NULL,
  delivery_fee   DECIMAL(10,2) DEFAULT 0,
  discount       DECIMAL(10,2) DEFAULT 0,
  total          DECIMAL(10,2) NOT NULL,
  order_type     TEXT NOT NULL DEFAULT 'delivery' REFERENCES order_types(name),
  address        JSONB,
  table_id       INT REFERENCES tables(id),
  payment_method TEXT,
  change_for     DECIMAL(10,2),
  split_count    INT DEFAULT 0,
  split_payments JSONB,
  status         TEXT DEFAULT 'received',
  notified_status TEXT DEFAULT NULL,
  notes          TEXT,
  created_at     TIMESTAMPTZ DEFAULT now(),
  updated_at     TIMESTAMPTZ DEFAULT now(),
  deleted_at     TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_phone);
CREATE INDEX IF NOT EXISTS idx_orders_status   ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created  ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_active   ON orders(deleted_at) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS order_status_notifications (
  id               SERIAL PRIMARY KEY,
  status           TEXT NOT NULL UNIQUE,
  enabled          BOOLEAN NOT NULL DEFAULT true,
  message_template TEXT NOT NULL,
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now()
);
INSERT INTO order_status_notifications (status, enabled, message_template) VALUES
  ('confirmed',        true, E'✅ *Pedido confirmado, {name}!*\n\n📦 Pedido *#{code}* foi confirmado e logo entrará em preparo.\n\n_Avisaremos quando estiver pronto!_ 🌸'),
  ('preparing',        true, E'👨‍🍳 *Seu pedido está sendo preparado!*\n\n📦 Pedido *#{code}* está na cozinha agora.\n\n_Em breve fica pronto!_ 🌸'),
  ('out_for_delivery', true, E'🛵 *Pedido saiu para entrega, {name}!*\n\n📦 Pedido *#{code}* está a caminho.\n\n_Fique de olho — nosso entregador já está na rota!_ 🌸'),
  ('ready',            true, E'✅ *Seu pedido está pronto, {name}!*\n\n📦 Pedido *#{code}* está pronto.\n\n_Pode vir buscar!_ 🌸'),
  ('delivered',        true, E'🎉 *Pedido entregue, {name}!*\n\n📦 Pedido *#{code}* foi entregue.\n\nObrigado pela preferência! Esperamos te ver em breve. 🌸'),
  ('cancelled',        true, E'❌ *Pedido cancelado*\n\nInfelizmente o pedido *#{code}* foi cancelado.\n\nSe tiver dúvidas, responda esta mensagem e um atendente irá te ajudar.')
ON CONFLICT (status) DO NOTHING;

CREATE TABLE IF NOT EXISTS order_status_logs (
  id         SERIAL PRIMARY KEY,
  order_id   UUID REFERENCES orders(id),
  status     TEXT NOT NULL,
  note       TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS reservations (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code               TEXT UNIQUE NOT NULL,
  customer_phone     TEXT NOT NULL REFERENCES customers(phone),
  table_id           INT REFERENCES tables(id),
  date               DATE NOT NULL,
  time               TIME NOT NULL,
  party_size         INT NOT NULL,
  status             TEXT DEFAULT 'pending',
  notes              TEXT,
  reminder_1day_sent BOOLEAN NOT NULL DEFAULT false,
  reminder_day_sent  BOOLEAN NOT NULL DEFAULT false,
  created_at         TIMESTAMPTZ DEFAULT now(),
  updated_at         TIMESTAMPTZ DEFAULT now(),
  deleted_at         TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_reservations_cust ON reservations(customer_phone);
CREATE INDEX IF NOT EXISTS idx_reservations_date ON reservations(date, time);
CREATE INDEX IF NOT EXISTS idx_reservations_stat ON reservations(status);

CREATE TABLE IF NOT EXISTS reservation_status_logs (
  id             SERIAL PRIMARY KEY,
  reservation_id UUID REFERENCES reservations(id),
  status         TEXT NOT NULL,
  note           TEXT,
  created_at     TIMESTAMPTZ DEFAULT now(),
  updated_at     TIMESTAMPTZ DEFAULT now(),
  deleted_at     TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS sessions (
  phone                    TEXT PRIMARY KEY,
  state                    TEXT DEFAULT 'start',
  cart                     JSONB DEFAULT '{}',
  temp_data                JSONB DEFAULT '{}',
  reservation_temp         JSONB DEFAULT '{}',
  chatwoot_conversation_id TEXT,
  last_activity_at         TIMESTAMPTZ DEFAULT now(),
  created_at               TIMESTAMPTZ DEFAULT now(),
  updated_at               TIMESTAMPTZ DEFAULT now(),
  deleted_at               TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS question_logs (
  id                   SERIAL PRIMARY KEY,
  customer_phone       TEXT,
  question             TEXT NOT NULL,
  ai_response          TEXT,
  confidence           TEXT,
  transferred_to_human BOOLEAN DEFAULT false,
  became_faq           BOOLEAN DEFAULT false,
  faq_id               INT REFERENCES faq(id),
  created_at           TIMESTAMPTZ DEFAULT now(),
  updated_at           TIMESTAMPTZ DEFAULT now(),
  deleted_at           TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_questions_created ON question_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_questions_human   ON question_logs(transferred_to_human) WHERE transferred_to_human = true;

CREATE OR REPLACE FUNCTION calculate_distance_km(
  lat1 FLOAT, lon1 FLOAT, lat2 FLOAT, lon2 FLOAT
) RETURNS FLOAT AS $$
BEGIN
  RETURN 6371 * acos(
    LEAST(1.0,
      cos(radians(lat1)) * cos(radians(lat2)) *
      cos(radians(lon2) - radians(lon1)) +
      sin(radians(lat1)) * sin(radians(lat2))
    )
  );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE TABLE IF NOT EXISTS promotions (
  id           SERIAL PRIMARY KEY,
  title        TEXT NOT NULL,
  message      TEXT NOT NULL,
  scheduled_at TIMESTAMPTZ NOT NULL,
  sent_at      TIMESTAMPTZ,
  target       TEXT DEFAULT 'all',
  status       TEXT DEFAULT 'pending',
  sent_count   INT DEFAULT 0,
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now(),
  deleted_at   TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_promotions_sched ON promotions(scheduled_at) WHERE status = 'pending' AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_payment_active  ON payment_types(active) WHERE active = true AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_ordertype_active ON order_types(active)   WHERE active = true AND deleted_at IS NULL;

-- Triggers (idempotent via DROP IF EXISTS)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tr_orders_changelog')      THEN CREATE TRIGGER tr_orders_changelog      AFTER INSERT OR UPDATE OR DELETE ON orders       FOR EACH ROW EXECUTE FUNCTION fn_changelog(); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tr_customers_changelog')   THEN CREATE TRIGGER tr_customers_changelog   AFTER INSERT OR UPDATE OR DELETE ON customers    FOR EACH ROW EXECUTE FUNCTION fn_changelog(); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tr_reservations_changelog')THEN CREATE TRIGGER tr_reservations_changelog AFTER INSERT OR UPDATE OR DELETE ON reservations FOR EACH ROW EXECUTE FUNCTION fn_changelog(); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tr_products_changelog')    THEN CREATE TRIGGER tr_products_changelog    AFTER INSERT OR UPDATE OR DELETE ON products     FOR EACH ROW EXECUTE FUNCTION fn_changelog(); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tr_payment_types_changelog')THEN CREATE TRIGGER tr_payment_types_changelog AFTER INSERT OR UPDATE OR DELETE ON payment_types FOR EACH ROW EXECUTE FUNCTION fn_changelog(); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tr_order_types_changelog') THEN CREATE TRIGGER tr_order_types_changelog AFTER INSERT OR UPDATE OR DELETE ON order_types  FOR EACH ROW EXECUTE FUNCTION fn_changelog(); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tr_settings_changelog')    THEN CREATE TRIGGER tr_settings_changelog    AFTER INSERT OR UPDATE OR DELETE ON settings     FOR EACH ROW EXECUTE FUNCTION fn_changelog(); END IF;
END $$;

-- Views
CREATE OR REPLACE VIEW available_tables AS
SELECT t.id, t.number, t.capacity, t.description
FROM tables t
WHERE t.active = true AND t.deleted_at IS NULL
  AND t.id NOT IN (
    SELECT table_id FROM reservations
    WHERE status IN ('pending','confirmed') AND table_id IS NOT NULL
  );

CREATE OR REPLACE VIEW reservations_today AS
SELECT r.code, c.name AS customer_name, r.customer_phone,
       t.number AS table_number, r.time, r.party_size, r.status, r.notes
FROM reservations r
JOIN customers c ON c.phone = r.customer_phone
LEFT JOIN tables t ON t.id = r.table_id
WHERE r.date = CURRENT_DATE AND r.deleted_at IS NULL
ORDER BY r.time;

CREATE OR REPLACE VIEW pending_faqs AS
SELECT question,
       COUNT(*) AS times_asked,
       COUNT(*) FILTER (WHERE transferred_to_human = true) AS escalated,
       MAX(created_at) AS last_asked_at
FROM question_logs
WHERE became_faq = false AND deleted_at IS NULL
GROUP BY question
ORDER BY times_asked DESC;

CREATE OR REPLACE VIEW weekly_report AS
SELECT question,
       COUNT(*) AS total,
       ROUND(COUNT(*) FILTER (WHERE transferred_to_human = true) * 100.0 / COUNT(*), 0) AS pct_escalated
FROM question_logs
WHERE created_at >= now() - INTERVAL '7 days'
  AND became_faq = false AND deleted_at IS NULL
GROUP BY question
HAVING COUNT(*) >= 3
ORDER BY total DESC;
