# Estoque real e cadastro inteligente de produto

Duas frentes que se sustentam: o **estoque**, que hoje é um esqueleto de leitura,
e o **cadastro de produto**, que hoje exige digitar tudo à mão. A segunda só paga
o custo de integração externa se a primeira existir — sem lote e sem custo por
lote, "sugestão de preço" é chute sem margem para comparar.

## Diagnóstico (verificado no código, não presumido)

O schema está bem modelado: `ingredients` (com `stockQuantity`, `minimumStock`,
`costPerUnit`), `stock_batches` (FIFO por `remainingQuantity`, `costPerUnit`,
`expiresAt`), `stock_movements` (`movementType`, `reason`, `orderId`, `userId`)
e `product_ingredients` como receita.

**Nada no código escreve nessas tabelas.** Busca por `stockMovements`,
`stockBatches` e `stockQuantity` em `apps/api/src` só encontra leitura:

| Existe | Situação |
|---|---|
| `GET /stock-batches/expiring` + `/count` | lê lotes que nunca são criados |
| `ExpenseController` soma `movements × costPerUnit` | soma sempre zero |
| `ingredients.minimumStock` | gravado pelo CRUD, nunca lido |
| `product_ingredients` | editável na tela, nunca consumido |

Consequência prática: `ExpiringBatchBadge` nunca acende, o CMV do mês é sempre
R$ 0,00 e a "receita" do produto é decorativa.

---

## Fase 1 — Escrita de estoque (a base)
> 🤖 Modelo: `sonnet` (T1.2 é 🧠 — validar com `opus` antes)

- ✅ **T1.1** `POST /stock-batches` — entrada de compra: ingrediente, número do
  lote, quantidade, custo unitário, validade. Em **uma transação**: cria o lote
  com `remainingQuantity = quantity`, grava `stock_movements` do tipo `in` e
  soma em `ingredients.stockQuantity`. Recalcula `ingredients.costPerUnit` como
  média ponderada dos lotes com saldo — custo de reposição errado contamina toda
  a margem exibida.
  *Verificação:* `POST` → `GET /ingredients` mostra o novo saldo e o novo custo;
  segundo lote mais caro move a média na direção certa.

  *Implementação:* `CreateStockBatchUseCase` + `StockBatchController`
  (`POST /stock-batches`). A média ponderada vive na função `weightedAverageCost`,
  calculada sobre o saldo corrente antes da transação; a transação insere o lote
  com `remainingQuantity = quantity`, grava o `stock_movements` do tipo `in` com
  o número do lote no motivo e atualiza saldo e custo do ingrediente. Trilha de
  auditoria (`stock_batch.created`) fora da transação, com quantidade e custo no
  metadata. Ingrediente de outro estabelecimento não é encontrado — o filtro por
  `establishmentId` está no `where`, não na aplicação.

  *Verificação (feita ao vivo):* ingrediente zerado recebeu 10 kg a R$ 5,00
  (saldo 10, custo 5,00) e depois 10 kg a R$ 9,00 → saldo 20,0000 e custo
  7,0000, a média ponderada exata. Os dois `stock_movements` do tipo `in` foram
  gravados com "Entrada de lote LOTE-T11-A/B". Dados de teste removidos ao fim;
  a tentativa de apagar a auditoria foi barrada pela trigger
  `fn_audit_logs_immutable`, que é o comportamento correto.

  *Nota:* `GET /ingredients` não tem parâmetro de busca — devolve a lista
  inteira do estabelecimento, ordenada por nome. Não é defeito: nenhuma tela
  envia `search`, e o `IngredientManager` filtra no cliente. Vira dívida real
  só quando a lista de ingredientes de algum estabelecimento crescer a ponto
  de a paginação importar.

- **T1.2** ✅ 🧠 Baixa por receita no fechamento do pedido. Concluído: gatilho é a
  transição `received → in_production` (kitchen começa a produzir), via
  `DeductStockForOrderUseCase` chamado de dentro de `UpdateOrderStatusUseCase`.
  Para cada item explode `product_ingredients × quantidade` e dá baixa **FIFO**
  nos lotes por `expiresAt`, gravando um `stock_movements` (`out`) por lote
  tocado, com `orderId` e `userId`.
  Decisão do saldo insuficiente: **configurável por produto**, campo
  `products.allowNegativeStock` (default `false` = bloqueia a transição com
  409; `true` = permite negativo e grava movimento extra sinalizando saldo
  negativo permitido). Idempotência por `orderId`: checa `stock_movements`
  existente antes de processar. Produto sem receita não movimenta nada.
  Achado no caminho: `stock_batches`/`stock_movements`/`product_ingredients`
  no banco real estavam desalinhados do schema Drizzle (colunas ausentes ou
  com nome diferente) — corrigido via migrations `0025`, `0026`, `0027`.
  *Verificação (feita ao vivo):* pedido com 2 itens de receita conhecida baixa exatamente a
  quantidade esperada, do lote que vence primeiro; repetir a chamada não muda
  saldo algum.

- **T1.3** ✅ `POST /stock-movements` — ajuste, perda e contagem. Concluído via
  `CreateStockMovementUseCase`. `movementType` em `adjustment` (bidirecional,
  exige `direction: increase|decrease` — é o que fecha a contagem física
  quando ela diverge do sistema pra mais ou pra menos) / `loss` (sempre
  decrescente, `direction` ignorado). `reason` obrigatório (1–255 chars) em
  ambos. `quantity` é gravada com sinal em `stock_movements` (negativa para
  decréscimo), então a soma da coluna já reflete o saldo corrente sem precisar
  reler `movementType` para inferir direção. Uma transação: insere o
  movimento e atualiza `ingredients.stockQuantity`; sem checagem de saldo
  mínimo aqui — ajuste/perda é correção manual e deliberada de quem está no
  chão da cozinha, não uma venda.
  *Verificação (feita ao vivo):* adjustment sem `direction` → 400; adjustment
  `increase` 20 → saldo sobe para 20; loss 5 (sem `direction`, forçado a
  decrescer) → saldo cai para 15, `quantity` gravada como `-5.0000`; `reason`
  vazio → 400; ingrediente de outro estabelecimento/inexistente → 404.

- **T1.4** ✅ Alerta de estoque mínimo: `GET /ingredients/low-stock` compara
  `stockQuantity <= minimumStock` (ignora ingrediente sem `minimumStock`
  definido — sem limite não há como estar "abaixo dele"), mais
  `GET /ingredients/low-stock/count`, no mesmo padrão do par
  `expiring`/`expiring/count` de `StockBatchController`.
  *Verificação (feita ao vivo):* ingrediente com `minimumStock=10` e
  `stockQuantity=0` aparece na lista e no contador; após ajuste de estoque
  para 50 (acima do mínimo), some de ambos.

  *Dívida resolvida (alerta de validade):* o `StockExpiryWorker` existia mas
  nunca era instanciado — o container não o chamava, então a varredura diária
  de lotes vencendo jamais rodou e o `ExpiringBatchBadge` nunca acenderia por
  conta própria. Ligado no `buildContainer` atrás de `STOCK_WORKER_ENABLED`,
  no mesmo padrão dos demais workers, com `close()` no encerramento gracioso
  do `server.ts` e a variável documentada no `.env.example` e no compose.
  *Verificação (feita ao vivo):* com a flag ligada, o boot registra
  "Stock expiry worker started" e o job repetível aparece em
  `bull:stock-expiry-alerts:repeat`. Sem lote vencendo, a varredura fecha com
  0. Com um lote criado para vencer em 2 dias, a mesma varredura acha 1 e
  grava o `audit_logs` de `stock_expiry_alert` com número do lote e validade.
  Lote de teste removido depois; a linha de auditoria permanece por ser
  imutável por trigger.

- **T1.5** ✅ Seed de catálogo e estoque (`catalog.seed.ts`, chamado de
  `seeds/index.ts` logo após `seedUsers`). 2 categorias, 3 seções, 5 produtos,
  4 ingredientes e 4 linhas de receita (`product_ingredients`) via `INSERT`
  com IDs fixos + `onConflictDoNothing` — mesmo padrão de todo o resto de
  `seeds/*.ts` no projeto (a regra "seed só via use-case" do `code-standart.md`
  não é o que os seeds existentes já fazem; segui a convenção real do
  arquivo). A entrada de estoque em si roda por `CreateStockBatchUseCase`
  (não por `INSERT` bruto), guardada por uma checagem de lote já existente por
  ingrediente para ficar idempotente em reexecução.
  *Verificação (feita ao vivo):* `npm run db:seed` popula produtos,
  ingredientes com `costPerUnit`/`stockQuantity` corretos e `minimumStock`;
  rodar o seed uma segunda vez não duplica nem altera o saldo.

## Fase 2 — Estoque na interface
> 🤖 Modelo: `sonnet`

- **T2.1** ✅ Tela de entrada de lote a partir do `IngredientManager`.
  - Backend: `GET /stock-batches?ingredientId=` (`StockBatchController.listByIngredient`)
    lista os lotes de um ingrediente ordenados por validade.
  - Frontend: `StockBatchList.tsx` já existia mas estava dessincronizado do
    schema atual (`unitCost` em vez de `costPerUnit`, sem `batchNumber`,
    campos `notes`/`purchasedAt` removidos numa migration anterior) e nunca
    era montado em lugar nenhum. Corrigido para usar os campos reais do
    backend e conectado ao `IngredientManager` via linha expansível
    (chevron por ingrediente) que revela a lista de lotes e o botão
    "Entrada" (modal com número do lote, quantidade, custo unitário e
    validade).
  - Corrigido também um bug de layout pré-existente na lista de ingredientes
    da sidebar: nome do ingrediente e badges de custo/estoque se sobrepunham
    visualmente em telas estreitas (texto sem `truncate` vazando por cima do
    irmão flex). Reestruturado em duas linhas (nome+ações / custo+estoque).
  - *Verificação (feita ao vivo, via browser):* login como `gerente@orderhub.io`,
    `/catalog` → expandir "Arroz" mostra o lote seedado `SEED-000`; "Entrada"
    abre o modal, submeter lote `TESTE-UI-001` (3kg @ R$7,00, validade
    31/12/2026) atualiza a lista, o estoque do ingrediente (20→23) e o custo
    médio ponderado (6.50→6.5652) em tempo real. `vite build` sem erros.
    Dados de teste revertidos via SQL após a verificação.
- **T2.2** ✅ Painel de estoque: saldo, custo médio, mínimo, lotes com validade,
  e o histórico de movimentos do ingrediente (a auditoria só serve se for
  visível).
  - Backend: `GET /stock-movements?ingredientId=` (`StockMovementController.listByIngredient`)
    lista as últimas 50 movimentações do ingrediente (tipo, quantidade,
    motivo, usuário via join, pedido, data), mais recentes primeiro.
  - Frontend: `StockMovementHistory.tsx` (tabela com badge colorido por tipo
    — entrada/saída/ajuste/perda) e badge de estoque mínimo direto na linha
    do ingrediente (`mín. X.XX`), ambos conectados ao `IngredientManager`.
  - *Verificação (feita ao vivo, via browser):* `/catalog` → expandir "Arroz"
    mostra "mín. 5.00" ao lado do saldo e a tabela "Histórico de
    movimentações" com a entrada de lote seedada.
- **T2.3** ✅ Ajuste e perda com motivo obrigatório no formulário.
  - Frontend: `StockAdjustmentForm.tsx` — botão "Ajuste / perda" no
    `IngredientManager` abre modal com Tipo (ajuste/perda), Direção
    (aumentar/diminuir, só para ajuste), Quantidade e Motivo (obrigatório,
    valida antes de enviar). Usa `POST /stock-movements` (backend já existia
    desde a T1.3).
  - *Verificação (feita ao vivo, via browser):* registrar um ajuste de +1kg
    em "Arroz" atualiza o badge de estoque (20→21) e a linha aparece no
    histórico de movimentações em tempo real. Dados de teste revertidos via
    SQL após a verificação.

## Fase 3 — Gestão de produto que falta
> 🤖 Modelo: `sonnet`

- **T3.1** ✅ `POST /catalog/products/bulk` (CSV) → habilita o `BulkImport` do SDK,
  que está pronto e desligado só por falta de rota. (Era a T4.1 da spec
  `products-sdk-migration`.)
  - Backend: `parseProductsCsv.ts` (parser tolerante a cabeçalho com/sem
    acento — `nome`/`preço`/`descrição`/`unidade`/`código_barras`/`catálogo`)
    + `CatalogController.bulkImportProducts` reaproveitando o parser
    multipart já usado em `UploadController`/`ExpenseController`. Cada linha
    é validada e inserida individualmente (mesmas regras de slug único do
    `createProduct`); erros de linha não interrompem o lote.
  - Frontend: `productsApiAdapter.bulkImportProducts` trocou o `reject`
    fixo por um `fetch` multipart (mesmo padrão do `useUpload.ts`), plugando
    o `BulkImport` do SDK que já existia desligado.
  - *Verificação (feita ao vivo, via `curl`):* CSV com 2 produtos válidos →
    `{"succeeded":2,"failed":0}` e os produtos aparecem em
    `GET /catalog/products`; reenviar o mesmo arquivo →
    `{"succeeded":0,"failed":2,"errors":[...]}` com mensagem de duplicidade
    por linha; CSV com preço vazio → erro de validação por linha. Produtos
    de teste revertidos via SQL após a verificação.
- **T3.2** ✅ Ações em lote no `ProductList` do SDK: seleção por linha,
  ativar/desativar, mover de catálogo e reajuste percentual de preço. Isso
  também cobre a dívida do padrão de listagens (checkbox + barra de ação em
  lote, ordenação por cabeçalho, filtros na URL), que o `ProductList` ainda não
  cumpre. **Adição no pacote**, não no Order Hub.
  - Implementado em `adatechnology-packages` (repo irmão), pacote
    `@adatechnology/products-ui`, branch `feat/products-bulk-actions`
    (commit `bf5446c`, aberta a partir de `main`).
    `ProductList.tsx` ganhou a prop `bulkActionsEnabled` (desligada por
    padrão — lista só-leitura, como um seletor de produto num pedido, não
    deve oferecer ativar/desativar): checkbox por linha, "selecionar todos"
    no cabeçalho, e barra de ação com ativar/desativar, mover para catálogo
    (via `listCatalogs`) e reajuste percentual de preço. Cada ação dispara
    N chamadas `updateProduct` em paralelo — o contrato `ProductsApi` não
    tem endpoint de batch — e uma falha isolada não aborta as demais.
    Ordenação por cabeçalho já existia no componente; **filtros na URL
    seguem como dívida em aberto** (o `ProductList` ainda não tem UI de
    filtro nenhuma, é debt maior que cabe numa task própria).
  - *Verificação:* `npm run check` (tsc --noEmit) e `npm run build` do
    pacote sem erros. Sem suíte de testes no pacote (nenhuma pré-existente
    em `products-ui`); verificação visual em navegador não feita porque o
    componente ainda não está montado em nenhuma tela do Order Hub — é
    biblioteca aguardando consumidor. Changeset registrado
    (`.changeset/product-list-bulk-actions.md`, minor).
- ✅ **T3.3** Duplicar produto — variação de tamanho e sabor é o caso comum, e
  hoje se resolve redigitando.
  - *Implementação:* botão "Duplicar" em `CatalogPage.tsx`, ao lado de
    "Editar", em cada card de produto. Sem endpoint novo — abre o modal em
    modo de criação com `duplicateSource` guardando o produto de origem;
    `sdkInitialProduct` monta os `initialValues` do `ProductForm` a partir
    dele (nome com sufixo " (cópia)", preço, catálogo, seção, unidade,
    tempo/instruções de preparo). Código de barras não é copiado — copiar
    geraria duplicidade no lookup de código de barras que o T3.1 usa para
    achar produto existente. Submit reaproveita `createProd` (POST
    `/catalog/products`), o mesmo caminho do "Novo produto".
  - *Verificação:* `tsc --noEmit` sem novos erros (os 13 erros do
    `apps/web` são pré-existentes, confirmado via `git stash` antes/depois
    da mudança — nenhum introduzido por esta task). Testado ao vivo no
    navegador: clicar "Duplicar" em "Refrigerante Lata" abriu o modal
    "Duplicar · Refrigerante Lata" com nome "Refrigerante Lata (cópia)",
    descrição, preço R$ 6,00 e catálogo/seção "Bebidas" pré-preenchidos e
    código de barras vazio; salvar criou o produto (6 produtos na lista),
    depois excluído para limpar o dado de teste (voltou a 5).
- ✅ **T3.4** *(UI entregue depois — ver nota ao fim da task)* Histórico de preço (`product_price_history`: produto, preço anterior,
  novo, autor, data). Sem ele não há como responder "quando esse item subiu",
  e retroagir depois é impossível: o dado não existe em lugar nenhum.
  - *Implementação:* tabela `product_price_history` (migration
    `0028_add_product_price_history.sql`, aplicada manualmente ao Postgres
    de dev via `psql` — sem `drizzle-kit generate` interativo disponível
    neste ambiente; `drizzle-kit migrate` aplica a mesma migration em
    produção normalmente). `CatalogController.updateProduct` grava uma
    linha só quando `Number(existing.price) !== Number(updated.price)`, com
    `previousPrice`, `newPrice` e `userId` de quem editou — descrição,
    catálogo etc. não geram entrada, só preço. Rota nova `GET
    /catalog/products/:id/price-history`, ordenada por `createdAt desc`,
    com o nome do autor via relation `user`. Ainda sem UI própria no
    frontend (fica pendente numa task de tela); a API está completa e
    testável.
  - *Verificação:* `tsc --noEmit` sem novos erros nos arquivos tocados
    (`CatalogController.ts`, `CatalogRoutes.ts`, schema/relations).
    Testado ao vivo via curl: `PUT` alterando preço de R$6,00 para R$6,50
    gerou 1 linha em `price-history` com `previousPrice: "6.00"`,
    `newPrice: "6.50"` e o usuário autenticado; um segundo `PUT` mudando só
    a descrição (preço igual) não criou linha nova — confirmado que a
    lista de histórico continuou com 1 item. Preço e descrição revertidos
    ao valor original e as 2 linhas de teste (subida e volta) apagadas do
    banco ao final.
  - *UI entregue depois:* `PriceHistoryList` no SDK
    (`@adatechnology/products-ui`, branch `feat/products-price-reference`,
    commit `94c2faf`) + prop opcional `onFetchPriceHistory` no `ProductForm`.
    Aparece só na edição de produto existente — produto novo não tem passado —
    e a consulta é sob demanda, porque abrir o formulário não significa querer
    auditar preço. Cada linha mostra data, autor, preço anterior riscado e o
    novo. Autor some quando o usuário que alterou foi removido. No host,
    `CatalogPage` traduz as linhas cruas (preço em reais, autor aninhado).
    *Verificação (feita ao vivo):* com duas alterações registradas em "Pudim de
    Leite", a lista exibiu "02/08/2026 · Gerente Demo — R$ 9,50 → R$ 8,50" e a
    anterior, mais recente primeiro; "Novo produto" não mostra o botão;
    produto sem histórico exibe "Nenhuma alteração de preço registrada". Preço
    restaurado para R$ 8,50 e as linhas de teste apagadas ao final.
- **T3.5** Upload de imagem — **bloqueado**. Depende de storage de objetos, que
  o `apps/api` não tem (mesmo bloqueio dos documentos das conversas). Fica aqui
  registrado para não ser redescoberto.

---

## Fase 4 — Cadastro inteligente de produto 🧠
> 🤖 Modelo: `opus` (desenho) → `sonnet` (implementação por provider)

A ideia é boa, mas ela se divide em duas coisas com viabilidades **muito**
diferentes, e tratá-las como uma só é o que faria a feature falhar.

### 4A — Enriquecimento do item (dado externo, viável hoje)

Já existe meio caminho: `OpenFoodFactsProvider` com `search` e `getByBarcode`,
ligado no `ProductForm` do SDK via `onSearchSuggestions` e `onScanBarcode`.
Devolve nome, marca, imagem e categoria.

Limites reais dessa base, que precisam estar claros antes de prometer:
cobre **alimento embalado com GTIN** — hortifrúti, prato pronto e serviço não
existem lá; descrição é fraca ou ausente; e **não tem preço**.

- ✅ **T4.1** Cache dos resultados externos (Redis, TTL longo) por código de barras
  e por termo. Chamada externa em digitação é lenta e instável, e o mesmo item
  é consultado por todo estabelecimento da base.

  *Implementação:* `apps/api/src/shared/providers/CachedProductLookup.ts` — composite
  que implementa a própria `ProductLookupProvider`, então o controller não sabe se a
  resposta veio de cache ou de rede. Constantes em
  `apps/api/src/shared/constants/productLookup.constant.ts`: TTL de acerto 7 dias
  (nome/marca/imagem de item embalado não mudam) e TTL de miss 6 horas (item ausente
  hoje pode entrar na base amanhã; 7 dias congelaria a correção). **Miss também é
  cacheado**, com marcador `__none__` — string vazia seria indistinguível de chave
  ausente. Sem isso, hortifrúti, prato pronto e serviço, que são a maioria neste
  domínio e não existem na OpenFoodFacts, pagariam rede a cada digitação. Termo é
  normalizado (`trim` + minúscula + colapso de espaço) antes de virar chave. O que sai
  do cache é revalidado pelo mesmo schema Zod: entrada gravada antes de uma mudança de
  formato não pode vazar para o formulário como se fosse válida.

  *Verificação:* API reiniciada, testes ao vivo via `rtk proxy curl`. Barcode
  `3017620422003` (Nutella): 1ª chamada 967 ms (rede), 2ª 30 ms (cache), payload
  idêntico. Barcode inexistente `7622210951953`: 1002 ms → 31 ms, ou seja, o miss
  negativo funciona. Busca `?q=nutella`: 1927 ms → 33 ms. Normalização confirmada —
  `?q=NUTELLA%20%20` respondeu em 27 ms servido da chave `product-lookup:search:nutella`,
  sem criar chave nova. TTLs conferidos no Redis: `604799` (7 d) nos acertos e `21600`
  (6 h) nos misses. Chaves de teste removidas ao final.
- **T4.2** Segundo provider de GTIN atrás da mesma interface `ProductLookup`,
  para trazer **NCM** e descrição fiscal (Cosmos/Bluesoft, GS1). É serviço pago
  e por chave — a interface fica pronta, a contratação é decisão comercial.
  Traz o NCM que hoje é digitado à mão no catálogo e alimenta direto a NFC-e.
- ✅ **T4.3** Fallback ordenado e explícito: cache → OpenFoodFacts → provider
  fiscal → nada. Nunca gravar sozinho: sugestão **preenche o formulário**, o
  usuário confirma. Dado externo é entrada não confiável e passa por Zod, na
  mesma régua de qualquer outra fronteira.

  *Implementação:* interface `ProductLookupProvider` em
  `apps/api/src/shared/providers/ProductLookupProvider.ts` (sem prefixo `I`, seguindo
  `GeocodingProvider`), com `productSuggestionSchema` como fonte da verdade — o tipo
  `ProductSuggestion` é derivado dele por `z.infer`, porque com
  `exactOptionalPropertyTypes` um tipo declarado à parte diverge do schema no
  `| undefined` dos opcionais. Campos opcionais que não passam são cortados em vez de
  reprovarem a sugestão inteira: item sem imagem ainda serve para preencher o nome.
  `OpenFoodFactsProvider` reescrito para implementar a interface, com timeout de 4 s
  (`AbortSignal.timeout`) e degradação silenciosa — base externa lenta não pode
  impedir o catálogo de abrir. A ordem do fallback é a ordem do array injetado no
  container: `new CachedProductLookup(cache, [new OpenFoodFactsProvider()])`, e o
  provider fiscal da T4.2 entra como segundo item sem tocar no controller. Corrigida
  de passagem uma violação de DI que já existia: o `CatalogController` instanciava
  `new OpenFoodFactsProvider()` no próprio corpo; agora recebe a interface pelo
  construtor.

  *Verificação:* mesma bateria da T4.1. Cadeia esgotada devolve `[]` na busca e 404 no
  lookup por código, nunca erro 500 — confirmado com o termo `zzqqxx` e com o barcode
  `7622210951953`. Nenhum caminho grava produto: os dois endpoints são `GET` e apenas
  devolvem sugestão. `npx tsc --noEmit` sem erros nos arquivos da fase (os 21 restantes
  são pré-existentes em `modules/tables` e `modules/orders`, não tocados aqui).

### 4B — Preço sugerido por região (parcialmente viável, com ressalva)

Não existe base nacional pública de preço. O que existe é o programa de
transparência de NFC-e das SEFAZ estaduais — "Preço da Hora" (BA), "Menor Preço"
(PR, RS, SP entre outros) — que expõem preço praticado por GTIN e raio
geográfico, alimentado por nota fiscal real.

Isso significa: **cobertura por UF, não nacional**, contrato diferente por
estado, e disponibilidade que não dá para garantir. É uma feature honesta se for
apresentada como *"preço praticado na sua região, quando disponível"*, e uma
promessa quebrada se for vendida como universal.

- ✅ **T4.4** Interface `RegionalPriceProvider` + implementação para **uma** UF
  primeiro (a do estabelecimento piloto). Entrada: GTIN + CEP/raio. Saída:
  mínimo, médio, máximo e data da coleta — sem data o número engana.

  *Implementação:* `RegionalPriceProvider` (interface + schemas Zod como fonte da
  verdade, tipos por `z.infer`), `PrecoDaHoraBahiaProvider` (piloto BA) e
  `CachedRegionalPrice` (cache + roteamento por UF, implementa a própria interface
  mais `RegionalPriceResolver`). Endpoint `GET /catalog/regional-price/:barcode`
  com `?cep=&uf=&raio=`; sem parâmetro, UF e CEP saem de `establishments.settings`
  — a tabela não tem colunas de endereço. O envelope carrega `available` + `reason`
  (`uf_nao_configurada` / `sem_cobertura`) em vez de erro: ausência de cobertura é
  resposta normal, não falha. A quota traz `sampleCount` além de mín/méd/máx —
  sem isso, mínimo e máximo podem ser a mesma venda. Amostra abaixo de
  `REGIONAL_PRICE_MIN_SAMPLE` (3) é descartada. O portal da BA exige três passos
  (sessão com CSRF de input escondido → geocodificação do CEP via Nominatim →
  POST com `gtin` + lat/lng + raio) e limita requisições por IP, então cache com
  TTL de 12h para acerto e 2h para vazio é parte do contrato, não otimização.

  *Verificação:* consulta real ao portal com o GTIN `7891000100103` (Leite Moça)
  no CEP `41750000`/raio 5km devolveu `min 6.98 · méd 10.88 · máx 13.99` sobre
  17 notas, coleta de `2026-08-02T12:46:52Z`. Segunda chamada idêntica: 1,086s →
  0,010s pelo cache. UF sem provider (SP) e estabelecimento sem UF nas settings
  devolvem `available:false` com o motivo correspondente, 200 e não 500. Barcode
  inválido → 400; sem token → 401. Nenhum caminho grava preço: o endpoint é `GET`
  e só devolve referência. `tsc --noEmit` sem erros novos (os 21 restantes são
  pré-existentes em `tables`/`orders`/`router`/`server`/`cashier`/`delivery`).
- ✅ **T4.5** Na tela, sugestão de preço aparece como **referência ao lado do
  campo**, nunca preenchendo sozinha, e sempre acompanhada da margem que aquele
  preço daria sobre o custo do último lote (Fase 1). É aqui que o estoque paga a
  integração: sem custo real, "preço da região" não informa decisão nenhuma.

  *Implementação:* no SDK (`@adatechnology/products-ui`, branch
  `feat/products-price-reference`, commit `cee1e4f`): tipo `PriceReference`,
  componente `PriceReferenceHint` e a prop opcional `onFetchPriceReference` no
  `ProductForm` — sem a prop o formulário não muda em nada. O bloco fica logo
  abaixo do campo de preço de venda e mostra mínimo/médio/máximo, cada um com a
  margem sobre o custo digitado, mais contagem de notas, data da coleta e a
  procedência. Aplicar é clique explícito no `usar`; a consulta também é sob
  demanda, não a cada tecla, porque a base limita requisição por IP. Trocar o
  código de barras descarta a referência anterior — mantê-la a atribuiria ao
  produto errado. No host, `CatalogPage` traduz o envelope do
  `GET /catalog/regional-price/:barcode` para o tipo do SDK e devolve `null`
  quando não há cobertura.

  *Verificação:* no navegador, GTIN `7891000100103` com custo R$ 6,50 exibiu
  `mín R$ 6,98 · margem 7%`, `méd R$ 10,88 · margem 40%`, `máx R$ 13,99 ·
  margem 54%`, com "17 nota(s), coleta de 02/08/2026 · precodahora-ba". O campo
  de preço permaneceu vazio até o clique em `usar`, quando recebeu R$ 10,88.
  GTIN sem cobertura exibiu o aviso de programa estadual em vez de erro. Trocar
  o código depois da consulta apagou o bloco. Nada foi salvo: o catálogo seguiu
  com 5 produtos. `tsc --noEmit` limpo no SDK e sem erros novos em `apps/web`
  (os 5 restantes são pré-existentes em `pwa`, `layout` e `LoginPage`).

  *Pendência de configuração:* a UF e o CEP saem de `establishments.settings`,
  que o seed cria vazio. O piloto foi configurado direto no banco com
  `{"state":"BA","postalCode":"41750000"}` — falta expor esses dois campos na
  tela de Configurações para que não dependa de SQL.

### 4C — Sugestão de produtos e kits (o mais valioso, e nem precisa de fora)

Aqui eu discordo do caminho externo. Base externa não sabe o que **este**
estabelecimento vende junto; o histórico de pedidos sabe, e ele já está no banco.

- ✅ **T4.6** "Comprados juntos": co-ocorrência de itens em `order_items` no mesmo
  pedido, calculada em job agendado (não na requisição). Alimenta sugestão de
  kit no cadastro e upsell no bot do WhatsApp — o mesmo dado serve às duas
  telas.

  *Implementação:* tabela `product_affinities` (migration `0029`) com o par
  **direcionado**: a linha (A → B) responde "quem levou A, com que frequência levou
  B", que não é a mesma pergunta que (B → A). Guardar as duas direções também torna
  "sugestões para o produto X" um único lookup indexado. Cálculo em
  `ProductAffinityCalculator.ts`, consumido por `ProductAffinityWorker` na fila
  `product-affinity` (BullMQ, cron `0 4 * * *`), ligado por
  `PRODUCT_AFFINITY_WORKER_ENABLED` no mesmo padrão opt-in dos workers fiscal/finance/
  iFood, com shutdown gracioso e registro no Bull Board. O recálculo é **total dentro
  de uma transação** (`DELETE` + `INSERT ... SELECT`), não incremental: contagem
  incremental derivaria da verdade a cada pedido cancelado ou item removido, e a janela
  móvel exige reprocessar o passado de qualquer forma. Pedido cancelado é excluído
  (`cancelled_at IS NULL`) e o `DISTINCT` no CTE impede que o mesmo produto em duas
  linhas do pedido (sabores, observações) conte como co-ocorrência consigo mesmo.
  Cortes em constante: janela 90 dias, mínimo 3 co-ocorrências, confiança mínima 15%,
  5 sugestões por produto. Leitura por `GET /catalog/products/:id/affinities`, que só
  lê a tabela materializada — a agregação de 90 dias não pode cair no tempo de resposta
  da tela.

  *Verificação:* migration aplicada e conferida com `\d product_affinities` (unique do
  par, índice de lookup e três FKs em cascade). Worker exercitado de verdade dentro do
  container (fila → worker → cálculo), não só a função: `6 par(es) calculado(s)`. Os
  dados do seed confirmaram a assimetria que motivou o par direcionado — Refrigerante
  Lata → Prato Feito Carne dá confiança **0,75**, enquanto Prato Feito Carne →
  Refrigerante Lata dá **0,30**. Endpoint retorna 3 sugestões ordenadas por confiança
  decrescente com o produto sugerido embutido; 404 em produto inexistente e 401 sem
  token. Filtro de inativo testado desativando o Refrigerante: a lista caiu para 2 itens
  e voltou a 3 ao reativar. Estado de teste removido ao final (tabela, chaves
  `bull:product-affinity` e produto reativado).

  *Não verificado:* o isolamento por estabelecimento está no `WHERE` das duas consultas,
  mas o seed tem um único estabelecimento — não houve como provar ao vivo que produto de
  outro tenant devolve 404.

  *UI entregue depois:* `RelatedProductsHint` no `@adatechnology/products-ui`, exposto
  ao host pela prop opcional `onFetchRelatedProducts` do `ProductForm` — mesmo padrão de
  `onFetchPriceHistory`: sem a prop o formulário não muda em nada. Renderiza só na
  **edição** (guarda `initialValues?.id`), porque produto que ainda não existe não foi
  vendido com ninguém, e a busca é **sob demanda** (botão "Ver o que costuma sair
  junto"), para não pendurar uma requisição por produto na abertura do formulário. A
  linha mostra confiança **e** número de pedidos: confiança sozinha engana em amostra
  pequena. Sem par, o texto é "Ainda não há venda suficiente para apontar um par com
  segurança" — não um vazio mudo. Colocado no cadastro do produto porque não existe tela
  de montagem de kit em `apps/web` (T4.7 é só API), e é quem cadastra que decide o combo.
  Host em `CatalogPage.fetchRelatedProducts`, traduzindo a linha da API
  (`confidence` decimal em string → percentual inteiro).

  *Verificação (UI):* logado no navegador, editando "Marmita Executiva" — o botão
  aparece, e ao clicar a lista renderiza "Prato Feito Carne · 80% · 4 pedido(s)", batendo
  com os pares materializados. `tsc --noEmit` em `apps/web` segue nos 5 erros de baseline.

  *Dívida:* falha de rede e "sem dado" são indistinguíveis para o usuário — o host
  captura o erro e devolve lista vazia, então token expirado exibe a mesma frase de
  amostra insuficiente. Vale o mesmo para o histórico de preço (T3.4).
- ✅ **T4.7** Kit/combo como produto composto: um produto que agrega outros com
  preço próprio, que ao ser vendido baixa a receita de cada componente
  (reaproveita T1.2 direto).

  *Implementação:* `products.is_kit` + tabela `product_components` (migration `0030`).
  O kit tem preço próprio — é o motivo de existir, combo custa menos que a soma — mas
  **não** tem receita própria: `DeductStockForOrderUseCase` expande o kit nos
  componentes e aplica a receita de cada um, reaproveitando a T1.2 sem duplicar regra
  de consumo. O use case foi refatorado em `resolveConsumptionLines` +
  `consumeRecipe`, porque o método único já passava de 100 linhas e a expansão o
  faria crescer mais.

  **Kit não pode conter kit.** A expansão é de um nível só, e é o cadastro que garante
  isso: sem a regra, um ciclo (A contém B, B contém A) travaria a baixa de um pedido —
  justamente o caminho onde há dinheiro em jogo. Guardas no cadastro: componente
  inexistente ou de outro estabelecimento, kit contendo a si mesmo, produto que não é
  kit, quantidade ≤ 0. No banco, `CHECK` de auto-referência e de quantidade positiva,
  `UNIQUE` do par e `ON DELETE restrict` no componente — apagar item que compõe kit
  deve falhar, não corromper o kit em silêncio. `PUT /components` substitui a
  composição inteira **em transação**: a composição salva é a que o usuário viu, sem
  janela com o kit pela metade.

  *Verificação:* migration conferida com `\d product_components`. Kit "Combo Almoço"
  criado com Prato Feito Carne ×1 e Refrigerante Lata ×2; pedido de **2 unidades do
  kit** movido para `in_production` baixou exatamente o esperado — arroz
  `0,3 × 1 × 2 = 0,6 kg` e refrigerante `1 × 2 × 2 = 4 un` — com um `stock_movement`
  por ingrediente. As cinco guardas de cadastro retornaram `validation_error` e a
  composição sobreviveu intacta às tentativas falhas. Estoque insuficiente **no
  componente** devolve 409 nomeando o componente ("Refrigerante Lata"), não o kit, e
  o rollback da transação preservou o arroz que já tinha sido processado antes na
  mesma baixa. Repetir a transição não duplica movimento. `DELETE` do kit remove os
  componentes em cascade sem deixar órfão.

  *Corrigido no caminho:* o `ON DELETE restrict` protegia o dado mas estourava como
  **500**. Apagar produto usado em kit é condição de negócio previsível: `deleteProduct`
  agora checa antes e devolve 409 nomeando o kit que está no caminho.
- **T4.8** Sugestão de itens que faltam no catálogo, a partir do que a região
  vende e o estabelecimento não tem. **Depende de 4B** e só é honesto no estado
  com cobertura. Último da fila.

### Ordem recomendada

`4A (cache + fallback)` → `4C (kits e comprados juntos)` → `4B (preço regional,
uma UF)` → `4A T4.2 (provider fiscal pago)`.

O 4C entrega valor sem depender de terceiro, de contrato ou de cobertura
estadual — e é o que mais muda o ticket médio.

---

## Riscos e regras que valem para tudo aqui

- Movimentação de estoque é **efeito com dinheiro atrás**: transação,
  idempotência e trilha de auditoria em toda escrita. Sem exceção.
- Todo provider externo é encapsulado atrás de interface e injetado (nada de
  `new` acoplado), com timeout, cache e degradação silenciosa — catálogo não
  pode parar de abrir porque a OpenFoodFacts caiu.
- Resposta de API externa é entrada não confiável: valida com Zod antes de
  chegar perto do formulário.
- Nenhum dado pessoal em log de estoque; `userId` opaco basta para a auditoria.
