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

---

# Evidência: fase 4 (painel usa `recipes-ui` e `stock-ui`)

- Data: 2026-11-28
- Ambiente: PostgreSQL 16 e Redis descartáveis (`comandada-rsc-test-pg4`, `comandada-rsc-test-redis4`, removidos ao fim), API local na 3391 com o seed de desenvolvimento, painel no Vite na 4391, Chromium (Playwright) a 1366 e 375 px, `deviceScaleFactor` 2. Nada de staging ou produção.

## O que foi trocado

| Antes | Agora |
|---|---|
| `IngredientManager` (barra de 224 px do cardápio, rotas `/ingredients`) | Página `/stock` ("Insumos e estoque", menu Gestão): abas Insumos (`IngredientsWorkspace`, com `IngredientStockButton` na linha quando há estoque), Saldos (`StockLevelsWorkspace`) e Inventário (`InventoryWorkspace`). A barra do cardápio ganhou só um link para ela. |
| `RecipeManager` | `RecipeEditor` (`ProductRecipeEditor`) no modal de edição do produto e na página do produto, com `salePriceCents` do preço atual. Os campos de tempo e modo de preparo saíram do formulário do produto (a ficha é a dona; a API espelha em `products`). |
| `RecipeCostBadge` (duas consultas por produto) | `useRecipeCosts`: um `POST /sdk/recipes/recipe-costs` por 500 produtos, chave estável (todos os produtos da empresa, não muda com o filtro). Ficha sem linhas aparece como "Sem ficha técnica". |
| `StockBatchList`, `StockAdjustmentForm`, `StockMovementHistory` | `IngredientStockPanel` (dentro do botão de estoque do insumo). |
| `ExpiringBatchBadge` (`/stock-batches/expiring/count`) | `StockAlertBadges`: "abaixo do mínimo" (`listLevels({ belowMinimum: true })`, total) e "lotes vencendo" (`GET /sdk/stock/batches?expiringWithinDays=7`, total). |
| `StockCard` da página do produto (`/ingredients`, soma de saldo sem conversão) | `ProductStockCard`: ficha e saldos pelo SDK; a quantidade por porção vem convertida para a unidade do insumo (`cost.lines[].quantityInIngredientUnit / yieldPortions`). O aviso de unidade diferente saiu (o módulo converte). |
| (não existia) | Página `/shopping-list` ("Lista de compras", menu Gestão) com `ShoppingListWorkspace`. |

Apagados: `IngredientManager.tsx`, `RecipeManager.tsx`, `StockAdjustmentForm.tsx`, `StockBatchList.tsx`, `StockMovementHistory.tsx`, `hasUnitMismatch` (e seu teste). O painel não chama mais `/ingredients*`, `/stock-batches*` nem `/stock-movements*` (`grep` em `apps/web/src` vazio; o que sobra com "ingredients" é `/reports/ingredients-ranking`).

## Ligação

- `lib/recipesSdkApi.ts` (`RecipesApi`) e `lib/stockSdkApi.ts` (`StockApi`) sobre o `api` do painel, via `lib/sdkHttp.ts` (abre o envelope `{ data }`; lista vem em `{ data: { data, pagination } }`). 404 de `GET /recipes/:productId` vira `null`. Exportações usam `api.getBlob`/`api.postBlob` (novos, passam pela renovação de token).
- `lib/api.ts` entende `{ error: { code, message } }` dos módulos (antes o código se perdia e a mensagem virava a genérica) e guarda o corpo em `ApiError.body`, que é onde `readErrorCode` do SDK procura.
- `RecipesStockProviders` envolve o `Outlet` do layout: `renderSelect` com o `Select` do painel (rótulo em cima), pt-BR, `styles.css` dos dois pacotes. Tokens `--arc-*` no `:root` (`index.css`), `--arc-accent` ligado a `--brand-600`, então a marca do restaurante vale.
- Dependências diretas novas em `apps/web`: `@adatechnology/recipe-contracts` e `stock-contracts` 0.1.0 (já estavam no lock).
- API: `GET /agenda` passou a devolver `items: [{ productId, quantity }]` em cada encomenda (a lista de compras precisa dos produtos, não do texto `itemsSummary`).

## Estoque ligado ou não

Nenhuma rota diz isso. `useStockEnabled` faz uma listagem de uma linha em `/sdk/stock/levels`: 200 = ligado; 404 `STOCK_DISABLED` = desligado; outro erro não conta como desligado. Desligado: a página mostra só a aba Insumos, sem botão de estoque, sem badges, sem card de estoque no produto. O `StockProvider` fica sempre montado (só contexto), para a página não remontar quando a sonda responde.

## Lista de compras

Origens: encomendas da agenda (`GET /agenda?date=`) de hoje, de amanhã e dos próximos 7 dias, somando por produto e ignorando as canceladas. Reservas de mesa não têm itens (só mesa e pessoas), então não entram. Produto sem ficha aparece no aviso do próprio componente.

## Verificação visual (dev seed; duas encomendas agendadas e quantidades alteradas por SQL só para exercitar a compra)

| Tela | 1366 | 375 |
|---|---|---|
| Insumos (4 resultados, botão de estoque na linha) | `scrollWidth - innerWidth` = 0 | 0 (cartões) |
| Estoque do insumo (saldo, mínimo, entrada, lotes, movimentos) | 0 | 0 |
| Novo insumo, seletor de unidade (menu do painel, opções visíveis por cima do modal) | 0 | 0 |
| Saldos | 0 | 0 |
| Produto: ficha técnica, custo e "rende 112 porções" | 0 | 0 (tabela do card rola dentro do cartão, como já era) |
| Cardápio (custos em lote) e modal de edição com `RecipeEditor` | 0 | 0 |
| Lista de compras (origem "próximos 7 dias", 180 marmitas, gerar, exportar) | 0 | 0 |

- `<select>` nativos: 0 em todas as telas novas. No modal de edição do produto há 3 (`product-unit`, `product-catalog`, `product-section`) e um `input[type=number]`, todos do `ProductForm` do `products-ui` (fora do escopo; vai para o SDK). Há também o `input[type=file]` oculto do `ProductPhotoManager`, que já existia.
- Console e respostas >= 400 do painel contra a API: nenhum erro nos dois tamanhos.
- Prints (2x): `docs/adoption/recipe-stock-coupons/screens/` (`insumos`, `estoque-do-insumo`, `novo-insumo-select`, `saldos`, `produto-ficha`, `catalogo-editar-produto`, `lista-de-compras`, cada um `-1366.png` e `-375.png`).

## Testes

- `apps/web`: `bun run typecheck` limpo; `bun test src` 129 passam (126 antes, menos 1 do `hasUnitMismatch` removido, mais 4 novos em `sdkHttp.test.ts`); `bun run build` ok.
- `apps/api`: `bun run typecheck` limpo.

## Lacunas

1. Empresa com estoque desligado não tem como ligá-lo: antes a primeira escrita pelas rotas antigas ligava (`ensureStockEnabledForCompany`), e o painel não as usa mais. Falta uma rota ou configuração para ligar (decisão do dono).
2. O aviso de validade do painel usa 7 dias fixos; a janela por restaurante (`settings.stock.expiry_alert_days`) não é lida pelo painel.
3. Combos (`product_components`) não têm ficha própria no `recipe-module`: na lista de compras entram como "sem ficha".
