# Fase 6 — Design Doc: Estoque por Lote, Ingredientes e Ficha Técnica

## Modelo de Dados

### ingredients (insumos)
```sql
CREATE TABLE "ingredients" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "establishment_id" uuid NOT NULL REFERENCES "establishments"("id") ON DELETE CASCADE,
  "name" varchar(255) NOT NULL,
  "unit" varchar(20) NOT NULL DEFAULT 'un',   -- un, kg, g, l, ml
  "cost_per_unit" numeric(10,4) NOT NULL DEFAULT 0,
  "stock_quantity" numeric(10,4) NOT NULL DEFAULT 0,  -- quantidade em estoque
  "minimum_stock" numeric(10,4) DEFAULT 0,             -- alerta quando abaixo
  "section_id" uuid REFERENCES "sections"("id") ON DELETE SET NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
```
- `cost_per_unit`: preço unitário do insumo (ex: R$ 4.50/kg de farinha)
- `stock_quantity`: soma dos lotes ativos (mantida por trigger/repo)
- `minimum_stock`: gatilho de alerta de estoque baixo

### product_ingredients (ficha técnica)
```sql
CREATE TABLE "product_ingredients" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "product_id" uuid NOT NULL REFERENCES "products"("id") ON DELETE CASCADE,
  "ingredient_id" uuid NOT NULL REFERENCES "ingredients"("id") ON DELETE RESTRICT,
  "quantity" numeric(10,4) NOT NULL,  -- qtde de insumo por 1 unidade do prato
  "unit" varchar(20) NOT NULL DEFAULT 'un',
  "notes" text,                        -- ex: "bater até pico de neve"
  UNIQUE("product_id", "ingredient_id")
);
```
- `quantity`: 0.200 (kg de farinha por 1 pizza), 2 (ovos por 1 omelete)

### stock_batches (lotes de compra)
```sql
CREATE TABLE "stock_batches" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "ingredient_id" uuid NOT NULL REFERENCES "ingredients"("id") ON DELETE CASCADE,
  "quantity" numeric(10,4) NOT NULL,
  "remaining_quantity" numeric(10,4) NOT NULL,  -- baixado via FIFO
  "unit_cost" numeric(10,4) NOT NULL,           -- preço pago neste lote
  "expires_at" date,
  "purchased_at" timestamptz DEFAULT now(),
  "notes" text,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
```
- FIFO: baixa sempre do lote mais antigo com `remaining_quantity > 0`
- `expires_at`: NULL = não perecível

### stock_movements (histórico de entradas/saídas)
```sql
CREATE TABLE "stock_movements" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "ingredient_id" uuid NOT NULL REFERENCES "ingredients"("id") ON DELETE CASCADE,
  "batch_id" uuid REFERENCES "stock_batches"("id"),
  "type" varchar(20) NOT NULL,        -- 'purchase', 'consumption', 'loss', 'adjustment'
  "quantity" numeric(10,4) NOT NULL,  -- positivo = entrada, negativo = saída
  "order_id" uuid REFERENCES "orders"("id"),  -- se vinculado a um pedido
  "user_id" uuid NOT NULL REFERENCES "users"("id"),
  "notes" text,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
```

### products
Novos campos adicionados nesta fase:
- `cost_price` (T6.1) — custo do prato calculado (pode ser sobrescrito)
- `unit` (T6.2) — un, kg, g, l, ml
- `barcode` (T6.3)
- `section_id` (T6.7)
- `preparation_time_minutes` (T6.10) — tempo de preparo cadastrado
- `preparation_instructions` (T6.10) — modo de preparo

## Fluxo de Operação

### 1. Entrada de compra
- Operador registra compra de insumo: ingredient_id + quantity + unit_cost + expires_at
- Sistema cria `stock_batch` com `remaining_quantity = quantity`
- Sistema cria `stock_movement` tipo 'purchase'
- Sistema atualiza `ingredients.stock_quantity` (soma de todos os `remaining_quantity`)

### 2. Baixa por venda (FIFO)
- Pedido é concluído → para cada item do pedido, explode a ficha técnica (`product_ingredients`)
- Para cada ingrediente na ficha: `qtde_necessaria = product_ingredients.quantity * order_item.quantity`
- Baixa dos lotes por FIFO (ordena por `purchased_at ASC`, `remaining_quantity > 0`)
- Cria `stock_movement` tipo 'consumption' vinculado ao pedido
- Se estoque insuficiente: lança alerta (não bloqueia — estoque pode estar desatualizado)

### 3. Alerta de validade (T6.6)
- Job BullMQ diário: verifica lotes com `expires_at <= today + config_days`
- Notifica no dashboard com badge "Vencendo em X dias"

### 4. Custeio por receita (T6.11)
- `custo_teorico = Σ(product_ingredients.quantity * ingredient.cost_per_unit)`
- Exibido na UI: "Custo teórico: R$ X · Margem real: Y%"
- Ao alterar `ingredient.cost_per_unit`, o custo teórico é recalculado (cache invalidation)

## Decisões de Design

| Decisão | Alternativa | Razão |
|---|---|---|
| Baixa FIFO via repository (não trigger SQL) | Trigger no banco | Maior controle de erro, logging, notificação |
| `ingredients.stock_quantity` mantido via repo | View materializada | Simplicidade; pequeno volume de dados |
| Product cost_price é `numeric(10,2)` | `numeric(10,4)` | Preços de pratos não precisam de 4 casas |
| Baixa de estoque no status `completed` | Em `ready` ou `delivered` | Consistente com o fluxo: só baixa quando venda é final |
| Sem trigger de bloqueio por falta de estoque | Bloquear pedido | Restaurante opera com estoque aproximado; alerta é suficiente |

## Migrations
Todas as migrations desta fase são atômicas e numeradas sequencialmente:
- 0015: cost_price
- 0016: unit + barcode
- 0017: sections
- 0018: preparation_time + instructions
- 0019: ingredients
- 0020: product_ingredients
- 0021: stock_batches
- 0022: stock_movements
