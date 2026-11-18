-- Pedido feito pelo cardápio online (página pública): canal próprio para o painel e os relatórios
-- separarem do WhatsApp. O cliente informa o WhatsApp e recebe os avisos de status por lá.
ALTER TYPE "order_channel" ADD VALUE IF NOT EXISTS 'web';
