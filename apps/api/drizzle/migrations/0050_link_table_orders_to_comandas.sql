-- Pedidos de mesa lançados antes da conta da mesa ficavam sem comanda (`orders.comanda_id` nulo).
-- Liga os pedidos ainda abertos à comanda aberta da mesa (a mais antiga, se houver mais de uma),
-- para a conta mostrar o que já foi consumido. Comandas encerradas ficam como estão.
UPDATE orders o
SET comanda_id = (
  SELECT c.id FROM comandas c
  WHERE c.table_id = o.table_id AND c.establishment_id = o.establishment_id AND c.status = 'open'
    AND c.opened_at <= o.created_at
  ORDER BY c.opened_at
  LIMIT 1
)
WHERE o.comanda_id IS NULL
  AND o.type = 'table'
  AND o.table_id IS NOT NULL
  AND o.status NOT IN ('completed', 'cancelled');
