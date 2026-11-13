-- ============================================
-- Migration v2 — aplicar sobre banco existente
-- ============================================

-- 1. orders: remover FK de payment_method, adicionar split_count + split_payments
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_payment_method_fkey;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS split_count    INT DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS split_payments JSONB;

-- 2. customers: popular first_session_at que pode estar NULL
ALTER TABLE customers ALTER COLUMN first_session_at SET DEFAULT now();
ALTER TABLE customers ALTER COLUMN last_session_at  SET DEFAULT now();
UPDATE customers SET first_session_at = created_at WHERE first_session_at IS NULL;
UPDATE customers SET last_session_at  = created_at WHERE last_session_at  IS NULL;

-- 3. settings: adicionar establishment_city se não existir
INSERT INTO settings (key, value, description, group_name)
VALUES ('establishment_city', 'São Paulo, SP', 'Cidade do estabelecimento (usada para validar entregas)', 'delivery')
ON CONFLICT (key) DO NOTHING;

-- 4. fn_changelog: habilitar captura de INSERTs
CREATE OR REPLACE FUNCTION fn_changelog()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO changelogs (table_name, record_id, action, old_data, new_data)
    VALUES (TG_TABLE_NAME,
            COALESCE(to_jsonb(NEW)->>'id', to_jsonb(NEW)->>'phone'),
            'INSERT', NULL, to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO changelogs (table_name, record_id, action, old_data, new_data)
    VALUES (TG_TABLE_NAME,
            COALESCE(to_jsonb(OLD)->>'id', to_jsonb(OLD)->>'phone'),
            'UPDATE', to_jsonb(OLD), to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO changelogs (table_name, record_id, action, old_data, new_data)
    VALUES (TG_TABLE_NAME,
            COALESCE(to_jsonb(OLD)->>'id', to_jsonb(OLD)->>'phone'),
            'DELETE', to_jsonb(OLD), NULL);
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- 5. Triggers: adicionar INSERT aos existentes + criar trigger de settings
DROP TRIGGER IF EXISTS tr_orders_changelog       ON orders;
DROP TRIGGER IF EXISTS tr_customers_changelog    ON customers;
DROP TRIGGER IF EXISTS tr_reservations_changelog ON reservations;
DROP TRIGGER IF EXISTS tr_products_changelog     ON products;
DROP TRIGGER IF EXISTS tr_payment_types_changelog ON payment_types;
DROP TRIGGER IF EXISTS tr_order_types_changelog  ON order_types;
DROP TRIGGER IF EXISTS tr_settings_changelog     ON settings;

CREATE TRIGGER tr_orders_changelog
  AFTER INSERT OR UPDATE OR DELETE ON orders
  FOR EACH ROW EXECUTE FUNCTION fn_changelog();

CREATE TRIGGER tr_customers_changelog
  AFTER INSERT OR UPDATE OR DELETE ON customers
  FOR EACH ROW EXECUTE FUNCTION fn_changelog();

CREATE TRIGGER tr_reservations_changelog
  AFTER INSERT OR UPDATE OR DELETE ON reservations
  FOR EACH ROW EXECUTE FUNCTION fn_changelog();

CREATE TRIGGER tr_products_changelog
  AFTER INSERT OR UPDATE OR DELETE ON products
  FOR EACH ROW EXECUTE FUNCTION fn_changelog();

CREATE TRIGGER tr_payment_types_changelog
  AFTER INSERT OR UPDATE OR DELETE ON payment_types
  FOR EACH ROW EXECUTE FUNCTION fn_changelog();

CREATE TRIGGER tr_order_types_changelog
  AFTER INSERT OR UPDATE OR DELETE ON order_types
  FOR EACH ROW EXECUTE FUNCTION fn_changelog();

CREATE TRIGGER tr_settings_changelog
  AFTER INSERT OR UPDATE OR DELETE ON settings
  FOR EACH ROW EXECUTE FUNCTION fn_changelog();

-- 6. settings: adicionar session_ttl_min se não existir
INSERT INTO settings (key, value, description, group_name)
VALUES ('session_ttl_min', '60', 'Minutos de inatividade para expirar sessão (0 = nunca expira)', 'general')
ON CONFLICT (key) DO NOTHING;

-- 7. customers: adicionar marketing_opt_in
ALTER TABLE customers ADD COLUMN IF NOT EXISTS marketing_opt_in BOOLEAN DEFAULT NULL;

-- 8. settings: kitchen_phone + establishment_address
INSERT INTO settings (key, value, description, group_name) VALUES
  ('kitchen_phone',         '',                                   'Número do celular da cozinha para notificações', 'general'),
  ('establishment_address', 'Rua Exemplo, 123 — São Paulo, SP',   'Endereço completo do estabelecimento', 'delivery')
ON CONFLICT (key) DO NOTHING;

-- 9. promotions table (se não existir)
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

CREATE INDEX IF NOT EXISTS idx_customers_mktg   ON customers(marketing_opt_in) WHERE marketing_opt_in = true AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_promotions_sched ON promotions(scheduled_at) WHERE status = 'pending' AND deleted_at IS NULL;

-- 10. customers: last_promo_at
ALTER TABLE customers ADD COLUMN IF NOT EXISTS last_promo_at TIMESTAMPTZ;

-- 11. settings: reminder_* + reminder_message_template
INSERT INTO settings (key, value, description, group_name) VALUES
  ('reminder_interval_days',   '7',   'Dias desde o último pedido para enviar lembrete (0 = desativado)',         'general'),
  ('reminder_min_gap_days',    '7',   'Intervalo mínimo em dias entre dois lembretes ao mesmo cliente',           'general'),
  ('reminder_send_hour',       '12',  'Hora do dia (0-23) para disparar os lembretes',                           'general'),
  ('reminder_message_template','Olá, {name}! 😊 Faz {days} dias que você pediu {last_item}. Que saudade! Bora repetir? Digite *2* para pedir 🛒', 'Template do lembrete', 'messages')
ON CONFLICT (key) DO NOTHING;
