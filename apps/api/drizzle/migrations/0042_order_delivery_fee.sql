-- Total do pedido passa a incluir a taxa de entrega (o cliente paga itens + taxa, e o caixa, os relatórios
-- e o histórico do cliente precisam do mesmo número). A taxa fica separada para a nota fiscal, que só leva os itens.
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "delivery_fee" numeric(10, 2) DEFAULT '0' NOT NULL;
--> statement-breakpoint
UPDATE "orders" AS o
SET "delivery_fee" = d."fee_amount",
    "total_amount" = o."total_amount" + d."fee_amount"
FROM "deliveries" AS d
WHERE d."order_id" = o."id"
  AND d."fee_amount" > 0
  AND o."delivery_fee" = 0;
