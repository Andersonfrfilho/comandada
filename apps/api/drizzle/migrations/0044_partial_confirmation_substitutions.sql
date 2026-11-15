-- Confirmação parcial com troca: para cada item em falta a equipe pode sugerir outro produto do mesmo
-- tipo. Guarda a sugestão e as alternativas oferecidas ao cliente (preço na hora do pedido de troca;
-- a resposta relê o preço do cadastro).
ALTER TABLE "order_partial_confirmations" ADD COLUMN IF NOT EXISTS "substitutions" jsonb DEFAULT '[]'::jsonb NOT NULL;
