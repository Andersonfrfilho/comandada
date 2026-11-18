-- Foto do produto (cardápio online e painel). Os bytes ficam numa tabela à parte para a lista de
-- produtos e o contexto do bot lerem só a versão.
ALTER TABLE products ADD COLUMN IF NOT EXISTS image_version varchar(16);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS product_images (
  product_id uuid PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
  content bytea NOT NULL,
  content_type varchar(40) NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
