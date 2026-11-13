# Migração do catálogo para `@adatechnology/products-ui`

O pacote já está declarado em `apps/web/package.json` e nunca foi importado.
A tela `/catalog` (864 linhas) faz tudo à mão. Esta spec traz o SDK para dentro
dela **sem perder nada** — o SDK cobre menos que a tela atual, e o que ele não
cobre continua sendo código do Order Hub.

## Tradução de vocabulário (fonte de todo o risco)

| SDK | Order Hub | Observação |
|---|---|---|
| `Catalog` | `Catalog` (`/catalog/catalogs`) | ~~era `Category`~~ — o Order Hub adotou o nome do SDK em código e rotas. A tabela física continua `categories` e a coluna `category_id`, mapeadas no `pgTable`: zero migration. |
| `priceInCents: number` | `price: string` (decimal em reais) | centavo inteiro ↔ string decimal |
| `costPriceInCents` | `costPrice: string \| null` | idem |
| `PaginatedResponse<T>` | array puro | a rota não pagina; envelopar |
| `Section = {id,name,catalogId}` | `Section = {id,name,description}` | **armadilha**: o `Section` do SDK é subdivisão de catálogo; o do Order Hub é setor de produção (cozinha, bar). O `ProductForm` filtra seções por `catalogId`, então cada setor precisa ser expandido em uma entrada por categoria |

## O que o SDK **não** cobre (fica como está — remover seria regressão)

`ncmCode`/`cfopCode`/`cstIcms` na categoria (fiscal), `slug`,
`preparationInstructions`, ingredientes, receitas + `RecipeCostBadge`,
lotes de estoque + `ExpiringBatchBadge`, scanner de código de barras,
sugestões externas (`/catalog/product-search`, `/catalog/product-lookup/:barcode`).

Também não há rota de importação em massa na API, então `BulkImport` fica fora
até `POST /catalog/products/bulk` existir.

## Fase 1 — Adaptador e helpers
> 🤖 Modelo: `sonnet`

- **T1.1** ✅ `apps/web/src/lib/productsApiAdapter.ts`: implementa `ProductsApi`
  sobre as rotas existentes, com a conversão reais↔centavos isolada num único
  lugar. `uploadImage` e `bulkImportProducts` lançam erro explícito (não há rota).
- **T1.2** ✅ `formatBRL` local sai; entra `formatMoney` do SDK, que é o mesmo
  formatador que os componentes usam internamente — duas implementações de
  dinheiro na mesma tela divergem cedo ou tarde.
- **T1.3** ✅ `ProductsProvider` embrulha a `CatalogPage` com `fields` declarando
  só o que o Order Hub tem.

## Fase 2 — Componentes de leitura
> 🤖 Modelo: `sonnet` (executada em `opus` a pedido do usuário)

- **T2.1** ✅ Margem por produto na listagem via `formatMarginPercent`.
- **T2.2** ✅ `formatBarcode` na exibição do código de barras.
- **T2.3** ✅ Atalhos de margem no formulário via `applyMarginToCost`, com os
  percentuais vindo de `marginShortcutPercents` na config do provider.

**Mudança de comportamento visível.** A tela calculava *markup sobre o custo*
(`preço = custo × (1 + m)`); o SDK usa *margem sobre o preço de venda*
(`preço = custo ÷ (1 − m)`), que é a definição usada no varejo. O mesmo produto
que exibia "margem 100%" passa a exibir "50%" — o preço não muda, só a conta.
Os atalhos viraram 30/50/60% porque 100% de margem sobre a venda implicaria
custo zero, e `applyMarginToCost` devolve o custo inalterado nesse caso.

## Fase 3 — Formulário 🧠
> 🤖 Modelo: `opus`

**Decisão tomada: o SDK é que se completa, não o Order Hub que abre mão.**
O que faltava não era específico deste negócio — scanner, sugestão de base
externa e ficha técnica aparecem em qualquer catálogo de varejo ou restaurante.
Manter um formulário paralelo aqui condenaria todo consumidor futuro a repetir
as mesmas 800 linhas.

- **T3.1** ✅ (`adatechnology-packages@89bed8b`) `ProductForm` ganha
  `onScanBarcode` e `onSearchSuggestions` — captura e busca ficam no host, botão
  e dropdown ficam no pacote — mais o campo `PREPARATION_INSTRUCTIONS`.
  `Section.catalogId` vira opcional (seção como posto de produção) e o default
  de `marginShortcutPercents` perde o 100, que era um botão morto.
- **T3.2** ✅ Adaptador e `fields` da página mapeiam `preparationInstructions`.
- **T3.3** ✅ O formulário local da `CatalogPage` saiu (864 → 702 linhas): entra
  `ProductForm`, com `onScanBarcode` ligado no `BarcodeScanner` existente e
  `onSearchSuggestions` em `/catalog/product-search`. Duas correções vieram
  junto, no SDK:
  - `SORT_ORDER` vira campo opcional — sem ele a "Ordem" da tela sumiria.
  - `onScanBarcode` devolve `ProductSuggestion | null`, não `string | null`.
    O host que consulta `/catalog/product-lookup/:barcode` já tem nome e imagem
    em mãos; devolver só o número obrigaria a redigitar o que o scanner
    descobriu.

  `unitOptions` é fixado em `un/kg/g/l/ml` na config do provider porque a API
  valida a unidade com `z.enum` — as opções extras do default do SDK (`pc`,
  `cx`, `dz`) virariam 400 no salvamento.

Continua fora do `ProductForm`, por não ser dele: receitas, lotes e
ingredientes — domínio do Order Hub.

## Fase 5 — Fiscal no SDK (a especificar)
> 🤖 Modelo: `opus` 🧠

Direção dada: o fiscal do SDK é focado em **NFC-e** (mercadoria) e ganha
também uma **área de emissão de NFS-e** (serviço), a implementar.

O que já existe e migra para o SDK: `ncmCode` / `cfopCode` / `cstIcms` moram
hoje só no `categorySchema` do Order Hub (limites 8 / 4 / 3 caracteres) e o
`Catalog` do SDK não os conhece. Entram como campos opcionais atrás de flag de
config, na mesma linha do resto do pacote — vertical que não emite nota não
desenha campo fiscal.

NFC-e e NFS-e são documentos de naturezas diferentes (mercadoria × serviço,
estadual × municipal, com lista de serviço e ISS no lugar de NCM e ICMS), então
não compartilham formulário. Ver `.specs/features/fiscal/` para a estratégia
por estabelecimento já desenhada.

## Fase 4 — Backend faltante
> 🤖 Modelo: `sonnet`

- **T4.1** `POST /catalog/products/bulk` (CSV) → habilita `BulkImport`.
- **T4.2** Upload de imagem depende de storage de objetos, que o `apps/api`
  não tem (mesmo bloqueio dos documentos das conversas). Fora de escopo.
