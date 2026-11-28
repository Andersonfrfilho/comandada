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
