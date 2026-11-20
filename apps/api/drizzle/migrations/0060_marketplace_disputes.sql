-- Negociações das plataformas (iFood: cancelamento/reembolso/atraso pedido pelo cliente; 99Food: pedido de
-- cancelamento ou reembolso). Ficam no painel com prazo e as respostas possíveis até a equipe responder ou o
-- prazo vencer (a plataforma aplica a resposta padrão).
CREATE TABLE IF NOT EXISTS marketplace_disputes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id uuid NOT NULL REFERENCES establishments(id) ON DELETE CASCADE,
  platform varchar(20) NOT NULL,
  external_id varchar(120) NOT NULL,
  order_id uuid REFERENCES orders(id) ON DELETE SET NULL,
  external_order_id varchar(100) NOT NULL,
  kind varchar(40) NOT NULL,
  message text,
  expires_at timestamptz,
  status varchar(20) NOT NULL DEFAULT 'open',
  payload jsonb NOT NULL,
  response jsonb,
  responded_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT marketplace_disputes_unique UNIQUE (platform, external_id)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS marketplace_disputes_open_idx ON marketplace_disputes (establishment_id, status, created_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS marketplace_disputes_order_idx ON marketplace_disputes (order_id);
