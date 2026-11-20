-- Pedido que chega da 99Food (padrão Open Delivery). O iFood já tinha canal próprio.
ALTER TYPE "order_channel" ADD VALUE IF NOT EXISTS '99food';
