-- Cópia (só INSERT ... ON CONFLICT DO NOTHING) de insumos, fichas, saldos, lotes e movimentos para os schemas
-- `recipes` e `stock` do SDK. As tabelas antigas não são tocadas. Exige que runRecipeMigrations e runStockMigrations
-- tenham rodado antes (ver connection.ts); idempotente: rodar de novo não duplica nem sobrescreve.
DO $$
BEGIN
  IF to_regclass('recipes.ingredients') IS NULL OR to_regclass('stock.levels') IS NULL THEN
    RAISE EXCEPTION 'Schemas recipes/stock ausentes: rode runRecipeMigrations e runStockMigrations antes das migrations do Drizzle';
  END IF;
  IF EXISTS (SELECT 1 FROM public.ingredients WHERE unit NOT IN ('mg','g','kg','ml','l','un','dz') OR cost_per_unit < 0) THEN
    RAISE EXCEPTION 'Insumo com unidade fora do módulo ou custo negativo: corrigir antes de migrar';
  END IF;
  IF EXISTS (SELECT 1 FROM public.ingredients WHERE minimum_stock < 0) THEN
    RAISE EXCEPTION 'Insumo com estoque mínimo negativo (stock.levels.minimum_quantity >= 0): corrigir antes de migrar';
  END IF;
  IF EXISTS (SELECT 1 FROM public.products WHERE preparation_time_minutes < 0) THEN
    RAISE EXCEPTION 'Produto com tempo de preparo negativo (recipes_preparation_not_negative): corrigir antes de migrar';
  END IF;
  IF EXISTS (SELECT 1 FROM public.stock_movements WHERE movement_type NOT IN ('in','out','return','adjustment','loss')) THEN
    RAISE EXCEPTION 'Movimento de estoque com tipo desconhecido (in, out, return, adjustment, loss): corrigir antes de migrar';
  END IF;
  IF EXISTS (SELECT 1 FROM public.product_ingredients WHERE quantity <= 0) THEN
    RAISE EXCEPTION 'Linha de ficha com quantidade <= 0: corrigir antes de migrar';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.product_ingredients pi
    JOIN public.products p ON p.id = pi.product_id
    JOIN public.ingredients i ON i.id = pi.ingredient_id
    WHERE p.establishment_id <> i.establishment_id
  ) THEN
    RAISE EXCEPTION 'Linha de ficha com insumo de outra empresa: corrigir antes de migrar';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.stock_batches
    WHERE remaining_quantity < 0 OR remaining_quantity > quantity OR quantity <= 0
  ) THEN
    RAISE EXCEPTION 'Lote com quantidade inválida: corrigir antes de migrar';
  END IF;
END $$;
--> statement-breakpoint
INSERT INTO recipes.ingredients (id, company_id, name, unit, cost_per_unit, created_at, updated_at)
SELECT id, establishment_id, left(name, 160), unit, cost_per_unit, created_at, updated_at
FROM public.ingredients
ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipes.recipes (company_id, product_id, yield_portions, preparation_time_minutes, instructions)
SELECT p.establishment_id, p.id::text, 1, p.preparation_time_minutes, coalesce(p.preparation_instructions, '')
FROM public.products p
WHERE EXISTS (SELECT 1 FROM public.product_ingredients pi WHERE pi.product_id = p.id)
   OR p.preparation_time_minutes IS NOT NULL
   OR coalesce(p.preparation_instructions, '') <> ''
ON CONFLICT (company_id, product_id) DO NOTHING;
--> statement-breakpoint
-- Unidade da linha: mesma dimensão (massa mg/g/kg, volume ml/l, contagem un/dz) mantém a da linha e o módulo converte;
-- dimensão diferente usa a do insumo. A alternativa (migrar tudo na unidade do insumo) é trocar o CASE por i.unit.
INSERT INTO recipes.recipe_lines (id, company_id, recipe_id, ingredient_id, quantity, unit, notes, position, created_at, updated_at)
SELECT pi.id, p.establishment_id, r.id, pi.ingredient_id, pi.quantity,
       CASE
         WHEN pi.unit = i.unit THEN pi.unit
         WHEN (CASE pi.unit WHEN 'mg' THEN 'mass' WHEN 'g' THEN 'mass' WHEN 'kg' THEN 'mass'
                            WHEN 'ml' THEN 'volume' WHEN 'l' THEN 'volume'
                            WHEN 'un' THEN 'count' WHEN 'dz' THEN 'count' END)
            = (CASE i.unit WHEN 'mg' THEN 'mass' WHEN 'g' THEN 'mass' WHEN 'kg' THEN 'mass'
                           WHEN 'ml' THEN 'volume' WHEN 'l' THEN 'volume'
                           WHEN 'un' THEN 'count' WHEN 'dz' THEN 'count' END)
           THEN pi.unit
         ELSE i.unit
       END,
       pi.notes,
       row_number() OVER (PARTITION BY pi.product_id ORDER BY pi.created_at, pi.id) - 1,
       pi.created_at, pi.updated_at
FROM public.product_ingredients pi
JOIN public.products p ON p.id = pi.product_id
JOIN public.ingredients i ON i.id = pi.ingredient_id
JOIN recipes.recipes r ON r.company_id = p.establishment_id AND r.product_id = p.id::text
ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO stock.levels (company_id, ingredient_id, unit, quantity, minimum_quantity, created_at, updated_at)
SELECT establishment_id, id, unit, stock_quantity, minimum_stock, created_at, updated_at
FROM public.ingredients
ON CONFLICT (company_id, ingredient_id) DO NOTHING;
--> statement-breakpoint
INSERT INTO stock.batches (id, company_id, ingredient_id, batch_code, unit, quantity, remaining_quantity, cost_per_unit, expires_at, received_at)
SELECT b.id, b.establishment_id, b.ingredient_id, left(b.batch_number, 100), i.unit, b.quantity, b.remaining_quantity, b.cost_per_unit, b.expires_at, b.created_at
FROM public.stock_batches b
JOIN public.ingredients i ON i.id = b.ingredient_id
ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
-- Tipos antigos: in, out, return (devolução por cancelamento, quantidade positiva), adjustment e loss (já com sinal).
INSERT INTO stock.movements (id, company_id, ingredient_id, batch_id, kind, delta, unit, reason, actor_id, source_key, created_at)
SELECT m.id, m.establishment_id, m.ingredient_id, m.batch_id,
       CASE m.movement_type WHEN 'adjustment' THEN 'adjust' WHEN 'return' THEN 'in' ELSE m.movement_type END,
       CASE m.movement_type WHEN 'in' THEN abs(m.quantity) WHEN 'return' THEN abs(m.quantity) WHEN 'out' THEN -abs(m.quantity) ELSE m.quantity END,
       i.unit,
       left(coalesce(nullif(m.reason, ''), 'Migrado'), 255),
       m.user_id::text,
       CASE WHEN m.order_id IS NOT NULL THEN 'order:' || m.order_id || ':legacy' END,
       m.created_at
FROM public.stock_movements m
JOIN public.ingredients i ON i.id = m.ingredient_id
WHERE m.quantity <> 0
ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
-- Pedido com baixa ainda valendo (um 'out' depois da última devolução) não pode baixar de novo pelo módulo: marca cada item como aplicado.
INSERT INTO stock.deductions (company_id, source_key, created_at)
SELECT DISTINCT o.establishment_id, 'order:' || o.id || ':' || oi.id, now()
FROM public.orders o
JOIN public.order_items oi ON oi.order_id = o.id
WHERE EXISTS (
  SELECT 1 FROM public.stock_movements m
  WHERE m.order_id = o.id AND m.movement_type = 'out'
    AND m.created_at > coalesce(
      (SELECT max(r.created_at) FROM public.stock_movements r WHERE r.order_id = o.id AND r.movement_type = 'return'),
      '-infinity'::timestamptz)
)
ON CONFLICT DO NOTHING;
