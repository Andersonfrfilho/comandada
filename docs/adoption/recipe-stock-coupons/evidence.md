# Evidência: fase 2 (cópia de dados para os módulos de ficha técnica e estoque)

- Data: 2026-11-27
- Banco: PostgreSQL 16 local descartável (container `pgvector/pgvector:pg16`, removido ao fim). Nenhum dado de staging ou produção.
- Dados: seed de desenvolvimento do repositório (fictício) mais uma fixture fictícia (3 insumos, 3 produtos, 1 combo, lote, 2 pedidos, ajuste, perda, devolução e movimento de quantidade zero).
- Migration: `apps/api/drizzle/migrations/0061_recipe_stock_sdk.sql` (journal idx 60). Só `INSERT ... ON CONFLICT DO NOTHING`; nenhuma tabela antiga é alterada.

## Ordem no boot

`runRecipeStockMigrations` (schemas `recipes` e `stock`) agora roda **antes** do `migrate` do Drizzle (`connection.ts`). Sem isso a 0061
falharia em banco novo e em banco existente. A migration aborta com mensagem clara se os schemas não existirem ou se houver dado bloqueante
(unidade fora do módulo, custo negativo, linha com quantidade <= 0, insumo de outra empresa, lote inválido).

- Banco vazio (boot completo, 61 migrations): passou, cópia sem efeito.
- Banco com dados: apagada a linha 0061 do journal do Drizzle e refeito o boot: aplicou pelo caminho do Drizzle (125 baixas, 153 movimentos).

## Antes (§3.1)

| Conferência | Resultado |
|---|---|
| insumos | 7 |
| linhas de ficha | 8 |
| produtos com ficha | 4 |
| produtos com preparo | 6 |
| lotes | 9 |
| movimentos (total / quantidade <> 0) | 154 / 153 |
| tipos de movimento | in 9, out 141, return 1, adjustment 2, loss 1 |
| bloqueantes (unidade/custo, linha <= 0, outra empresa, lote inválido) | 0, 0, 0, 0 |
| unidade da linha diferente da do insumo | g/kg 1, ml/l 1, un/kg 1 |
| schemas novos (recipes, stock) | todos vazios |

## Depois (§3.3)

| Tabela nova | Linhas |
|---|---|
| recipes.ingredients | 7 |
| recipes.recipes | 7 |
| recipes.recipe_lines | 8 |
| stock.levels | 7 |
| stock.batches | 9 |
| stock.movements | 153 (o de quantidade 0 foi ignorado) |
| stock.deductions | 125 (um por item de pedido com baixa valendo) |

- `ingredients_ok`, `lines_ok`, `batches_ok`, `movements_ok`, `levels_ok`: todos verdadeiros.
- Saldo e mínimo diferentes entre `ingredients` e `stock.levels`: 0.
- Sinais: `out` só negativo (141), `in` positivo (10 = 9 + 1 devolução), `loss` negativo, nenhum sinal errado.
- Unidade da linha: `g` em insumo `kg` fica `g`; `ml` em `l` fica `ml`; `un` em insumo `kg` (dimensão diferente) vira `kg`; linha na mesma unidade não muda.
- Baixas: pedido com `out` valendo recebe uma `deduction` por item (125 = 125 esperadas); pedido com devolução posterior ao `out` não recebe.

## Idempotência

Segunda execução do mesmo arquivo: todos os 7 `INSERT` voltaram `0` linhas; contagens iguais.

## Testes

- `bun run typecheck`: limpo.
- `bun test` sem banco: 301 passam, 0 falham (integrações puladas).
- `TEST_DATABASE_URL=… bun test integration`: 51 passam, 0 falham, incluindo o novo `recipeStockSdkCopy.integration.test.ts` (7 arquivos).

## Decisões em aberto com o dono

1. Linha com mesma dimensão e unidade diferente (ex.: 300 g num insumo em kg): a migration mantém a unidade da linha e o módulo converte (o custo da ficha passa a refletir a conversão). A alternativa, migrar tudo na unidade do insumo, é trocar o `CASE` por `i.unit`.
2. Combos (`product_components`): a baixa marca as `deductions` por item do pedido (`order:<pedido>:<item>`); a chave por componente depende de como a fase 4 monta o `lineKey`.

---

# Evidência: fase 3 (API passa a usar os módulos de ficha técnica e estoque)

- Data: 2026-11-28
- Banco: PostgreSQL 16 local descartável (`pgvector/pgvector:pg16`, container `comandada-rsc-test-pg3`, removido ao fim). Nenhum dado de staging ou produção.

## O que foi trocado

| Antes | Agora |
|---|---|
| `DeductStockForOrderUseCase` | `DeductOrderStockUseCase`: um `lineKey` por item do pedido (`order_items.id`) sobre `stockModule.useCases.deductOrder`. A chave gravada é exatamente `order:<pedido>:<item>`, igual às marcas migradas. |
| Combo (`product_components`) | A fonte de fichas do módulo de estoque (`infra/recipes/kitRecipeSource.ts`) devolve, para o combo, uma ficha de rendimento 1 com os insumos dos componentes somados (`kitRecipes.ts`). Um combo é uma linha e uma chave. |
| `RestoreStockForOrderUseCase` | O módulo de estoque **não tem devolução**. `RestoreOrderStockUseCase` usa as portas de persistência exportadas (`createDrizzleStockPersistence`): devolve ao mesmo lote e ao saldo o que a baixa tirou, grava entrada com chave `order-return:<pedido>`, e apaga as marcas `order:<pedido>:*` de `stock.deductions` (produzir de novo baixa de novo, como antes). Entende também a baixa/devolução migrada (`order:<pedido>:legacy`). |
| `StockExpiryAlerter` | `scanExpiringBatches({ withinDays })` do módulo, na maior janela configurada; o gancho `onBatchesExpiring` grava o aviso (auditoria) só dentro da janela de cada restaurante (`settings.stock.expiry_alert_days`). A consulta antiga lia a configuração de um restaurante qualquer; agora lê a de cada um. |
| Espelho do preparo | `hooks.onRecipeSaved/onRecipeRemoved` atualizam `products.preparation_time_minutes` e `preparation_instructions`; `reconcilePreparationMirror` no boot (depois do `migrate`) só atualiza linhas diferentes. `CatalogController` não aceita mais os dois campos. |
| `GetIngredientsRankingUseCase` | Lê `stock.movements` ⋈ `recipes.ingredients`. Mantém o líquido (saída menos devolução) da consulta antiga. |
| Custo do estoque do mês (`ExpenseController`) | Lê `stock.movements` ⋈ `stock.batches`. |
| Rotas `/ingredients*`, `/stock-batches*`, `/stock-movements*` | Mesmo caminho, mesmo formato de resposta, agora adaptadores dos módulos (o painel segue funcionando até a fase 4). |

## Tabelas antigas ainda lidas por código vivo

Nenhuma, exceto a lista de sincronização da loja (`modules/sync/shared/syncTables.constant.ts`), que fica como está até a decisão do §5.5. As demais referências estão nas definições de schema e em testes de migração.

## Testes

- `bun run typecheck` (api e web): limpo.
- `bun test` sem banco (api): 307 passam, 82 pulados, 0 falham. Web: 126 passam.
- `TEST_DATABASE_URL=… bun test` (api, todos os arquivos): 371 passam, 0 falham. Novos: `OrderStockSdk.integration.test.ts` (combo, repetição, simultâneo, devolução, paridade do ranking), `LegacyStockRoutes.integration.test.ts` (rotas antigas, espelho, validade), `kitRecipes.test.ts`, `stockExpiry.test.ts`, `DeductOrderStockUseCase.test.ts`. `OrderMoney.integration.test.ts` passou a montar os módulos.

## Diferenças de comportamento (decisão do dono)

1. **Baixa nunca trava o pedido.** Antes, `in_production` recusava a transição se faltasse saldo e o produto não aceitasse negativo (`allow_negative_stock`). O módulo deixa o saldo ficar negativo e mostra o furo.
2. **Estoque desligado = sem baixa.** Empresa sem lote nem movimento e sem `stock.enabled` não baixa nada (antes baixava e podia travar). A primeira escrita pelas rotas antigas liga o estoque (salvo `stock.enabled = false`).
3. **Estoque baixo** continua `quantidade <= mínimo` nas rotas antigas (o módulo marca só `<`).
4. **Perda no custo do estoque** (`ExpenseController`): antes a perda, gravada com sinal negativo, *diminuía* o custo do mês; agora soma, como diz o comentário original.
5. Entrada de lote: o custo médio do insumo continua sendo atualizado (no adaptador); saldo negativo conta como zero na média.
6. Motivo é obrigatório em ajuste e perda (já era no formulário).
