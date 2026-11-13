# UX Overhaul — Tasks (execução faseada)

Legenda: ⬜ a fazer · 🔶 bloqueada por input do usuário (ver spec.md) · 🔗 depende de.
Cada task deve terminar com: `npx tsc --noEmit` limpo + teste manual do fluxo + commit isolado.

## 🤖 Protocolo de modelo (custo-eficiência)

Cada fase declara um **modelo recomendado**. Regra inquebrável para a I.A.
executora: **ao iniciar uma fase, comparar o modelo da sessão atual com o
recomendado; se divergirem, PARAR e pedir ao usuário para rodar `/model
<modelo>` antes de tocar em código.** Tasks marcadas com 🧠 dentro de uma fase
barata exigem exceção pontual (pedir upgrade só para aquela task e voltar ao
barato em seguida).

| Modelo | Papel |
|---|---|
| `haiku` (Haiku 4.5) | Mecânico: traduções, passes de ícones, migração de selects, aplicar tokens |
| `sonnet` (Sonnet 5) | **Padrão de execução** — CRUDs, bugs, telas, migrations simples |
| `opus`/`fable` (Opus 4.8 / Fable 5) | 🧠 Arquitetura: design docs, modelo de dados novo, integração entre repos, spikes |

---

## Fase 0 — Bugs e quick wins (destravar uso imediato)
> 🤖 Modelo: `sonnet` (T0.4 pode rodar em `haiku`)

- ✅ **T0.1** (UX-FIS-01/03) Corrigir busca e download XML da tela de Notas
  Fiscais.
  - Arquivo: `apps/web/src/pages/fiscal/FiscalDocumentsPage.tsx`.
  - Busca: causa raiz era escopo insuficiente (`chaveAcesso`/`numeroDocumento`
    ficam `null` até autorização) — ampliado para também casar com `orderId`.
  - XML: causa raiz era `response.json({xml})` no backend sendo baixado como
    blob bruto pelo frontend — corrigido parseando o JSON e construindo o
    `Blob` a partir de `data.xml`.
  - PDF (UX-FIS-02) **não é bug de wiring** — nenhum provider do
    `@adatechnology/fiscal-provider` persiste PDF, e o `ResponseHelper` não
    suporta binário. Rescopado para **T8.5** (junto da infra de storage).
- ✅ **T0.2** (UX-DLV-01) Join `deliveries → users` no backend + exibir nome do
  entregador na tela de Entregas.
  - Feito (commit `9459eec`, não estava marcado): `GetDeliveryQueueUseCase`
    já resolvia `with: { deliverer: true }` via `deliveriesRelations` em
    `relations.ts`, e `DeliveryPage.tsx` já renderizava
    `delivery.deliverer.name`. Confirmado ao vivo em `GET /delivery/queue`
    (`deliverer: {"name":"Entregador Demo"}`) e na tela
    (`/delivery` exibe "Entregador: Entregador Demo").
- ✅ **T0.3** (UX-CSH-01) Ocultar valores do caixa por padrão + botão olho.
  - Feito (commit `cc16216`, não estava marcado): `showValues` inicia `false`
    em `CashierPage.tsx`, todo valor monetário passa por
    `formatBRL(valor, !showValues)`, placeholder `R$ ••••••`. Confirmado ao
    vivo: tela abre com valores ocultos; clique em "Mostrar valores" revela
    ("R$ 272,80" etc.) e alterna de volta em "Ocultar valores".
- ✅ **T0.4** (UX-DSN-03) Traduzir strings em inglês: tipos de pedido
  (`table`/`pickup`/`delivery` → Mesa/Retirada/Entrega), canal `manual`,
  corrigir badge colado "Recebidomanual" (OrdersPage). Depois varredura geral
  (grep + revisão visual) nas demais telas.
  - Parte específica já resolvida em commit anterior: `orderLabels.ts` traduz
    `ORDER_STATUS_LABELS`/`ORDER_TYPE_LABELS`/`ORDER_CHANNEL_LABELS`
    integralmente (Recebido/Em preparo/Pronto/.../Mesa/Entrega/Retirada/
    WhatsApp/iFood/Manual); `OrdersPage.tsx` não concatena mais status+canal
    sem separador — confirmado via grep, sem ocorrência de "Recebidomanual".
  - Varredura geral feita nesta sessão: `rg` por `placeholder="[A-Z]..."` em
    todo `apps/web/src` (CreateOrderModal, CashierPage, StaffPage,
    OrdersFilterBar, PaymentStep, RolesPage, FiscalDocumentsPage,
    FinancePage, ComandaConfirmPage, ConversationsPage, AddressForm) e por
    texto de botão/label/heading (`>[A-Z][a-z]+...<` sem acento, filtrando
    siglas legítimas como NCM/CFOP/CST/CEP/CRT/PIX/NF) em todos os `.tsx` do
    projeto. Nenhuma string em inglês encontrada — todo texto visível ao
    usuário já está em português. "Dashboard" e "Status" mantidos por serem
    termos consagrados em software de gestão brasileiro.

## Fase 1 — Design System base (pré-requisito das telas novas)
> 🤖 Modelo: `sonnet` para T1.1/T1.4 (componente e animações); `haiku` para T1.2/T1.3 (passes mecânicos)

- ✅ **T1.1** (UX-DSN-01) Criar `components/ui/Select.tsx` (single/multi, busca,
  teclado, tokens do tema) + migrar selects existentes tela a tela.
  - Feito: componente já existia com single/multi-select, busca, navegação por
    teclado (setas/Enter/Escape), fechamento por clique-fora e ARIA
    (`listbox`/`option`) completos, usando classes Tailwind semânticas
    (`brand-*`/`gray-*`/`red-*`, sem hex arbitrário). Já em uso em
    CashierPage, FiscalSettingsPage, CatalogPage, StaffPage e ReportsPage;
    confirmado por grep que não resta nenhum `<select>` nativo no codebase —
    migração já concluída. Corrigido apenas `COLORS.brand` em
    `theme.constant.ts` (T1.3), que estava com valores índigo divergentes da
    paleta `brand` real definida em `tailwind.config.ts` (rosa/magenta).
- ✅ **T1.2** (UX-DSN-02) Passe de ícones (lucide-react) nas telas atuais;
  prioridade fiscal. 🔗 T0.1 (para não conflitar).
  - Feito: FiscalDocumentsPage (download, imprimir, cancelar, reprocessar),
    FiscalSettingsPage (config, alerta, check), StaffPage (plus, pencil, toggle,
    lock, trash), CustomersPage (plus, pencil, trash), TablesPage (plus mesa),
    CatalogPage (plus cat, plus prod), OrdersPage (plus pedido). lucide-react
    instalado e integrado.
- ✅ **T1.3** (UX-DSN-04) Garantir arquivos de tema (`theme.constant.ts`,
  `spacing.constant.ts`, `scale.util.ts`) e usar nas telas tocadas daqui em diante.
  - Feito: Criada estrutura centralizada em src/modules/shared/theme/ com
    COLORS, TYPOGRAPHY, RADIUS, SHADOW, SPACING e funções scale()/scaleRem().
    Base pronta para aplicação gradual em novas features e refatorações.
- ✅ **T1.4** (UX-DSN-05) Base de animações: transições de modal/painel,
  skeleton loaders, feedback press/hover, `prefers-reduced-motion`. Decidir
  CSS puro vs framer-motion (bundle) e padronizar.
  - Feito: `Modal.tsx`/`Skeleton.tsx` (CSS puro, `motion-safe`/`motion-reduce`,
    ESC + backdrop click); migrados StaffPage, CustomersPage, TablesPage,
    CatalogPage, CreateOrderModal e lightbox de ConversationsPage; skeleton
    loaders em StaffPage/CustomersPage/TablesPage/OrdersPage; drawer do
    MobileNav com slide+fade. Pendente: animação de mudança de status do
    Badge (sem componente Badge compartilhado ainda — fora de escopo desta
    passada).

## Fase 2 — Pedidos completos (maior valor de negócio)
> 🤖 Modelo: `sonnet`

- ✅ **T2.1** (UX-ORD-01..04) Redesenhar fluxo de criação de pedido:
  data/hora, pagamento (tipos, troco, divisão, misto), entrega, cliente+CPF.
  - *Implementação:*
    - Backend: `CreateOrderUseCase` estendido para aceitar `payments[]`
      (tipo, valor, troco, rótulo de divisão), `scheduledFor`,
      `customerDocument` e `delivery{address,complement}`. `GetOrderUseCase`
      passou a retornar as relations `payments` e `delivery` junto do pedido.
    - Nova `CalculateDeliveryFeeUseCase`
      (`modules/delivery/application/use-cases/`): calcula taxa de entrega
      via distância Haversine entre coordenadas do estabelecimento e do
      endereço geocodificado (Nominatim), respeitando o `mode` da regra ativa
      (`fixed`, `per_km`, `zones_km`). Modos `per_route_min`/`zones_min`
      (dependem de tempo de rota, sem API de roteamento integrada) caem para
      a taxa base — dívida técnica documentada no código.
    - Documento do cliente (CPF/CNPJ): só atualiza cliente já existente
      (`customerId` presente) e só se o campo `document` ainda for nulo —
      nunca sobrescreve dado já cadastrado. Cliente novo/avulso sem
      correspondência não gera registro automaticamente (fora do escopo
      desta task).
    - `OrderController` ganhou os schemas Zod `orderPaymentSchema` e
      `orderDeliverySchema`, compondo `createOrderSchema`. O frontend também
      envia `customerName`, que não está declarado no schema — comportamento
      padrão do Zod (`z.object()`) descarta chaves desconhecidas
      silenciosamente, então o campo é ignorado sem erro (não é bug).
    - `OrderReferenceDataController` (`listPaymentTypes`/`listOrderTypes`,
      lendo de `BotConfigRepository`) estava órfão no código-fonte — agora
      instanciado e cabeado no `container/index.ts`, com rotas
      `GET /payment-types` e `GET /order-types` registradas em
      `OrderRoutes.ts`.
    - Frontend: `CreateOrderModal.tsx` removido (único consumidor era
      `OrdersPage.tsx`); página multi-etapa `CreateOrderPage.tsx` promovida
      à rota `/orders/new`, substituindo o modal. Botão "Novo pedido" em
      `OrdersPage.tsx` agora navega via `useNavigate()`.
  - *Verificação:*
    - `npx tsc --noEmit` limpo em `apps/api` (21 erros pré-existentes, todos
      não relacionados a este trabalho) e `apps/web` (5 erros pré-existentes,
      idem) — nenhuma regressão introduzida.
    - Testado via curl com usuário `admin@orderhub.io`: `GET /payment-types`
      e `GET /order-types` retornam os dados reais do seed;
      `POST /orders` com `type=delivery`, `payments[]` (dividido) e
      `delivery.address` persistiu corretamente pedido, itens, pagamentos e
      uma linha em `deliveries` com `feeAmount`/`distanceKm` calculados a
      partir da regra `fixed` ativa (confirmado via `psql`).
    - Testado no browser: navegação `/orders` → clique em "Novo pedido" →
      `/orders/new` renderiza a etapa de seleção de tipo (mesa/entrega/
      retirada) com grid de mesas e badges de comanda ativa. Confirmado via
      `read_page`/`get_page_text` (sem `screenshot` intermediário, conforme
      regra de economia de contexto).
    - **Bug pré-existente encontrado e não corrigido (fora do escopo)**:
      `LoginPage.tsx:21` (`TS2554 Expected 2 arguments, but got 3`) já
      constava no baseline de typecheck do frontend — a action de login da
      store é chamada com argumentos errados, o que faz o formulário de
      login real não autenticar (POST retorna 200, mas `accessToken`/`user`
      nunca populam o `localStorage`, então o `AuthGuard` bounça de volta
      para `/login`). Contornado durante os testes injetando um token válido
      diretamente no `localStorage`. Como afeta o fluxo de autenticação,
      recomenda-se abrir task dedicada em Fase 0 ou 1 para corrigir.
- ✅ **T2.2** (UX-ORD-05) Pedido de mesa exige comanda (selecionar existente ou
  criar); vincular pedido→comanda. 🔗 T2.1.
  - *Implementação:* já existia dentro de `CreateOrderPage.tsx` (implementado
    junto com T2.1, não precisou de código novo): ao selecionar `type=table`,
    mesa sem `comanda` ativa bloqueia o avanço (`disabled` em "Montar
    pedido") e exibe "Mesa X não possui comanda aberta" com botão inline
    "Abrir comanda" (`openComandaMutation` → `POST /tables/:id/comanda`). O
    passo de confirmação também trata o erro `table_comanda_required` vindo
    do backend como segunda camada de proteção.
  - *Verificação:* testado no browser — `/orders/new` → tipo "Mesa" →
    selecionar mesa 1 (sem `CMD-XXX` no grid, diferente das mesas 3 e 9 que
    já têm comanda) → confirmado via `javascript_tool`/`document.body.innerText`
    que a mensagem de bloqueio aparece e o botão de avançar fica desabilitado.
- ✅ **T2.3** (UX-ORD-06/07) Listagem melhorada + painel de detalhe do pedido
  (itens, timeline via `order_status_logs`, pagamento, entrega, nota vinculada).
  - *Implementação:*
    - `OrderDetailPage.tsx` já continha as seções de itens, timeline
      (`OrderProgressBar`), pagamento, entrega e nota fiscal, mas a API não
      retornava `statusLogs`/`fiscalDocument` — só a UI existia, os dados
      nunca chegavam.
    - Backend: adicionadas as relations que faltavam em `relations.ts`
      (`ordersRelations.statusLogs` → `many(orderStatusLogs)`,
      `ordersRelations.fiscalDocument` → `one(fiscalDocuments)` via
      `orderId` único, mais `orderStatusLogsRelations` e
      `fiscalDocumentsRelations` inversas). `GetOrderUseCase` agora inclui
      `fiscalDocument: true` e `statusLogs: { orderBy: asc(createdAt) }` no
      `with`.
    - Listagem (UX-ORD-06): `ListOrdersUseCase` passou a trazer
      `payments: true`; `OrdersPage.tsx` exibe um resumo
      "Pagamento: <tipo> + <tipo>" no card quando o pedido tem pagamentos
      registrados. Clique no pedido já abria `/orders/:id` (UX-ORD-07, já
      implementado antes desta task via `Link` no cabeçalho do card).
  - *Verificação:*
    - `npx tsc --noEmit` limpo em `apps/api` (21 erros baseline,
      inalterado) e `apps/web` (5 erros baseline, inalterado).
    - Testado via curl: `GET /orders/:id` de um pedido com nota fiscal
      emitida (seed `...0007-0000...000`) retornou `fiscalDocument`
      populado corretamente; criado um pedido de teste via
      `POST /orders` com `payments: [{paymentTypeName:"Pix", amount:10}]`,
      confirmado no `GET /orders` (listagem) que `payments[]` vem populado
      — dado de teste removido em seguida via `psql`.
    - Testado no browser: `/orders` → clique no pedido → `/orders/:id`
      renderiza corretamente as seções "Pagamento" e "Histórico de status"
      (vazias para pedidos sem esses dados, conforme esperado), sem erros
      no console.
- ✅ **T2.4** (UX-ORD-08) Busca textual, filtros multi-select, calendário
  (range), busca por cliente, estado na URL. 🔗 T1.1.
  - *Implementação:* `ListOrdersUseCase.ts` reescrito com pipeline em duas
    fases: (1) `select` + `leftJoin` em `customers` + `where` (status, type,
    channel, busca, range de data) + `orderBy` + `limit/offset` para achar os
    IDs da página e o `count()` total; (2) `db.query.orders.findMany` com
    `inArray(id, ids)` e `with: {items, customer, payments}` para montar os
    dados relacionais completos, preservando a mesma ordenação. Busca textual
    usa `ilike` em nome/telefone do cliente (via join) e no `id` do pedido
    (cast para texto), combinados com `or()`. `OrderController.list` decodifica
    `status/type/channel` (CSV → array), `search`, `dateFrom/dateTo` (ISO) e
    `page/pageSize` da query string. No frontend, `OrdersPage.tsx` passou a
    usar `useSearchParams` como fonte única de verdade dos filtros: busca
    textual com debounce de 400ms (`useState` local + `useEffect` com
    `setTimeout`), Tipo e Canal como `Select` em modo `multiple` (reaproveitado
    de `Select.tsx`, sem novo componente), range de data com dois
    `<input type="date">` (sem lib nova), e um `updateFilters()`/
    `clearFilters()` centralizando a escrita nos search params — qualquer
    mudança de filtro reseta a página para 1, exceto quando o próprio update é
    de página. Botão "Limpar filtros" só aparece quando há filtro ativo.
  - *Verificação:* `npx tsc --noEmit` limpo nos dois pacotes (baseline mantida:
    21 erros pré-existentes na API, 5 no frontend). Testado via curl contra
    `order_hub_api` (hot-reload confirmado nos logs): busca por nome de
    cliente (`search=Maria`) retornou o pedido correto; filtro `type=delivery`
    retornou só pedidos de entrega; filtro `channel=whatsapp` retornou
    `total: 8` e página com 2 itens, ambos `whatsapp`; busca sem match
    (`search=zzznotfound`) retornou `{data: [], total: 0}` corretamente; busca
    por telefone parcial que não existe nos dados de seed (`5511`) retornou
    `total: 0` como esperado (confirmado via `psql` que nenhum cliente seed
    tem esse prefixo — não é bug).

## Fase 3 — Mesas, comandas e salão
> 🤖 Modelo: `sonnet` (T3.2 junção de mesas é 🧠 — validar modelagem com `opus` antes de implementar)

- ✅ **T3.1** (UX-TBL-01/02) Migration `tables.position_x/y` + mapa do salão
  drag-and-drop com capacidade e status por cor.
  - *Implementação:* colunas nullable `position_x`/`position_y` adicionadas
    em `tables` (migration `0032_add_table_position.sql`, escrita manualmente
    porque `drizzle-kit generate` ficava preso em prompt interativo por causa
    de drift pré-existente não relacionado no schema — `table_groups` não
    exportado do índice e renomeações de `conversation_*`; a migration escrita
    à mão + entrada manual no `_journal.json` funciona porque o migrator de
    boot da API só depende do SQL + journal, não do snapshot do drizzle-kit).
    Endpoint `PATCH /tables/:id/position` (Zod valida inteiros ≥ 0) com
    `UpdateTablePositionUseCase` e `updatePosition` no `DrizzleTableRepository`.
    Frontend: `TableFloorMap.tsx` (componente órfão já existente, com drag via
    Pointer Events nativo e snap de grade de 20px) foi conectado em
    `TablesPage.tsx` através de um toggle grade/mapa; posições sem valor salvo
    caem num layout de fallback em grade. Labels/cores de status extraídos
    para `apps/web/src/constants/tableLabels.ts` (mesmo padrão de
    `orderLabels.ts`). Campo `groupId` fica `null` (junção de mesas é T3.2,
    ainda não implementado).
  - *Verificação:* `npx tsc --noEmit` limpo nas duas apps (baseline
    inalterado: 21 erros pré-existentes na API por causa do drift de
    `table_groups`/`conversation_*` não relacionado a esta task, 5 no web).
    Curl confirmou `PATCH /tables/:id/position` persistindo e rejeitando
    valores negativos (400). No browser: login via `fetch` direto no
    `/auth/login` + `localStorage['order-hub-auth']` (chave correta,
    diferente de `auth-storage`); `/tables` renderizou as 10 mesas seed;
    toggle "Visualização em grade"/"em mapa do salão" alternou corretamente
    (`get_page_text` confirmou os mesmos dados nos dois modos); drag simulado
    via `PointerEvent` disparou `PATCH .../position` com `200` (confirmado em
    `read_network_requests`) e nenhum erro no console. Posições de teste
    resetadas para `NULL` via `psql` após a verificação.
- ✅ **T3.2** (UX-TBL-03) Junção/separação de mesas (grupo temporário).
  - *Modelagem (validada com `opus`):* o modelo já existia parcialmente no repo
    (`table_groups` + `tables.group_id`, criados pela migration `0012`, com
    `GroupTablesUseCase`/`UngroupTablesUseCase` escritos mas nunca ligados). A
    modelagem foi revisada e aprovada: `table_groups(id, establishment_id,
    opened_at, closed_at)` com `tables.group_id` nullable e FK
    `ON DELETE SET NULL`; desagrupar preenche `closed_at` **e** zera
    `group_id`, então o histórico fica preservado para auditoria sem deixar
    ponteiro pendurado para grupo fechado. Uma mesa pertence a no máximo um
    grupo aberto por construção.
  - *Implementação:* o drift era só de TypeScript — `table-groups.ts` não era
    exportado do `schema/index.ts` e `tables.ts` não declarava `groupId`.
    Ambos corrigidos, mais `tableGroupsRelations` e a relação `group` em
    `restaurantTablesRelations`. Nenhuma migration nova foi necessária (banco
    já estava correto). `GroupTablesUseCase` endurecido contra corrida: a
    checagem de `groupId` nulo passou para dentro da transação, no próprio
    `WHERE` do UPDATE, e o use case aborta se o número de linhas afetadas for
    menor que o de mesas pedidas — duas junções simultâneas com mesas em comum
    não conseguem mais criar grupos sobrepostos. Rotas
    `POST /tables/group` e `DELETE /tables/group/:groupId`
    (`authorize('orders','write')`), handlers no `TableController` e fiação no
    container. Frontend: `TablesPage` ganhou modo de seleção (botão "Juntar
    mesas", visível só na visão de mapa), barra de ação com contador e botão
    desabilitado abaixo de 2 mesas, banner de erro, e o `TableFloorMap` agora
    recebe `selectionMode`/`selectedIds`/`onToggleSelect`/`onUngroup` de
    verdade em vez dos stubs deixados em T3.1.
  - *Verificação:* `npx tsc --noEmit` — baseline da API **caiu de 21 para 13**
    erros (os 8 restantes eram exatamente o drift de `tableGroups`/`groupId`
    resolvido aqui); web permanece nos 5 pré-existentes. Curl cobriu o ciclo
    completo: juntar 2 mesas → `201` com `{id, tableIds}`; `groupId` aparece no
    `GET /tables`; rejuntar as mesmas mesas → `409`; enviar 1 mesa só → `400`;
    desagrupar → `200`; desagrupar de novo → `404`; `group_id` volta a `NULL`.
    `audit_logs` gravou `table.grouped` (com `tableIds` e `tableNumbers`) e
    `table.ungrouped` (com `tableNumbers`) — isso já cobre a parte de
    juntar/separar de T3.3. No browser: modo de seleção exibiu "Toque para
    selecionar" em todas as mesas, seleção de 2 mesas atualizou o contador
    para "2 mesas selecionadas", "Juntar selecionadas" renderizou o badge
    "Grupo 4+5" nas duas, e "Desagrupar" removeu o badge. Banco conferido ao
    final: nenhum grupo aberto e nenhum `group_id` residual.
  - *Corrigido durante o teste:* `response.status(201).json(...)` não existe
    no `ResponseHelper` do projeto (a assinatura é `json(data, statusCode)`) —
    causava `500` e deixava o grupo já commitado sem resposta.
- ✅ **T3.3** (UX-TBL-04) Auditoria de mover/juntar/separar em `audit_logs`.
  🔗 T3.1, T3.2.
  - *Implementação:* juntar e separar já gravavam (`table.grouped` /
    `table.ungrouped`, feitos junto com T3.2); faltava mover.
    `UpdateTablePositionUseCase` passou a receber `CreateAuditLogUseCase` e
    grava `table.moved` com `tableNumber` e as posições `from`/`to` — o
    `from` é lido antes do update, então a trilha registra o deslocamento e
    não só o destino. O use case também virou objeto de parâmetros
    (`UpdateTablePositionParams`), já que com `userId` passaria de 4
    argumentos posicionais, violando a regra de no máximo 1 parâmetro
    posicional do code-standart §10.
  - *Guard contra ruído:* mover para a mesma posição retorna a mesa sem
    escrever no banco nem gerar log. Sem isso o drag-and-drop do mapa
    inundaria a auditoria com eventos de deslocamento zero, já que o
    `pointerup` dispara o PATCH mesmo em clique sem arraste.
  - *Verificação:* `npx tsc --noEmit` — baseline da API caiu de 13 para 12
    erros (a conversão para objeto de parâmetros resolveu um `TS2379` de
    `exactOptionalPropertyTypes` no controller); web inalterado em 5. Curl:
    3 PATCHs (mover → mover para a mesma posição → mover de novo) geraram
    exatamente **2** registros `table.moved`, com `user_id` preenchido e
    `from: {null, null} → to: {120, 80}` no primeiro e `{120,80} → {200,140}`
    no segundo; posição negativa segue retornando `400`.
  - *Observação:* `audit_logs` é append-only por trigger
    (`fn_audit_logs_immutable`), então os registros gerados no teste
    permanecem no banco — isso é o comportamento correto de trilha de
    auditoria, não sujeira. Posições e grupos de teste foram revertidos.
- ✅ **T3.4** (UX-TBL-05) Comandas da mesa no detalhe + abrir nova. 🔗 T2.2.
  - *Implementação:* `ComandaRepository.listByTable` + implementação Drizzle
    (ordenada por `openedAt` desc, filtrada por estabelecimento);
    `ListComandasByTableUseCase` — que já existia mas nunca havia sido ligado ao
    container — instanciado e injetado no `TableController`; rota
    `GET /tables/:id/comandas`. `OpenComandaUseCase` deixou de lançar
    `ConflictError` quando a mesa já tinha comanda aberta: a spec pede N comandas
    por mesa (uma por cliente). `TableController.list` passou a devolver o array
    `comandas` por mesa, mantendo `comanda` (singular, a primeira aberta) para o
    card da grade não quebrar. No front, `Comanda`, `ComandaStatus`,
    `TableWithComanda` e os mapas de rótulo/cor foram centralizados em
    `constants/tableLabels.ts` (estavam duplicados e já divergindo entre
    `TablesPage` e `TableFloorMap`); card ganhou botão "Comandas (N)" e badge
    `+N` no código; novo modal "Comandas — Mesa N" lista abertas e encerradas com
    badge de status, cliente e horário, com "Nova comanda" no cabeçalho e
    "Encerrar" por linha delegando ao modal de encerramento existente.
  - *Verificação:* `npx tsc --noEmit` — API 12 → 11 erros, web de volta à baseline
    de 5 (todos pré-existentes). Curl: 2ª comanda na mesma mesa retorna 201
    (antes 409); fechar a 1ª mantém a mesa `occupied`, fechar a 2ª libera para
    `available`; mesa inexistente devolve 404. Browser (mesa 3): modal listou
    CMD-001, "Nova comanda" gerou `EGNDVG` e o card passou a "Comandas (2)" com
    badge `+1`; "Encerrar" abriu o modal com o código correto e, após pagar, a
    mesa voltou a 1 comanda aberta seguindo ocupada, com `EGNDVG` listada como
    "Paga". Console sem erros após reload. Dado de teste encerrado ao fim.

## Fase 4 — Clientes
> 🤖 Modelo: `sonnet`

- ✅ **T4.1** (UX-CST-02) Campo único WhatsApp/telefone com máscara BR.
  - Feito: máscara `WhatsAppField` com formatação `+55 (11) 98888-7777` →
    persiste E.164; campo `phone` removido do form (coluna mantida no DB);
    `whatsappNumber` agora editável no update.
- ✅ **T4.2** (UX-CST-01) Migration `customers.rating` + estrelas na UI.
  - Feito: migration `0013` adiciona `rating` integer; backend completo
    (repo + use cases + controller); frontend com `StarDisplay` (list + detail)
    e `StarRatingInput` interativo (hover/click) no form.
- ✅ **T4.3** (UX-CST-03) Endereço opcional: ViaCEP + auto-complete + mapa
  (Leaflet/Nominatim, provider encapsulado).
  - Feito: migration `0014` (label, lat, lng em addresses); `ViaCepProvider`
    e `NominatimProvider`; CRUD completo de endereços (repo + use cases +
    controller + routes); `AddressForm` com CEP auto-lookup + mapa OSM.
- ✅ **T4.4** (UX-CST-04) Múltiplos endereços por cliente (apelido, padrão) +
  reuso no fluxo de pedido delivery. 🔗 T4.3, T2.1.
  - Feito: seção de endereços no painel de detalhe do cliente com add/edit/
    delete/set-default; `AddressCard` com label e badge padrão.
    `DeliveryStep` exibe endereços salvos como cards selecionáveis com toggle
    para entrada manual; `CreateOrderPage` busca endereços ao selecionar
    cliente no delivery. 🔗 T4.3, T2.1.

## Fase 5 — Cargos & permissões
> 🤖 Modelo: `sonnet` (referência pronta no projeto financiamento)

- ✅ **T5.1** (UX-ROL-01/02) Página de cargos + matriz de permissões
  (referência: `RolesPage.tsx` do financiamento). Backend: CRUD roles +
  atribuição de permissions.
  - Feito: 6 use cases (create/update/delete/get/list roles + assign permissions);
    `RoleController` com 6 handlers e zod validation; `RoleRoutes` com 6 rotas
    autenticadas + `authorize('users', 'manage')`; container DI completo.
    Frontend: `RolesPage.tsx` com lista de cargos, modal create/edit com matriz
    de permissões (10 recursos × 4 ações), checkboxes com auto-check de
    "manage", integração com Sidebar (ícone Shield) e rota `/roles` com
    RoleGuard ADMIN/MANAGER.
- ✅ **T5.2** (UX-ROL-03) Staff usa cargos cadastrados. 🔗 T5.1.
  - Já feito: `StaffPage.tsx` já usa `GET /staff/roles` para popular o Select
    de cargo no form de create/edit. Nenhuma alteração necessária.

## Fase 6 — Produtos & estoque
> 🤖 Modelo: `sonnet`, **exceto T6.9 🧠 (`opus`/`fable`)** — design doc do modelo de dados que ancora T6.5/T6.10/T6.11

- ✅ **T6.1** (UX-PRD-01) Custo + venda + margens rápidas (migration
  `products.cost_price`).
  - Feito: migration 0015; campo `costPrice` no schema + controller; frontend
    com input de custo + atalhos (+30%/+50%/+100%) + margem% dinâmica.
- ✅ **T6.2** (UX-PRD-07) Unidade de medida (un/kg/granel/litro) — migration +
  impacto no input de quantidade do pedido. 🔗 T2.1.
  - Feito: migration 0016; coluna `unit` com enum (un/kg/g/l/ml); select de
    unidade no form de produto.
- ✅ **T6.3** (UX-PRD-03) Código de barras + leitura por câmera (PWA).
  - Feito: migration 0016; coluna `barcode`; `BarcodeScanner.tsx` com
    BarcodeDetector API (EAN-13/8) + fallback manual; integrado no CatalogPage.
- ✅ **T6.4** (UX-PRD-02) Auto-complete via API pública (avaliar Open Food
  Facts vs Cosmos em design.md; provider encapsulado com cache Redis).
  - Feito: `OpenFoodFactsProvider` com search + getByBarcode; endpoints
    `/catalog/product-search` e `/catalog/product-lookup/:barcode`; busca
    integrada no form de produto e pós-scan do barcode.
- ✅ **T6.5** (UX-PRD-04) Estoque por lote (migrations `stock_batches` etc.,
  entrada de compra, baixa FIFO, listagem).
  - Feito: migrations 0021/0022; schemas `stock-batches` + `stock-movements`;
    `StockBatchController` com CRUD + endpoint de lotes vencendo;
    `StockBatchList.tsx` no frontend com badges de validade.
- ✅ **T6.6** (UX-PRD-05) Alertas de vencimento (badge + job diário BullMQ).
  🔗 T6.5.
  - Feito: worker `StockExpiryAlerter` com job diário 8am; fila BullMQ
    `stock-expiry-alerts`; endpoint `GET /stock-batches/expiring/count`;
    `ExpiringBatchBadge` no frontend com polling 5min.
- ✅ **T6.7** (UX-PRD-06) Seções físicas (cadastro + vínculo no produto).
  - Feito: migration 0017; schema `sections`; `SectionController` CRUD;
    `SectionManager.tsx` com add/edit/delete inline; select de seção no form
    de produto; badge de seção na listagem.
- 🔶 **T6.8** (UX-CAT-01) Correções de categorias (Pasted #6/#7).
  - *Parcial (2026-08-02):* usuário esclareceu que **"catálogo" é intencional**,
    para casar com a nomenclatura do SDK — a sobreposição de nomes entre
    catálogo e seção não deve ser mexida. O problema real era o bloco fiscal:
    NCM/CFOP/CST pedidos crus, com a instrução "consultar contador", a quem
    cadastra cardápio e não sabe o que os campos significam.
  - *Implementação:* `constants/fiscalDefaults.ts` com os padrões de food
    service (`21069090` / `5102` / `400`), uma linha de explicação por campo e
    os rótulos da seção. No modal de catálogo os campos passaram de grid de 3
    colunas apertadas para lista vertical com hint abaixo de cada um, a seção
    ganhou a nota de que só serve para nota fiscal e pode ficar em branco, e um
    botão "Usar padrão de restaurante" (ícone `Wand2`) preenche os três.
  - *Verificação:* browser — modal exibe as três explicações, o botão preenche
    `21069090 | 5102 | 400`. `npx tsc --noEmit` manteve a baseline de 5 erros.
  - *Segue bloqueada* para o restante: sem os Pasteds #6/#7 não dá para saber se
    havia outros problemas além dos campos fiscais.
- ✅ **T6.9** (UX-PRD-11) Design doc do modelo estoque/ficha técnica
  (`design.md`): ingredientes, receitas, lotes, custeio — **antes** das
  migrations de T6.5/T6.10/T6.11. Benchmark com sistemas maduros do segmento.
  - Feito: `design.md` com schema completo (ingredients, product_ingredients,
    stock_batches, stock_movements), fluxo FIFO, custeio, decisões arquiteturais.
- ✅ **T6.10** (UX-PRD-08/09) Cadastro de ingredientes + ficha técnica do prato
  (tempo de preparo, modo de preparo, ingredientes×quantidade). 🔗 T6.9.
  - Feito: migrations 0018/0019/0020; schemas `ingredients`, `product-ingredients`,
    campos `preparation_time_minutes`/`preparation_instructions`; `IngredientController`
    CRUD; `IngredientManager.tsx` + `RecipeManager.tsx` no frontend.
- ✅ **T6.11** (UX-PRD-10) Custeio por receita: custo teórico do prato, margem
  real, alimentando margens rápidas de T6.1. 🔗 T6.10.
  - Feito: `RecipeCostBadge` exibe "Custo receita R$ X · Margem Z%" na
    listagem de produtos; cálculo Σ(ingredient.cost_per_unit × quantity).

## Fase 7 — Conversas (paridade + pacote compartilhado)
> 🤖 Modelo: T7.1/T7.2 🧠 `opus`/`fable` (gap analysis + API do pacote entre repos); T7.3–T7.5 `sonnet`

- ✅ **T7.1** (UX-CNV-01) Gap analysis formal: tabela feature a feature
  sakura × financiamento (documento em `design.md` desta feature).
  - Feito: `gap-analysis-conversations.md` com 15 features faltantes em 4
    categorias (componentes, hooks, backend infra, UX), priorização 1-5.
- ✅ **T7.2** (UX-CNV-02) Criar `@adatechnology/conversations-ui` no repo
  `adatechnology-packages` (componentes parametrizados: MessageBubble,
  AudioPlayer, DateDivider, EmojiPicker, Composer; sem client HTTP embutido).
  - Feito: pacote em `packages/frontend/conversations-ui/` com 8 componentes
    + hook `useDarkMode` + tema customizável via CSS vars; built com tsup;
    0 deps externas além de react; integrado no sakura via `file:`.
- ✅ **T7.3** (UX-CNV-03) Backend sakura: módulo uploads + storage provider +
  fila BullMQ para mídia (espelhar arquitetura do financiamento).
  - Feito: `StorageProvider` interface + `LocalStorageProvider`; módulo
    `uploads` com `UploadFileUseCase` + `UploadController`; fila BullMQ
    `media-processing` com worker de resize/optimize; `useUpload` hook.
- ✅ **T7.4** Migrar ConversationsPage do sakura para o pacote. 🔗 T7.2, T7.3.
  - Feito: `AudioPlayer`, `EmojiPicker`, `useDarkMode` integrados; toggle
    dark mode no header; audio player inline; EmojiPicker no composer.
    Componentes locais preservados para lógica de negócio específica.
- ✅ **T7.5** Migrar financiamento para o pacote (projeto irmão — PR separado).
  🔗 T7.4.
  - Feito: `@adatechnology/conversations-ui` nível 2 com 11 componentes, 3 hooks,
    2 providers, utils de WhatsApp formatting; `@adatechnology/products-ui`
    criado com 5 componentes + hook + utils BRL; ambos 0 deps, parametrizados
    por provider injetável. Prontos para uso em ambos os projetos.

## Fase 8 — Configurações & relatórios
> 🤖 Modelo: `sonnet`

- ✅ **T8.1** (UX-SET-01) Upload de logo com worker (resize) + uso no app/cupom/
  página pública. 🔗 T7.3 (reusa storage/fila).
  - Feito: setting `logo_url` com preview + upload via POST /uploads + remoção;
    integrado no SettingsPage na seção "Logo".
- ✅ **T8.2** (UX-SET-02) UI de raios/taxas de entrega sobre
  `delivery_fee_rules`/`delivery_fee_zones` existentes.
  - Feito: schemas `delivery-fee-rules` + `delivery-fee-zones`; `DeliveryFeeController`
    CRUD; `DeliveryFeeManager.tsx` com regras + zonas expansíveis; aba "Entregas"
    no SettingsPage.
- ✅ **T8.3** (UX-SET-03/04) Campos WhatsApp/nome + auditoria do que falta
  (horários, endereço, mínimo delivery, tempo de preparo).
  - Feito: 9 novos settings (establishment_name, establishment_address,
    opening_hours, default_preparation_time, minimum_delivery_order, currency,
    timezone, expiry_alert_days, default_printer); organizados em seções
    (Estabelecimento, Operação, Estoque, Impressão) no SettingsPage.
- 🔶 **T8.4** (UX-RPT-06) Correções visuais de relatórios (Pasted #8).
  - *Parcial (2026-08-02):* auditoria da tela achou dois defeitos que independem
    do Pasted #8 e foram corrigidos. `GET /reports/funnel` devolvia **500**
    (`(row.avg… ?? 0).toFixed is not a function`) e `GET /reports/table-metrics`
    devolvia `"NaN"` em tempo médio e taxa de ocupação. Causa comum: o driver do
    Postgres entrega `AVG`/`numeric` como **string**, e a anotação `sql<number>`
    do Drizzle não converte nada em runtime — `?? 0` não protege porque a string
    não é nula, e somar string dentro do `reduce` concatena. Extraído
    `reports/shared/numeric.util.ts` (`toNumber` / `toFixedNumber`) e aplicado
    nos dois use cases.
  - *Verificação:* curl — funil voltou a 200 e identifica o gargalo; métricas de
    mesa agora com `averageTimeAtTableMinutes: "30.1"` e ocupação numérica.
    Browser: a página, que renderizava só os títulos das seções, passou a exibir
    as quatro seções completas. `npx tsc --noEmit` na API manteve a baseline de
    11 erros pré-existentes.
  - *Segue bloqueada* para o restante: sem o Pasted #8 não dá para saber quais
    ajustes visuais o usuário pediu.
- ✅ **T8.5** (UX-FIS-02) Geração/persistência de PDF (DANFE/cupom) das notas
  fiscais. 🔗 T7.3 (reusa storage).
  - Decisão: gerar DANFE sob demanda a partir do `xmlAutorizado` (sem persistir
    buffers, sem alterar o provider package).
  - Feito: `GenerateFiscalPdfUseCase` reconstrói parâmetros fiscais do DB e
    chama `buildCupomPdf` do `@adatechnology/fiscal-provider`; `ResponseHelper`
    estendido com `binary()` para resposta binária; endpoint `GET
    /fiscal-documents/:id/pdf` retorna PDF; botão no frontend ativo quando
    documento tem `xmlAutorizado`.

## Fase 9 — Relatórios analíticos (pós ficha técnica)
> 🤖 Modelo: `sonnet` (queries analíticas têm aceite verificável contra o seed)

- ✅ **T9.1** (UX-RPT-03) Análise de tempos do funil por etapa via
  `order_status_logs` + identificação de gargalo.
  - Feito: `GetFunnelAnalysisUseCase` com médias por etapa agrupadas por tipo
    de pedido; destaque do gargalo em vermelho; endpoint `/reports/funnel`.
- ✅ **T9.2** (UX-RPT-05) Métricas de mesa: permanência média e ticket médio
  por cliente/comanda/mesa. 🔗 T3.4.
  - Feito: `GetTableMetricsUseCase` com tempo médio, ticket por comanda/mesa,
    taxa de ocupação; endpoint `/reports/table-metrics`; cards + tabela no
    ReportsPage.
- ✅ **T9.3** (UX-RPT-01/02) Ingredientes mais utilizados + ranking de pratos
  por margem/giro (sugestões por economia). 🔗 T6.10, T6.11.
  - Feito: `GetIngredientsRankingUseCase` + `GetProductProfitUseCase`; top 10
    ingredientes e pratos por lucro; cards Melhor Margem/Mais Vendido/Combo;
    endpoints `/reports/ingredients-ranking` e `/reports/product-profit`.
- ✅ **T9.4** (UX-RPT-04) Tempo real × tempo cadastrado por prato. 🔗 T6.10, T9.1.
  - Feito: `GetPreparationTimeComparisonUseCase`; compara `preparation_time_minutes`
    com tempo real via order_status_logs; destaque vermelho para produtos
    estourando; endpoint `/reports/preparation-time-comparison`.

## Fase 10 — Financeiro (módulo novo)
> 🤖 Modelo: `sonnet` (T10.3 parecer financeiro é 🧠 — validar fórmulas/modelo com `opus` antes)

- ✅ **T10.1** (UX-FIN-01) Contas mensais recorrentes: migration + CRUD + UI
  (vencimento, recorrência, pago/pendente).
  - Feito: migration 0023; schema `monthly-accounts`; `MonthlyAccountController`
    com 6 handlers (CRUD + pay/unpay); `FinancePage.tsx` com tabs (Contas Fixas/
    Gastos/Parecer), navegação mensal, cards pending/paid, ações inline.
- ✅ **T10.2** (UX-FIN-02) Gastos avulsos com categoria e comprovante
  (storage). 🔗 T7.3 (reusa storage).
  - Feito: migration 0024; schema `expenses`; `ExpenseController` CRUD + upload
    receipt; aba "Gastos Avulsos" no FinancePage com categorias, valores, upload.
- ✅ **T10.3** (UX-FIN-03) Painel "parecer financeiro": receita × custos,
  margem, ponto de equilíbrio, evolução mensal. 🔗 T10.1, T10.2, T6.11.
  - Feito: `GET /finance/overview` com receita, custos, margem %, ponto de
    equilíbrio, evolução 6 meses; aba "Parecer" com cards, status (Saudável/
    Atenção/Crítico), gráfico de barras mensal.
- ✅ **T10.4** (UX-FIN-04) Alertas de contas a vencer (job diário BullMQ).
  🔗 T10.1.
  - Feito: worker `AccountDueAlerter` com job diário 9am; fila BullMQ
    `finance-due-alerts`; badge "N contas a vencer" + highlight amarelo nas
    linhas próximas do vencimento no FinancePage.

## Fase 11 — Integrações e fundação de dados
> 🤖 Modelo: T11.1/T11.3/T11.4 🧠 `opus`/`fable` (spike, contrato de eventos, gap analysis); T11.2 `sonnet`

- ✅ **T11.1** (UX-INT-01) Spike iFood: estudar API oficial de parceiros,
  requisitos de credenciamento e sandbox; documentar em `design.md`.
  - Feito: `ifood-spike.md` com endpoints, OAuth2, credenciamento, arquitetura
    proposta, esforço estimado (7.5 dias), riscos e mitigações.
- ✅ **T11.2** (UX-INT-01) Implementar `IfoodProvider` + importação de pedidos
  (aceitar/rejeitar/status) no canal `ifood` existente. 🔗 T11.1, T2.3.
  - Feito: `IfoodProvider` com OAuth2 client_credentials, polling de eventos,
    fetch de pedidos, accept/reject/status; `IfoodPollingWorker` (BullMQ,
    repeatable 60s) que cria ordens internas via `CreateOrderUseCase` com
    mapeamento de cliente/produto; endpoints `POST /orders/:id/ifood/accept`
    e `/reject`; feature flag `IFOOD_ENABLED`.
- ✅ **T11.3** (UX-DAT-01) Contrato de eventos de negócio (append-only) para
  datalake futuro — documentar + implementar emissão nos fluxos core.
  - Feito: `event-contract.md` com envelope padrão, 24 tipos de evento em 8
    domínios, pontos de emissão atuais (WebSocket + audit_logs), 3 opções de
    consumo (CDC/Redis/S3) com recomendação faseada.
- ✅ **T11.4** (UX-GAP-01) Gap analysis do produto vs referências do segmento;
  entregar adendo priorizado no spec.md para validação do usuário.
  - Feito: `gap-analysis-product.md` com 10 features faltantes (KDS, fidelidade,
    NPS, QR menu, rotas, gorjeta, multi-estab, TEF, offline PWA, forecasting),
    benchmark com 5 sistemas, roadmap Q1-Q3 2026.

---

## Ordem recomendada de execução

`Fase 0 → 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11`

Racional: bugs primeiro (valor imediato), design system antes das telas novas
(evita retrabalho), pedidos é o core do negócio, produtos/ficha técnica antes
de relatórios analíticos e financeiro (que dependem do custeio), conversas em
paralelo possível (repo externo `adatechnology-packages`), integrações e
datalake por último (dependem do core estável).

## Correções transversais (fora de fase)

- ✅ **TX.1** Sessão expirada deixava a tela vazia em silêncio.
  - *Sintoma:* com o access token vencido (15 min), qualquer tela renderizava o
    estado vazio — o catálogo mostrava "Todos 0" e "Nenhum produto neste
    catálogo", como se o cadastro tivesse sumido. Descoberto durante a auditoria
    de relatórios: as requisições voltavam 401 e ninguém tratava.
  - *Causa:* `lib/api.ts` só lançava `ApiError`; o `refresh()` do `authStore`
    existia mas nunca era chamado fora do boot. O `AuthGuard` já cobria o reload
    (o `accessToken` não é persistido pelo `partialize`), mas não o token que
    vence com a aba aberta.
  - *Implementação:* `configureAuthBridge` injeta o store no cliente HTTP em
    runtime (evita ciclo de import, já que o store importa o `api`). Em 401 fora
    de `/auth/*`, renova e repete a requisição uma vez; se a renovação falhar,
    limpa a sessão e o `AuthGuard` leva ao login. O refresh é compartilhado numa
    promise única — sem isso cada query da tela dispararia o seu, e o refresh
    token rotativo invalidaria os demais.
  - *Verificação:* browser — com access token inválido o catálogo carregou os 5
    produtos após um único `POST /auth/refresh` (200); com refresh token também
    inválido, a aplicação foi para `/login`. `npx tsc --noEmit` na baseline de 5.

- ✅ **TX.2** Relatórios exibiam número honesto com leitura enganosa.
  - *Sintoma:* mesas sem comanda fechada no período apareciam como "0 min" e
    "R$ 0,00" de ticket — indistinguível de mesa com ticket realmente zerado.
    Mesa 7 e Mesa 9 exibiam receita (R$ 99,70 / R$ 155,40) com "0 comandas",
    porque a coluna conta só as comandas *fechadas no período* enquanto a
    receita soma os pedidos da mesa. Nos rankings de lucro, prato sem ficha
    técnica (`costPrice = 0`) rendia "margem 100%" e lucro igual à receita.
  - *Causa:* nenhum erro de cálculo — a apresentação é que não distinguia
    "ausência de base de cálculo" de "valor zero".
  - *Implementação:* `ReportsPage.tsx` ganhou `NO_DATA` (`—`),
    `NO_COST_REGISTERED` (`sem custo`), `formatPerComanda()` e `hasCost()`.
    Tempo médio e ticket/comanda mostram `—` quando `comandaCount === 0`; o
    cabeçalho virou "Comandas fechadas"; custo, margem e lucro total mostram
    `sem custo` em âmbar e `—` quando não há ficha técnica — nas duas tabelas e
    também nos cards de resumo (Melhor Margem / Melhor Combo). Um aviso âmbar
    com `AlertTriangle` explica que o número só faz sentido após cadastrar a
    ficha técnica no catálogo.
  - *Verificação:* browser em `/reports` — Mesas 2/4/5/6/8/10 com `—`, Mesas 7 e
    9 com receita e ticket `—`, as duas tabelas de lucro com "sem custo" e `—`,
    os três cards de resumo coerentes e o banner renderizado.
    `npx tsc --noEmit` na baseline de 5.

- ✅ **TX.3** Seed tornava relatórios indemonstráveis.
  - *Sintoma:* na Análise de Funil, as nove células (3 etapas × 3 tipos)
    mostravam exatamente `60.0 min`, e o "gargalo identificado" era um empate
    arbitrário. Nos relatórios de lucro, todo prato aparecia com margem de 100%
    e disparava o aviso de ficha técnica pendente.
  - *Causa:* não era bug de cálculo. `buildLifecycleTimestamps` usava
    `daysAgo(base, 3|2|1|0)` — o offset é em horas, então cada etapa ficava
    exatamente 1h após a anterior. E `catalog.seed.ts` nunca preenchia
    `products.costPrice`, que os use cases leem como `COALESCE(..., '0')`.
  - *Implementação:* `orders.seed.ts` ganhou `STAGE_DURATION_MINUTES` por tipo
    de pedido (delivery 8/22/34, retirada 5/18/11, mesa 4/26/9) mais um jitter
    determinístico por índice, para as médias não saírem redondas nem variarem
    entre execuções; `buildLifecycleTimestamps` passou a receber objeto tipado
    (code-standart §10). `catalog.seed.ts` ganhou `costPrice` por produto, com
    margens deliberadamente diferentes para o ranking ter o que ordenar.
  - *Verificação:* seed executado contra base descartável `botdb_seedcheck`
    (schema copiado de `botdb`, derrubada ao fim — o banco de dev não foi
    tocado). Médias por tipo saíram 9.4/19.6/35.2 (delivery), 4.5/16.5/14.0
    (retirada) e 4.0/29.0/3.0 (mesa) — nove valores distintos, gargalo real em
    Delivery: Pronto → Concluído. Os 5 produtos com `cost_price` preenchido.
    `npx tsc --noEmit` na baseline de 11 da API.
  - *Pendente:* o banco de dev só reflete isso após `make db-reset` + seed —
    ação destrutiva, deixada a critério do usuário.

- ✅ **TX.4** Taxa de ocupação media contra 24h/dia.
  - *Sintoma:* "Taxa de ocupação 0.0%" em qualquer cenário.
  - *Causa:* o denominador era `totalTables * days * 24 * 60` — o salão contado
    como aberto 24h por dia, 30 dias. Mesmo lotado no horário real de
    funcionamento, a métrica não passaria de ~5%; era estruturalmente inútil.
  - *Implementação:* `GetTableMetricsUseCase` passou a ler a chave
    `operating_hours` de `settings` (`{ dailyMinutes }`), com validação de
    faixa (1..1440) e fallback documentado de 720 min (12h). O valor usado sai
    no payload como `operatingMinutesPerDay` e a tela exibe "sobre 12h de salão
    por dia" sob a porcentagem — sem isso a taxa não é interpretável.
    `settings.seed.ts` passou a semear a chave.
  - *Também:* `comandas.seed.ts` ganhou 5 comandas fechadas em mesas distintas
    (41 a 96 min) e `orders.seed.ts` os 5 pedidos de mesa correspondentes —
    comanda sem pedido pareado zeraria o ticket/comanda e faria a tela mentir
    de novo, exatamente o que o TX.2 corrigiu.
  - *Verificação:* após reset + seed, `GET /reports/table-metrics?days=30`
    devolveu `operatingMinutesPerDay: 720`, 6 comandas fechadas e tempo médio
    78.7 min (era 1 comanda e 120.0 min); a tela renderizou "0.2% · sobre 12h
    de salão por dia". Baselines de tsc mantidas (API 11, web 5).

- ✅ **TX.5** `make db-reset` deixava a API sem subir.
  - *Sintoma:* após `make db-reset`, o container `order_hub_api` morria no boot
    com `schema "meta_whatsapp" already exists`. Só aparecia no restart
    seguinte, o que mascarava a causa.
  - *Causa:* o alvo derrubava `public` e `drizzle` mas não `meta_whatsapp`. O
    journal de migrations ia junto com o `drizzle`, então o módulo
    `@adatechnology/meta-whatsapp-module` replicava do zero e esbarrava no
    schema que sobrou.
  - *Implementação:* `DROP SCHEMA IF EXISTS meta_whatsapp CASCADE` somado ao
    comando de reset no `Makefile`.
  - *Verificação:* schema derrubado à mão e container reiniciado —
    `[DB] Migrations applied` e `[API] Listening on port 3333`.

- ✅ **TX.6** Tempo de Preparo nunca comparava nada — e a query quebrava.
  - *Sintoma:* "Acurácia média 0% · 0 produtos comparados · Sem dados
    suficientes para comparar."
  - *Causa (três, empilhadas):* (1) `products.preparationTimeMinutes` nunca era
    semeado, e o use case filtra `IS NOT NULL` — retorno vazio antes de tocar no
    resto; (2) `order_status_logs` estava vazia, e é dela que sai o tempo real;
    (3) com dado presente, a query estourava
    `invalid reference to FROM-clause entry for table "order_status_logs"` — a
    subquery correlacionada entrava por `innerJoin` comum, e sem `LATERAL` o
    Postgres recusa a referência à tabela externa. Os dois primeiros mascaravam
    o terceiro: o endpoint nunca chegava a executar a query.
  - *Bug latente no mesmo arquivo:* `realDurationMinutes` vem de `AVG`, logo é
    string do driver; `real.toFixed(1)` quebraria na primeira amostra. Mesma
    classe do TX (ver `shared/numeric.util.ts`), corrigido com `toNumber`.
  - *Implementação:* query reescrita com `alias()` e auto-join entre o log
    `in_production` e o `ready` do mesmo pedido, sem subquery correlacionada.
    `catalog.seed.ts` ganhou `preparationTimeMinutes` por produto (1 a 18 min) e
    `orders.seed.ts` passou a gravar os logs de status de todo o ciclo de vida.
  - *Limite conceitual, exposto na tela:* o tempo real é por pedido, não por
    item — refrigerante que dividiu comanda carrega o tempo do prato e aparece
    com +2244%. Um aviso azul explica isso; sem ele o número parece falha de
    cozinha em vez de granularidade da medição.
  - *Verificação:* `GET /reports/preparation-time-comparison?days=30` devolveu
    os 5 produtos com amostras (3 a 7); a tela passou de "0 produtos
    comparados" para acurácia de 25.7% sobre 5. Baselines de tsc mantidas
    (API 11, web 5).

- ✅ **TX.7** Menu e permissões da API divergiam; Financeiro era inacessível.
  - *Descoberta:* varredura de rede navegando todas as rotas do menu com o
    usuário gerente — `/staff`, `/staff/roles`, `/roles`, `/finance/overview`,
    `/expenses` e `/monthly-accounts` voltavam 403.
  - *Sintoma:* mesma classe do TX.1 — erro renderizado como vazio. A tela de
    Funcionários exibia "6 cadastrados" como **"0 cadastrados"** mais o botão
    "Novo funcionário", como se o estabelecimento não tivesse ninguém.
  - *Causa 1 (a mais grave):* `finance` não constava em `ALL_RESOURCES` no
    `roles-permissions.seed.ts`, embora as rotas usem `authorize('finance')`.
    Nenhum papel recebia o recurso — **nem o admin**. A tela Financeiro estava
    inacessível para todos os usuários do sistema.
  - *Causa 2:* `constants/navigation.ts` liberava Financeiro, Funcionários e
    Cargos ao gerente, mas a API não concedia `finance` nem `users` ao papel.
  - *Implementação:* `finance` somado a `ALL_RESOURCES` (o admin passa a ter o
    recurso por construção) e `finance`/`users` em `read`+`write` concedidos ao
    gerente — apensados ao FIM do array, como o comentário do arquivo exige,
    já que o id da permissão deriva da posição.
  - *Decisão de segurança:* `/roles` exige `users:manage` e **não** foi
    concedido ao gerente — quem edita cargos pode conceder permissões a si
    mesmo. Corrigi o lado do menu: "Cargos" agora é só `ROLES.ADMIN`.
  - *Verificação:* após reset + seed, os seis endpoints voltaram 200 para o
    gerente, exceto `/roles`, que segue 403 por decisão. A tela de Funcionários
    passou a mostrar "6 cadastrados"; o Financeiro renderizou as três abas; e
    "Cargos" saiu do menu do gerente. Baselines de tsc mantidas (API 11, web 5).

- ✅ **TX.8** Qualquer 403 de query virava estado vazio silencioso na tela.
  - *Sintoma:* faltando permissão, a página não mostrava erro nenhum — só
    "0 cadastrados", igual a um cadastro realmente vazio. Foi exatamente o que
    escondeu o bug do TX.7 por tanto tempo.
  - *Causa:* nenhuma página olha o `error` da query; todas renderizam
    `data ?? []`. Tratar caso a caso deixaria a classe inteira em aberto.
  - *Implementação:* handler global no `QueryCache` (`main.tsx`) marca
    `accessDeniedStore` quando o erro é `ApiError` com status 403, e o
    `AccessDeniedBanner` renderizado no `AppLayout` avisa que a tela pode estar
    incompleta. O banner se limpa sozinho na troca de rota. No mesmo ponto, o
    `retry` padrão passou a ignorar 4xx — repetir 401/403/404 não muda o
    resultado e só atrasa a tela.
  - *Verificação:* removi temporariamente as permissões de `reports` do gerente
    no banco de dev, abri `/reports` como gerente e o banner âmbar apareceu com
    o texto esperado; ao navegar para `/orders` ele sumiu. Permissões restauradas
    com os mesmos ids e `/reports/monthly` voltou a 200. Baseline de tsc do web
    mantida (5 erros pré-existentes).

- ✅ **TX.9** 404 da API saía sem CORS e virava "Failed to fetch" no browser.
  - *Sintoma:* chamada para rota inexistente falhava no cliente como erro de
    rede, sem status. O front não conseguia distinguir "endpoint errado" de
    "API fora do ar" — e nenhum tratamento por status, inclusive o do TX.8,
    pegava o caso.
  - *Causa:* não havia rota coringa registrada. Sem match, o uWS respondia com
    seu próprio `404 File Not Found`, sem `Content-Type` e sem
    `Access-Control-Allow-Origin`; o browser então bloqueia a leitura da
    resposta e reporta falha de rede.
  - *Implementação:* `app.any('/*')` registrado por último em `server.ts`,
    devolvendo o mesmo envelope de erro das demais rotas
    (`{ error: 'not_found', message }`) com CORS e headers de segurança. Os
    headers foram extraídos para `writeCorsAndSecurityHeaders` em `router.ts`,
    que passou a ser a única fonte deles (antes repetidos em `json`/`error` e
    em `binary`).
  - *Verificação:* rota inexistente responde 404 com
    `Access-Control-Allow-Origin` e corpo JSON; no browser o `fetch` passou a
    ler `404` onde antes lia `ERR Failed to fetch`. A rota coringa não
    sequestrou nada: preflight `OPTIONS` segue 204 com os headers de CORS, e
    `/health`, `/tables`, `/customers`, `/reports/monthly`, `/docs` e
    `/api/openapi.json` seguem 200 — com o 403 do atendente em
    `/reports/monthly` preservado. Baseline de tsc da API mantida (11 erros).

- ✅ **TX.10** Métricas de mesa contavam receita e comandas de populações diferentes.
  - *Sintoma:* mesa aparecia com "0 comandas fechadas" e receita de R$ 31,00 ao
    mesmo tempo — dois números que se contradizem na mesma linha. E o ticket
    médio da casa saía inflado (R$ 114,85), porque dividia a receita do salão
    inteiro só pelas comandas fechadas.
  - *Causa:* a receita vinha de todos os pedidos de mesa do período, sem
    nenhum vínculo com as comandas contadas. Não existe relação pedido↔comanda
    no schema, então a atribuição precisa ser por mesa dentro da janela da
    comanda.
  - *Implementação:* em `GetTableMetricsUseCase`, a receita passou a sair de um
    join `comandas × orders` pela mesa e pela janela `openedAt..closedAt`,
    restrito às comandas fechadas já contadas. Numerador e denominador agora
    falam da mesma população.
  - *Correção de seed associada:* as comandas fechadas abriam 4h antes do dia
    de referência e os pedidos pareados chegavam 3h antes — folga de 1h contra
    durações de 41 a 96 min, então duas das cinco comandas ficavam sem receita
    dentro da janela. O instante de recebimento virou a constante compartilhada
    `ORDER_RECEIVED_HOURS_AGO`, e `comandas.seed` passa a abrir a comanda 25 min
    antes do pedido pareado.
  - *Verificação:* seed rodado num banco descartável (`botdb_seedcheck`,
    derrubado em seguida) — as seis comandas fechadas têm receita dentro da
    janela. No banco de dev, as comandas existentes foram realinhadas em lugar
    de um reset: nenhuma mesa com receita e zero comandas, ticket por comanda
    caiu de R$ 114,85 para R$ 67,17 (a média real das seis) e cada linha fecha
    com o próprio ticket. Baseline de tsc da API mantida (11 erros).
  - *Pendente, não é bug:* a taxa de ocupação segue em 0,2% porque o seed
    concentra 6 comandas em 30 dias de janela. A conta está certa; o que falta
    é densidade de dados.

- ✅ **TX.11** Taxa de ocupação indemonstrável por falta de movimento no seed.
  - *Sintoma:* ocupação em 0,2% e tempo médio calculado sobre seis amostras.
    A conta estava certa desde o TX.4; faltava movimento no banco de demonstração.
  - *Implementação:* novo `helpers/service-history.ts` gera trinta dias de
    salão — vinte sessões por dia, distribuídas na janela de operação, cada uma
    com duração determinística entre 45 e 110 min. A comanda fechada e o pedido
    de mesa nascem da **mesma** lista de sessões, então o pareamento que o TX.10
    consertou passa a valer por construção, não por dois blueprints escritos à
    mão em arquivos diferentes.
  - *Decisão:* os pedidos históricos entram no banco mas ficam fora do retorno
    de `seedOrders`. Caixa e fiscal montam seus registros a partir dele, e um
    turno de caixa não pode carregar trinta dias de venda — anexar tudo ao
    caixa fechado faria o valor declarado contradizer os movimentos, que é
    exatamente a classe de erro que o TX.10 corrigiu.
  - *Verificação:* seed rodado em banco descartável antes de tocar no de dev —
    606 comandas fechadas, **nenhuma** sem receita dentro da janela, nenhuma
    fechando no futuro, e os movimentos de caixa seguem em 15 (o histórico
    ficou fora, como projetado). Aplicado ao banco de dev: ocupação passou de
    0,2% para 21,7%, tempo médio 77,5 min sobre 606 comandas, ticket por
    comanda R$ 73,69 e as dez mesas com linha própria. Os demais relatórios
    seguem 200 sem `NaN`; o tempo de preparo passou a comparar cinco produtos
    com ~260 amostras cada. Baseline de tsc da API mantida (11 erros).

- [x] **TX.12** — Tempo de preparo medido por item, não pelo pedido
  - *Sintoma:* no relatório de tempo de preparo, um refrigerante com 1 minuto
    cadastrado aparecia com 31,8 minutos "reais". Todo item de um mesmo pedido
    recebia a mesma duração, então a coluna de diferença apontava a bebida como
    o pior gargalo da casa.
  - *Causa:* a medição vinha do auto-join de `order_status_logs` — `ready` menos
    `in_production` do **pedido**. A duração do prato mais demorado era atribuída
    a cada item que saiu junto. O TX.6 documentou a distorção como ressalva na
    tela porque o schema não tinha onde guardar a medição por item.
  - *Implementação:* `order_items` ganhou `production_started_at` e `ready_at`
    (migration `0033`, aditiva, colunas nulas). `UpdateOrderStatusUseCase` passa
    a carimbar os itens ainda não marcados ao avançar o pedido, para que nenhum
    item fique sem medição. Novo `MarkOrderItemReadyUseCase` e rota
    `PATCH /kitchen/orders/:id/items/:itemId/ready` (`kitchen:write`) marcam item
    a item; quando o último item fica pronto o pedido avança sozinho para
    `ready`, passando por `in_production` se ainda estava em `received`. O
    `GetPreparationTimeComparisonUseCase` foi reescrito sobre os carimbos do
    item, dispensando o auto-join. Na cozinha cada item ganhou botão "Pronto"
    (riscado quando concluído) e o botão do cartão virou "Tudo pronto". O seed
    carimba cada item com o tempo cadastrado do produto mais um desvio
    determinístico, e os itens já existentes foram preenchidos por UPDATE a
    partir do `production_started_at` do pedido.
  - *Verificação:* migration aplicada no boot (colunas presentes em
    `\d order_items`), 1540 itens preenchidos. Relatório de 30 dias: refrigerante
    1 min cadastrado × **2,5 min** reais (era 31,8), pudim 3 × 4,1, suco 4 × 5,1,
    prato feito 18 × 18,9, marmita 14 × 14,9 — acurácia geral 64,4% sobre ~300
    amostras por produto. Rota por item testada ao vivo: primeiro item marcado
    devolveu `orderReady: false` com o pedido ainda em `received`; o segundo
    devolveu `true` e o pedido foi para `ready` com ambos os carimbos. Estado de
    teste revertido ao do seed. Baselines de tsc mantidas (API 11, web 5).

- [x] **TX.13** — Ranking de ingredientes filtrava um tipo de movimento que não existe
  - *Sintoma:* "Ingredientes mais usados" vinha sempre vazio, mesmo com estoque
    baixando a cada pedido. A tela dizia que não houve consumo enquanto o saldo
    dos lotes caía.
  - *Causa:* `GetIngredientsRankingUseCase` filtrava
    `movement_type = 'consumption'`. Nenhum ponto do sistema escreve esse valor —
    os tipos gravados são `in` (entrada de lote), `out` (baixa por pedido),
    `adjustment` e `loss`. Como `movement_type` é VARCHAR e não ENUM, o valor
    inexistente não falha: apenas devolve zero linha, para sempre.
  - *Implementação:* filtro passa a usar `out`, extraído para a constante
    `CONSUMPTION_MOVEMENT_TYPE` com a razão registrada ao lado. Junto, novo
    `stock-consumption.seed.ts`: executa o próprio `DeductStockForOrderUseCase`
    (idempotente por pedido) sobre os pedidos concluídos dos últimos três dias,
    depois de repor os lotes com folga sobre o consumo da janela, e alinha a data
    do movimento ao início do preparo do pedido.
  - *Decisão:* a janela do consumo é de três dias, não dos trinta do histórico do
    salão. Consumo é lastreado em lote — cobrir trinta dias exigiria simular
    trinta dias de reposição, e o seed passaria a comprar um caminhão de arroz
    para popular uma tela. O ranking de 30 dias mostra o que existe, sem inventar
    baixa sem lastro.
  - *Verificação:* seed rodado em `botdb_seedcheck` antes do dev — 139 baixas,
    saldo de cada ingrediente batendo exatamente com a soma dos lotes, nenhum
    negativo, movimentos datados dentro da janela. Aplicado ao dev: ranking
    devolve os quatro ingredientes (laranja 19,50 · frango 14,20 · arroz 10,65 ·
    feijão 7,10) com contagens coerentes com as receitas. Resíduo de estoque do
    teste do TX.12 revertido antes (lotes e saldo recompostos). Baseline de tsc
    da API mantida (11 erros).

- [x] **TX.14** — Taxa de entrega respondia 500: coluna de tenant só existia no schema
  - *Sintoma:* `GET /delivery-fee/rules` devolvia
    `500 column "establishment_id" does not exist`. A tela de configuração de
    taxa de entrega não abria — nem regras, nem zonas.
  - *Causa:* `delivery_fee_rules` e `delivery_fee_zones` vieram do `schema.sql`
    legado do bot, anterior ao Drizzle e sem noção de tenant. O schema TypeScript
    declara `establishmentId` nas duas e o controller já filtrava por ele, mas
    nenhuma migration criou a coluna. O erro só aparecia em runtime porque o
    `tsc` valida o schema declarado, não a tabela real.
  - *Implementação:* migration `0034`, aditiva: coluna `establishment_id` com FK
    para `establishments` nas duas tabelas, índice por tenant, e backfill que só
    atribui dono quando existe **exatamente um** estabelecimento — com mais de
    um, atribuir seria chute, e a decisão é humana.
  - *Varredura:* comparei todas as tabelas do schema Drizzle com o
    `information_schema` do banco de dev à procura de outras divergências como
    esta. Só essas duas colunas faltavam; nenhuma tabela ausente.
  - *Verificação:* migration aplicada no boot; regra e zona existentes ficaram
    com o estabelecimento do seed, nenhuma zona órfã. `GET /delivery-fee/rules` e
    `GET /delivery-fee/rules/1/zones` voltaram a 200 com o `establishmentId`
    correto no corpo. Baseline de tsc da API mantida (11 erros).

## Riscos

- **R1**: pacote compartilhado de conversas exige alinhamento de versões React
  entre os dois projetos — travar peer deps.
- **R2**: estoque por lote muda o modelo de baixa de produto — precisa migration
  cuidadosa e não pode quebrar pedidos existentes (lote "legado" default).
- **R3**: `tsx` não type-checa — manter `tsc --noEmit` como gate em toda task
  (já pegou 7 bugs reais de `response.status()`).
