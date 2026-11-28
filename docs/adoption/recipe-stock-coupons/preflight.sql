-- Pré-voo da migration 0061 (recipe_stock_sdk). Somente SELECT, sem dado pessoal: rodar em staging/produção antes do deploy.
-- Parte 1: condições bloqueantes. Todo `blocking_rows` diferente de 0 faz a migration abortar.
SELECT condition, blocking_rows FROM (
  SELECT 1 AS ord, 'insumo com unidade fora do módulo ou custo negativo' AS condition,
         count(*) AS blocking_rows
  FROM public.ingredients WHERE unit NOT IN ('mg','g','kg','ml','l','un','dz') OR cost_per_unit < 0
  UNION ALL
  SELECT 2, 'insumo com estoque mínimo negativo', count(*) FROM public.ingredients WHERE minimum_stock < 0
  UNION ALL
  SELECT 3, 'produto com tempo de preparo negativo', count(*) FROM public.products WHERE preparation_time_minutes < 0
  UNION ALL
  SELECT 4, 'movimento com tipo desconhecido', count(*)
  FROM public.stock_movements WHERE movement_type NOT IN ('in','out','return','adjustment','loss')
  UNION ALL
  SELECT 5, 'linha de ficha com quantidade <= 0', count(*) FROM public.product_ingredients WHERE quantity <= 0
  UNION ALL
  SELECT 6, 'linha de ficha com insumo de outra empresa', count(*)
  FROM public.product_ingredients pi
  JOIN public.products p ON p.id = pi.product_id
  JOIN public.ingredients i ON i.id = pi.ingredient_id
  WHERE p.establishment_id <> i.establishment_id
  UNION ALL
  SELECT 7, 'lote com quantidade inválida', count(*)
  FROM public.stock_batches WHERE remaining_quantity < 0 OR remaining_quantity > quantity OR quantity <= 0
  UNION ALL
  SELECT 8, 'schemas recipes/stock ausentes (rodar runRecipeStockMigrations antes)',
         CASE WHEN to_regclass('recipes.ingredients') IS NULL OR to_regclass('stock.levels') IS NULL THEN 1 ELSE 0 END
) checks ORDER BY ord;

-- Parte 2: contagens de origem (§3.1).
SELECT 'insumos' AS item, count(*) AS total FROM public.ingredients
UNION ALL SELECT 'linhas de ficha', count(*) FROM public.product_ingredients
UNION ALL SELECT 'produtos com ficha', count(DISTINCT product_id) FROM public.product_ingredients
UNION ALL SELECT 'produtos com preparo', count(*) FROM public.products
  WHERE preparation_time_minutes IS NOT NULL OR coalesce(preparation_instructions, '') <> ''
UNION ALL SELECT 'lotes', count(*) FROM public.stock_batches
UNION ALL SELECT 'movimentos (total)', count(*) FROM public.stock_movements
UNION ALL SELECT 'movimentos com quantidade <> 0', count(*) FROM public.stock_movements WHERE quantity <> 0
UNION ALL SELECT 'movimentos tipo ' || movement_type, count(*) FROM public.stock_movements GROUP BY movement_type;

-- Parte 3: mesma dimensão, unidade diferente (a linha mantém a sua unidade e o módulo converte).
SELECT pi.unit AS line_unit, i.unit AS ingredient_unit, count(*) AS total
FROM public.product_ingredients pi
JOIN public.ingredients i ON i.id = pi.ingredient_id
WHERE pi.unit <> i.unit
  AND (CASE pi.unit WHEN 'mg' THEN 'mass' WHEN 'g' THEN 'mass' WHEN 'kg' THEN 'mass'
                    WHEN 'ml' THEN 'volume' WHEN 'l' THEN 'volume'
                    WHEN 'un' THEN 'count' WHEN 'dz' THEN 'count' END)
    = (CASE i.unit WHEN 'mg' THEN 'mass' WHEN 'g' THEN 'mass' WHEN 'kg' THEN 'mass'
                   WHEN 'ml' THEN 'volume' WHEN 'l' THEN 'volume'
                   WHEN 'un' THEN 'count' WHEN 'dz' THEN 'count' END)
GROUP BY pi.unit, i.unit
ORDER BY total DESC;
