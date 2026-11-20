-- Pedidos de marketplaces (iFood, 99Food): liga o pedido da plataforma ao pedido do painel e guarda o
-- último status avisado à plataforma, para o mesmo pedido não entrar duas vezes nem o aviso voltar em eco.
CREATE TABLE IF NOT EXISTS marketplace_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id uuid NOT NULL REFERENCES establishments(id) ON DELETE CASCADE,
  platform varchar(20) NOT NULL,
  external_id varchar(100) NOT NULL,
  display_id varchar(40),
  merchant_id varchar(100),
  order_id uuid REFERENCES orders(id) ON DELETE SET NULL,
  platform_status varchar(30) NOT NULL DEFAULT 'placed',
  delivered_by varchar(20),
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT marketplace_orders_unique UNIQUE (platform, external_id)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS marketplace_orders_order_idx ON marketplace_orders (order_id);
--> statement-breakpoint
-- Eventos já tratados (polling e webhook podem entregar o mesmo evento mais de uma vez).
CREATE TABLE IF NOT EXISTS marketplace_events (
  platform varchar(20) NOT NULL,
  event_id varchar(100) NOT NULL,
  event_code varchar(40) NOT NULL,
  external_order_id varchar(100),
  received_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (platform, event_id)
);
