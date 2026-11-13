-- ============================================
-- Schema — Bot de Atendimento (tabelas exclusivas)
-- PostgreSQL (self-hosted ou Supabase)
-- Convenção: snake_case inglês em tudo
--
-- Tabelas compartilhadas com Order Hub (Drizzle):
--   categories, customers, orders, products, settings, tables
--   → criadas pelas migrations do Drizzle em apps/api/drizzle/migrations/
--
-- Este arquivo cria APENAS as tabelas exclusivas do bot.
-- ============================================

-- ============================================
-- Tabela de changelog / snapshot de alterações
-- ============================================
CREATE TABLE IF NOT EXISTS changelogs (
  id          BIGSERIAL PRIMARY KEY,
  table_name  TEXT NOT NULL,
  record_id   TEXT,
  action      TEXT NOT NULL,          -- INSERT | UPDATE | DELETE
  old_data    JSONB,
  new_data    JSONB,
  changed_by  TEXT DEFAULT 'system',
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_changelogs_table  ON changelogs(table_name, record_id);
CREATE INDEX IF NOT EXISTS idx_changelogs_time   ON changelogs(created_at DESC);

-- ============================================
-- Função genérica de changelog (usada pelos triggers)
-- ============================================
CREATE OR REPLACE FUNCTION fn_changelog()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO changelogs (table_name, record_id, action, old_data, new_data)
    VALUES (TG_TABLE_NAME,
            COALESCE(to_jsonb(NEW)->>'id', to_jsonb(NEW)->>'whatsapp_number', to_jsonb(NEW)->>'phone'),
            'INSERT', NULL, to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO changelogs (table_name, record_id, action, old_data, new_data)
    VALUES (TG_TABLE_NAME,
            COALESCE(to_jsonb(OLD)->>'id', to_jsonb(OLD)->>'whatsapp_number', to_jsonb(OLD)->>'phone'),
            'UPDATE', to_jsonb(OLD), to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO changelogs (table_name, record_id, action, old_data, new_data)
    VALUES (TG_TABLE_NAME,
            COALESCE(to_jsonb(OLD)->>'id', to_jsonb(OLD)->>'whatsapp_number', to_jsonb(OLD)->>'phone'),
            'DELETE', to_jsonb(OLD), NULL);
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- payment_types (meios de pagamento)
-- ============================================
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

INSERT INTO payment_types (name, type, label, config) VALUES
  ('pix',      'digital', 'PIX',                    '{"chave":"","nome":""}'),
  ('cartao',   'card',    'Cartão (débito/crédito)', '{}'),
  ('dinheiro', 'cash',    'Dinheiro',                '{}')
ON CONFLICT (name) DO NOTHING;

-- ============================================
-- order_types (modalidades de entrega)
-- ============================================
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

INSERT INTO order_types (name, type, label, active) VALUES
  ('delivery', 'home_delivery', 'Entregar 🛵',          true),
  ('retirada', 'pickup',        'Retirada no local 📤',  true),
  ('mesa',     'dine_in',       'Pedido na mesa 🍽️',   false)
ON CONFLICT (name) DO NOTHING;

-- ============================================
-- delivery_fee_rules (regras de taxa de entrega)
-- ============================================
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
ON CONFLICT DO NOTHING;

-- ============================================
-- delivery_fee_zones (faixas por km ou minuto)
-- ============================================
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

INSERT INTO delivery_fee_zones (delivery_fee_rule_id, zone_type, min_value, max_value, fee, label)
SELECT r.id, 'km',  0,  3,  5.00, 'Zona 1 — até 3 km'      FROM delivery_fee_rules r JOIN order_types o ON o.id = r.order_type_id WHERE o.name='delivery' UNION ALL
SELECT r.id, 'km',  3,  6,  8.00, 'Zona 2 — 3 a 6 km'      FROM delivery_fee_rules r JOIN order_types o ON o.id = r.order_type_id WHERE o.name='delivery' UNION ALL
SELECT r.id, 'km',  6, 10, 12.00, 'Zona 3 — 6 a 10 km'     FROM delivery_fee_rules r JOIN order_types o ON o.id = r.order_type_id WHERE o.name='delivery' UNION ALL
SELECT r.id, 'min', 0, 15,  5.00, 'Rápido — até 15 min'    FROM delivery_fee_rules r JOIN order_types o ON o.id = r.order_type_id WHERE o.name='delivery' UNION ALL
SELECT r.id, 'min',15, 30,  8.00, 'Médio — 15 a 30 min'    FROM delivery_fee_rules r JOIN order_types o ON o.id = r.order_type_id WHERE o.name='delivery' UNION ALL
SELECT r.id, 'min',30, 60, 12.00, 'Distante — 30 a 60 min' FROM delivery_fee_rules r JOIN order_types o ON o.id = r.order_type_id WHERE o.name='delivery'
ON CONFLICT DO NOTHING;

-- ============================================
-- settings (configurações extras do bot — complementa settings do Drizzle)
-- ============================================
-- Nota: o Order Hub usa a tabela `settings` do Drizzle (id UUID, value JSONB).
-- Esta tabela `bot_settings` armazena configurações exclusivas do bot (mensagens,
-- horários, templates) que o Order Hub não precisa.
-- ============================================
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

INSERT INTO bot_settings (key, value, description, group_name) VALUES
  ('establishment_name',  'Sakura Restaurante',   'Nome exibido nas mensagens',                               'general'),
  ('opening_time',        '18:00',                'Horário de abertura (HH:MM)',                              'schedule'),
  ('closing_time',        '23:00',                'Horário de fechamento (HH:MM)',                            'schedule'),
  ('working_days',        'ter,qua,qui,sex,sab,dom', 'Dias da semana (seg,ter,qua,qui,sex,sab,dom)',          'schedule'),
  ('msg_closed',          E'Olá! No momento estamos fechados 🌙\n\nNosso horário de funcionamento:\nTer-Dom: 18h às 23h\n\nEm breve retornamos! 🌸', 'Mensagem fora do horário', 'messages'),
  ('msg_welcome',         'Olá! Bem-vindo ao Sakura 🌸', 'Primeira mensagem ao cliente',                     'messages'),
  ('min_order_value',     '30',                   'Valor mínimo do pedido em reais',                         'delivery'),
  ('prep_time_min',       '30',                   'Tempo médio de preparo em minutos',                       'general'),
  ('establishment_lat',   '0',                    'Latitude do estabelecimento',                             'delivery'),
  ('establishment_lng',   '0',                    'Longitude do estabelecimento',                            'delivery'),
  ('ignore_hours',        'false',                'Ignorar horário de funcionamento (true em dev/qa)',        'general'),
  ('evolution_api_key',   '',                     'API key da Evolution API',                                'general'),
  ('establishment_city',    'São Paulo, SP',        'Cidade do estabelecimento (usada para validar entregas)',  'delivery'),
  ('establishment_address', 'Rua Exemplo, 123 — São Paulo, SP', 'Endereço completo do estabelecimento (exibido ao cliente)', 'delivery'),
  ('kitchen_phone',            '',           'Número do celular da cozinha para notificações (ex: 5511999999999)', 'general'),
  ('session_ttl_min',          '60',         'Minutos de inatividade para expirar sessão (0 = nunca expira)',         'general'),
  ('reminder_interval_days',   '7',          'Dias desde o último pedido para enviar lembrete (0 = desativado)',      'general'),
  ('reminder_min_gap_days',    '7',          'Intervalo mínimo em dias entre dois lembretes/promoções ao mesmo cliente', 'general'),
  ('reminder_send_hour',       '12',         'Hora do dia (0-23) para disparar os lembretes',                        'general'),
  ('reminder_message_template','Olá, {name}! 😊 Faz {days} dias que você pediu {last_item}. Que saudade! Bora repetir? Digite *2* para pedir 🛒', 'Template do lembrete — variáveis: {name} {days} {last_item}', 'messages'),
  ('reservation_reminder_hour','10',          'Hora do dia (0-23) para disparar lembretes de reserva',               'general'),
  ('agent_phone',         '',                     'Número WhatsApp do atendente para receber o link (ex: 5511999999999)', 'integrations')
ON CONFLICT (key) DO NOTHING;

-- ============================================
-- faq
-- ============================================
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

-- ============================================
-- order_status_notifications (config de alertas por status)
-- ============================================
CREATE TABLE IF NOT EXISTS order_status_notifications (
  id               SERIAL PRIMARY KEY,
  status           TEXT NOT NULL UNIQUE,
  enabled          BOOLEAN NOT NULL DEFAULT true,
  message_template TEXT NOT NULL,    -- suporta {name}, {code}, {order_type}
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

-- ============================================
-- order_status_logs (histórico de status do pedido)
-- ============================================
CREATE TABLE IF NOT EXISTS order_status_logs (
  id         SERIAL PRIMARY KEY,
  order_id   UUID,  -- FK validated at app level (Drizzle owns orders)
  status     TEXT NOT NULL,
  note       TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

-- ============================================
-- reservations (reservas de mesa)
-- ============================================
CREATE TABLE IF NOT EXISTS reservations (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code           TEXT UNIQUE NOT NULL,
  customer_id    UUID NOT NULL,  -- FK validated at app level (Drizzle owns customers)
  table_id       UUID,  -- FK validated at app level (Drizzle owns tables)
  date           DATE NOT NULL,
  time           TIME NOT NULL,
  party_size     INT NOT NULL,
  status              TEXT DEFAULT 'pending',  -- pending | confirmed | cancelled | completed | no_show
  notes               TEXT,
  reminder_1day_sent  BOOLEAN NOT NULL DEFAULT false,
  reminder_day_sent   BOOLEAN NOT NULL DEFAULT false,
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now(),
  deleted_at          TIMESTAMPTZ
);

-- ============================================
-- reservation_status_logs
-- ============================================
CREATE TABLE IF NOT EXISTS reservation_status_logs (
  id             SERIAL PRIMARY KEY,
  reservation_id UUID REFERENCES reservations(id),
  status         TEXT NOT NULL,
  note           TEXT,
  created_at     TIMESTAMPTZ DEFAULT now(),
  updated_at     TIMESTAMPTZ DEFAULT now(),
  deleted_at     TIMESTAMPTZ
);

-- ============================================
-- sessions (sessões de conversa — estado do bot)
-- ============================================
CREATE TABLE IF NOT EXISTS sessions (
  phone                    TEXT PRIMARY KEY,
  state                    TEXT DEFAULT 'start',
  cart                     JSONB DEFAULT '{}',
  temp_data                JSONB DEFAULT '{}',
  reservation_temp         JSONB DEFAULT '{}',
  last_activity_at         TIMESTAMPTZ DEFAULT now(),
  created_at               TIMESTAMPTZ DEFAULT now(),
  updated_at               TIMESTAMPTZ DEFAULT now(),
  deleted_at               TIMESTAMPTZ
);

-- ============================================
-- question_logs (log de perguntas feitas à IA)
-- ============================================
CREATE TABLE IF NOT EXISTS question_logs (
  id                   SERIAL PRIMARY KEY,
  customer_phone       TEXT,
  question             TEXT NOT NULL,
  ai_response          TEXT,
  confidence           TEXT,           -- high | medium | low
  transferred_to_human BOOLEAN DEFAULT false,
  became_faq           BOOLEAN DEFAULT false,
  faq_id               INT REFERENCES faq(id),
  created_at           TIMESTAMPTZ DEFAULT now(),
  updated_at           TIMESTAMPTZ DEFAULT now(),
  deleted_at           TIMESTAMPTZ
);

-- ============================================
-- Função de geolocalização (haversine)
-- ============================================
CREATE OR REPLACE FUNCTION calculate_distance_km(
  lat1 FLOAT, lon1 FLOAT,
  lat2 FLOAT, lon2 FLOAT
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

-- ============================================
-- promotions (promoções agendadas para envio em massa)
-- ============================================
CREATE TABLE IF NOT EXISTS promotions (
  id           SERIAL PRIMARY KEY,
  title        TEXT NOT NULL,
  message      TEXT NOT NULL,
  scheduled_at TIMESTAMPTZ NOT NULL,
  sent_at      TIMESTAMPTZ,
  target       TEXT DEFAULT 'all',  -- all | opted_in
  status       TEXT DEFAULT 'pending',  -- pending | sending | sent | cancelled
  sent_count   INT DEFAULT 0,
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now(),
  deleted_at   TIMESTAMPTZ
);

-- ============================================
-- Índices
-- ============================================
CREATE INDEX IF NOT EXISTS idx_reservations_cust  ON reservations(customer_id);
CREATE INDEX IF NOT EXISTS idx_reservations_date  ON reservations(date, time);
CREATE INDEX IF NOT EXISTS idx_reservations_stat  ON reservations(status);
CREATE INDEX IF NOT EXISTS idx_questions_created  ON question_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_questions_human    ON question_logs(transferred_to_human) WHERE transferred_to_human = true;
CREATE INDEX IF NOT EXISTS idx_payment_active     ON payment_types(active) WHERE active = true AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_ordertype_active   ON order_types(active) WHERE active = true AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_promotions_sched   ON promotions(scheduled_at) WHERE status = 'pending' AND deleted_at IS NULL;

-- ============================================
-- Changelog triggers (tabelas exclusivas do bot)
-- ============================================
DO $$ BEGIN
  EXECUTE 'DROP TRIGGER IF EXISTS tr_reservations_changelog ON reservations';
EXCEPTION WHEN undefined_table THEN NULL;
END $$;
CREATE TRIGGER tr_reservations_changelog
  AFTER INSERT OR UPDATE OR DELETE ON reservations
  FOR EACH ROW EXECUTE FUNCTION fn_changelog();

DO $$ BEGIN
  EXECUTE 'DROP TRIGGER IF EXISTS tr_payment_types_changelog ON payment_types';
EXCEPTION WHEN undefined_table THEN NULL;
END $$;
CREATE TRIGGER tr_payment_types_changelog
  AFTER INSERT OR UPDATE OR DELETE ON payment_types
  FOR EACH ROW EXECUTE FUNCTION fn_changelog();

DO $$ BEGIN
  EXECUTE 'DROP TRIGGER IF EXISTS tr_order_types_changelog ON order_types';
EXCEPTION WHEN undefined_table THEN NULL;
END $$;
CREATE TRIGGER tr_order_types_changelog
  AFTER INSERT OR UPDATE OR DELETE ON order_types
  FOR EACH ROW EXECUTE FUNCTION fn_changelog();

DO $$ BEGIN
  EXECUTE 'DROP TRIGGER IF EXISTS tr_bot_settings_changelog ON bot_settings';
EXCEPTION WHEN undefined_table THEN NULL;
END $$;
CREATE TRIGGER tr_bot_settings_changelog
  AFTER INSERT OR UPDATE OR DELETE ON bot_settings
  FOR EACH ROW EXECUTE FUNCTION fn_changelog();

-- ============================================
-- Views
-- ============================================
CREATE OR REPLACE VIEW available_tables AS
SELECT t.id, t.number, t.capacity
FROM tables t
WHERE t.status = 'available'
  AND t.id NOT IN (
    SELECT table_id FROM reservations
    WHERE status IN ('pending','confirmed') AND table_id IS NOT NULL
  );

CREATE OR REPLACE VIEW reservations_today AS
SELECT r.code, c.name AS customer_name, c.whatsapp_number AS customer_phone,
       t.number AS table_number, r.time, r.party_size, r.status, r.notes
FROM reservations r
JOIN customers c ON c.id = r.customer_id
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
