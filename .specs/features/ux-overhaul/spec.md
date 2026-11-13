# UX Overhaul — Especificação (Revisão completa das telas do Order Hub)

> Origem: feedback de uso real (2026-07-16) após seed completo do banco.
> Convenção: cada requisito tem ID `UX-<módulo>-<nº>` para rastreio em `tasks.md`.

## ⚠️ Inputs pendentes do usuário

Os trechos colados na conversa original **não chegaram** ao contexto (placeholders
`[Pasted text #4..#8]`). Preencher antes de executar as tasks marcadas com 🔶:

| Ref | Contexto onde foi citado | Status |
|---|---|---|
| Pasted #4 | Pedidos — strings em inglês | ✅ Recebido — ver UX-DSN-03 |
| Pasted #5 | Clientes + cardápio pobre | ✅ Recebido — ver UX-CST-04, UX-PRD-08..11 |
| Pasted #6 | Categorias | 🔶 Pendente |
| Pasted #7 | Categorias (continuação) | 🔶 Pendente |
| Pasted #8 | Relatórios | ⚠️ Superado parcialmente — requisitos verbais em UX-RPT |

## Problem Statement

O Order Hub está funcional ponta a ponta, mas o uso real revelou lacunas de UX
(selects crus, falta de ícones, dados ocultos que deveriam existir), bugs
(busca/PDF/XML da tela fiscal), fluxos incompletos (criação de pedido sem
pagamento/entrega/cliente) e módulos inteiros ausentes (cargos, estoque/lotes,
layout de salão). Além disso, a tela de Conversas do projeto irmão
`financiamento-imobiliario-bot` evoluiu muito além da nossa (1.550 vs 651 linhas:
visualização de documentos, notificações, uploads via worker, player de áudio,
emoji picker, dark mode) e precisamos de paridade **sem duplicar código**.

---

## 1. Design System geral (UX-DSN)

- **UX-DSN-01** — Aplicar a skill de design nas telas existentes, priorizando
  **selects** (hoje nativos/crus): substituir por componente de select estilizado
  do design system (busca interna, teclado, estados de foco/erro, multi-select
  onde couber). Criar `apps/web/src/components/ui/Select.tsx` único e migrar
  todas as telas.
- **UX-DSN-02** — Iconografia consistente (lucide-react já é padrão nos projetos
  Ada): adicionar ícones em ações, cabeçalhos de card, itens de menu e badges de
  status onde faltam. Prioridade: tela fiscal (citada explicitamente).
- **UX-DSN-03** — Auditoria de idioma: varrer todas as telas por strings em
  inglês visíveis ao usuário e traduzir para PT-BR. Casos confirmados (Pasted #4,
  tela de Pedidos): tipo do pedido cru em inglês (`table`, `pickup`, `delivery`
  → Mesa, Retirada, Entrega), canal `manual` sem label PT, e **badge colado**
  ("Recebidomanual" — falta separador/espaçamento entre status e canal). Enums
  do banco (`received`, `pending`...) nunca aparecem crus — sempre via mapa de
  labels PT-BR.
- **UX-DSN-05** — **Animações e micro-interações**: transições de entrada/saída
  de modais e painéis, feedback de hover/press, skeleton loaders, animação de
  mudança de status (badge). Implementar com CSS transitions/`framer-motion`
  (avaliar bundle), sempre respeitando `prefers-reduced-motion`.
- **UX-DSN-04** — Tokens: qualquer tela tocada nesta feature passa a consumir
  `COLORS/SPACING/TYPOGRAPHY/RADIUS/SHADOW` do tema (regra `web.md §9`), sem
  hexadecimais/px mágicos novos.

## 2. Entregas (UX-DLV)

- **UX-DLV-01** — A listagem de entregas deve exibir **nome (ou registro) do
  entregador** em cada card/linha. Backend: o `GET /deliveries` deve fazer join
  com `users` e devolver `deliverer: { id, name }` (hoje só devolve
  `delivererId`).
- **UX-DLV-02** — Filtro por entregador na listagem (select estilizado UX-DSN-01).

## 3. Caixa (UX-CSH)

- **UX-CSH-01** — Valores monetários do caixa **ocultos por padrão**
  (`R$ ••••••`), com botão olho (👁) para revelar/ocultar. Estado persiste
  durante a sessão (não entre sessões). Aplicar em: saldo atual, totais de
  abertura/fechamento, listagem de movimentos.

## 4. Notas Fiscais (UX-FIS)

- **UX-FIS-01 (bug)** — ✅ Corrigido. Causa raiz: filtro só buscava por
  `chaveAcesso`/`numeroDocumento`, ambos `null` até a nota ser autorizada.
  Ampliado para também buscar por `orderId` (parcial), que está sempre presente.
- **UX-FIS-02 (bug → re-escopado)** — Botão **PDF** não é um bug de wiring:
  nenhum provider do pacote `@adatechnology/fiscal-provider` (SAT/NFC-e/NF-e/
  CT-e/NFS-e) jamais preenche `danfePdfUrl` — o buffer do DANFE/cupom é gerado
  e descartado na emissão, nunca persistido. Além disso o `ResponseHelper`
  deste projeto (`apps/api/src/infra/http/router.ts`) só sabe responder JSON —
  não há suporte a streaming binário/`Content-Type` customizado. Resolver isso
  direito exige decisão de arquitetura (persistir PDF via storage provider —
  mesma infra de T7.3/T8.1 — ou gerar DANFE sob demanda a partir do XML já
  autorizado) e vai além de "quick win". Rescopado para **T6.9-adjacente /
  Fase 7-8** (ver tasks.md). Enquanto isso, o botão indica claramente
  "Geração de PDF ainda não disponível" via tooltip em vez de aparentar bug.
- **UX-FIS-03 (bug)** — ✅ Corrigido. Causa raiz: `downloadXml` no backend
  retorna `{ xml: ... }` como JSON, mas o frontend baixava o `blob()` bruto da
  resposta HTTP (que é o JSON inteiro, não o XML). Corrigido no frontend:
  parseia o JSON e constrói o `Blob` a partir de `data.xml` com
  `type: 'application/xml'`.
- **UX-FIS-04** — Redesign da tela com ícones por status (autorizada, rejeitada,
  pendente, cancelada), ações com ícone + tooltip, e padrão data-table
  (`web.md §7`: ordenação, filtros multi, estado na URL).

## 5. Pedidos (UX-ORD)

### Criação de pedido (CreateOrderModal → provavelmente vira página/fluxo)
- **UX-ORD-01** — Campo de **data/hora** do pedido (default: agora; editável
  para pedidos agendados).
- **UX-ORD-02** — Bloco de **pagamento**: tipo de pagamento (usar tabela
  `payment_types` já seedada no schema do bot), **troco para** (se dinheiro),
  **divisão de conta** (quantas partes / por pessoa), pagamento **misto**
  (mais de um tipo).
- **UX-ORD-03** — Bloco de **entrega**: tipo (delivery/retirada/mesa — tabela
  `order_types`), endereço quando delivery, taxa calculada.
- **UX-ORD-04** — Bloco de **cliente**: nome, e **documento (CPF/CNPJ)** quando
  pedir nota fiscal (obrigatório se `fiscal_enabled` e cliente quer CPF na nota).
- **UX-ORD-05** — Pedido de **mesa** deve pedir **comanda** (e permitir criar
  comanda nova na hora): uma mesa pode ter N pessoas com N comandas
  (`comandas` já existe no schema). Vincular pedido → comanda, não só mesa.

### Listagem e detalhe
- **UX-ORD-06** — Melhorar listagem: mostrar especificações resumidas (itens,
  tipo, pagamento, cliente) sem precisar abrir.
- **UX-ORD-07** — **Clique no pedido abre painel/página de detalhe** com todas
  as informações (itens, timeline de status via `order_status_logs`, pagamento,
  entrega, nota fiscal vinculada).
- **UX-ORD-08** — **Busca + filtros**: busca textual (nº pedido, cliente),
  filtro por status/tipo/canal (multi-select), **calendário** (range de datas)
  e **busca por cliente**. Estado na URL (`web.md §7`).

## 6. Conversas — paridade com financiamento-imobiliario-bot (UX-CNV)

Referência: `financiamento-imobiliario-bot/apps/web` (ConversationsPage 1.550
linhas + componentes: `MessageBubble` 15.8K, `AudioPlayer`, `SimpleEmojiPicker`,
`WhatsAppMessageEditor`, `DateDivider`, `Avatar`, `Toast`; hooks `useGlobalSse`,
`useWaitingNotifications`, `useDarkMode`; API: módulo `uploads`, storage S3,
fila BullMQ para processamento de mídia).

- **UX-CNV-01** — Varredura minuciosa de gap: comparar feature a feature a tela
  de conversas dos dois projetos e produzir checklist do que falta aqui
  (visualização de documentos/imagens/áudio, upload com worker, notificações de
  espera, indicadores, editor rico de mensagem).
- **UX-CNV-02** — **Estratégia anti-duplicação (decisão arquitetural)**:
  - ❌ Web Component (Lit): perderíamos o ecossistema React dos dois lados;
    overhead de bridge para stores/SSE.
  - ❌ Micro-frontend (Module Federation): projetos com deploys/hosts distintos
    (Railway), acoplamento de infra alto para um único módulo.
  - ✅ **Recomendado: pacote React compartilhado** no repo irmão já existente
    `adatechnology-packages` (mesmo mecanismo `file:` já usado por
    `@adatechnology/fiscal-provider` e `whatsapp-provider`):
    `@adatechnology/conversations-ui` — componentes de conversa parametrizados
    (endpoints, tema, feature flags via props/provider), sem lógica de negócio
    embutida. Cada app injeta seu client HTTP/WS.
  - Migrar os dois projetos para consumir o pacote (primeiro sakura, depois
    financiamento) — mesmo padrão de versionamento dos providers.
- **UX-CNV-03** — Uploads de mídia por **worker** (BullMQ sobre o Redis
  existente, regra `queue-bullmq.md`) + storage (S3Provider como no
  financiamento; local em dev).

## 7. Mesas & Comandas (UX-TBL)

- **UX-TBL-01** — **Layout visual do salão**: interface drag-and-drop para
  posicionar mesas refletindo o negócio real (sem exigir desenho: grid com
  posições livres). Persistir `position_x/y` na tabela `tables`.
- **UX-TBL-02** — Exibir **capacidade (nº cadeiras)** e status por cor no mapa.
- **UX-TBL-03** — **Junção de mesas** (mesa 3 + mesa 4 = grupo): modelagem de
  agrupamento temporário com desagrupar.
- **UX-TBL-04** — **Auditar** todas essas ações (mover, juntar, separar) em
  `audit_logs`.
- **UX-TBL-05** — Tela de mesa mostra as **comandas abertas** da mesa (N
  comandas por mesa) e permite abrir nova comanda — integra com UX-ORD-05.

## 8. Clientes (UX-CST)

- **UX-CST-01** — **Rating de cliente** (1–5 estrelas, editável pelo staff,
  exibido na listagem e no detalhe). Nova coluna `customers.rating`.
- **UX-CST-02** — **Unificar WhatsApp/telefone em um campo único** com máscara
  de formatação BR `+55 (11) 98888-7777` (persistência continua E.164).
- **UX-CST-03** — **Endereço opcional** no cadastro com: busca por **CEP**
  (ViaCEP), **auto-complete** de logradouro e **mapa** (pin de confirmação —
  Leaflet + Nominatim, sem chave paga). Tabela `addresses` já existe.
- **UX-CST-04** — (Pasted #5) Endereços do cliente como cidadão de primeira
  classe: múltiplos endereços por cliente com apelido (casa, trabalho),
  endereço padrão, e reuso direto no fluxo de pedido delivery (UX-ORD-03) —
  facilita entregas recorrentes.

## 9. Cargos & Permissões (UX-ROL)

- **UX-ROL-01** — **Página de cadastro de cargos** (roles) — hoje não há UI:
  criar/editar/desativar cargo, com nome e descrição.
  (Referência pronta: `RolesPage.tsx` do financiamento, 15.1K.)
- **UX-ROL-02** — Matriz de **permissões por cargo**: o que cada cargo pode
  fazer no app (tabelas `roles`/`permissions` já existem no schema + seed).
- **UX-ROL-03** — Tela de equipe (Staff) passa a usar os cargos cadastrados no
  select de cargo.

## 10. Categorias (UX-CAT)

- **UX-CAT-01** — 🔶 Pasted #6 e #7: problemas observados a detalhar.
  (Provável: labels/UX da listagem, campos fiscais NCM/CFOP/CST expostos cru.)

## 11. Produtos & Estoque (UX-PRD)

- **UX-PRD-01** — **Preço de custo + preço de venda**, com atalhos de margem
  (tabela de porcentagens rápidas: +30%, +50%, +100%, custom) calculando o
  preço de venda a partir do custo.
- **UX-PRD-02** — **Auto-complete de cadastro por API pública de produtos**:
  busca por nome/EAN. Candidatas (avaliar em design.md): Open Food Facts
  (gratuita, alimentos) e Cosmos/Bluesoft (EAN BR, tem free tier). Preenche
  nome, marca, imagem, código de barras.
- **UX-PRD-03** — **Código de barras** (EAN) no produto + leitura por câmera
  no PWA (BarcodeDetector API com fallback).
- **UX-PRD-04** — **Estoque por lote**: entrada de compra cria lote com
  quantidade e **data de validade**; baixa por venda (FIFO); listagem de lotes.
- **UX-PRD-05** — **Alertas de vencimento**: destaque na listagem + notificação
  (produtos vencendo em X dias — X configurável).
- **UX-PRD-06** — **Seção/localização física** do produto (onde fica: corredor,
  prateleira, freezer...) — cadastro de seções + vínculo no produto.
- **UX-PRD-07** — **Unidade de medida**: unidade, granel, kg, litro... afeta
  input de quantidade no pedido (decimal para kg/granel) e exibição de preço
  (R$/kg vs R$/un).
- **UX-PRD-08** — **Ficha técnica do prato** (Pasted #5 — hoje o cadastro tem
  só nome/descrição/preço/ordem/categoria): **tempo de preparo** cadastrado,
  **modo de preparo** (texto/passos) e **ingredientes com quantidades**.
- **UX-PRD-09** — **Cadastro de ingredientes** (insumos): nome, unidade de
  medida, custo unitário, estoque próprio (integra com lotes UX-PRD-04).
  Ingrediente ≠ produto vendável — modelagem separada (`ingredients`,
  `product_ingredients`).
- **UX-PRD-10** — **Custeio por receita**: custo do prato calculado da soma dos
  ingredientes (qtde × custo do insumo), exibindo custo teórico vs preço de
  venda vs margem real. Alimenta as margens rápidas de UX-PRD-01.
- **UX-PRD-11** — Benchmark: basear a modelagem de estoque/ficha técnica em
  sistemas maduros de gestão de restaurante (ex.: modelos de recipe costing +
  inventory por lote/insumo) — documentar decisões em `design.md` antes das
  migrations, pois é a maior mudança de modelo de dados da feature.

## 12. Relatórios & Analytics (UX-RPT)

- **UX-RPT-01** — **Ingredientes mais utilizados** (via ficha técnica
  UX-PRD-08/09: consumo derivado dos pedidos). 🔗 depende da Fase de produtos.
- **UX-RPT-02** — **Sugestões de pratos por economia**: ranking de pratos por
  margem real (custo de receita × preço) e por giro — "o que vale a pena
  promover".
- **UX-RPT-03** — **Análise de tempos do funil**: tempo médio por etapa
  (pedido → preparo → pronto → entrega/mesa) a partir de `order_status_logs`;
  identificar **qual etapa é o gargalo**.
- **UX-RPT-04** — **Tempo real × tempo cadastrado**: comparar tempo efetivo de
  preparo com o tempo da ficha técnica do prato (UX-PRD-08); destacar pratos
  estourando o previsto.
- **UX-RPT-05** — **Métricas de mesa**: tempo médio de permanência do cliente
  na mesa (abertura→fechamento de comanda) e **gasto médio por
  cliente/comanda/mesa** (ticket médio).
- **UX-RPT-06** — 🔶 Pasted #8 (estado atual da tela): problemas visuais
  observados a confirmar.

## 13. Financeiro — contas, gastos e parecer (UX-FIN) — módulo novo

- **UX-FIN-01** — **Contas mensais** (fixas/recorrentes): aluguel, energia,
  água, internet, salários... cadastro com vencimento, valor, recorrência e
  status pago/pendente.
- **UX-FIN-02** — **Gastos e custos avulsos**: lançamento de despesas
  (categoria, valor, data, fornecedor, anexo de comprovante via storage).
- **UX-FIN-03** — **Parecer financeiro**: painel consolidando receita (pedidos
  + caixa) × custos (insumos via ficha técnica + contas + gastos) → margem do
  negócio, ponto de equilíbrio, evolução mensal. É o "parecer ao usuário".
- **UX-FIN-04** — Alertas de contas a vencer (badge + notificação).

## 14. Integrações (UX-INT)

- **UX-INT-01** — **iFood**: integração via API oficial de parceiros
  (merchant/orders/events polling ou webhook) para receber pedidos do iFood
  dentro do Order Hub — sem sair do projeto. O canal `ifood` já existe no
  enum `order_channel`. Escopo mínimo: importar pedidos + aceitar/rejeitar +
  atualizar status; catálogo sincronizado fica para fase 2. Provider
  encapsulado (`IfoodProvider`) em `packages/` se for reusado pelo bot.

## 15. Fundação de dados / Datalake futuro (UX-DAT)

- **UX-DAT-01** — Preparar (não construir) o datalake: garantir que todo evento
  de negócio relevante (pedido, status, pagamento, movimento de estoque, ação
  de mesa) seja **evento estruturado e imutável** (event log em tabela append-
  only ou stream Redis), com timestamps e IDs correlacionáveis — o datalake
  futuro consome daqui via export/CDC. Documentar contrato de eventos em
  `design.md`. Nenhuma ferramenta externa nesta fase.

## 16. Gap analysis do produto (UX-GAP)

- **UX-GAP-01** — Auditoria estruturada "o que falta para um sistema completo
  de gestão de restaurante": comparar o Order Hub com referências do segmento
  e listar furos além dos já mapeados (candidatos óbvios: impressão de comanda
  na cozinha por setor, KDS com bump, gestão de motoboys/rotas, programa de
  fidelidade, cupons/descontos, taxas de serviço/gorjeta, multi-
  estabelecimento, NPS pós-pedido pelo bot). Entregável: adendo neste spec com
  priorização, validado com o usuário antes de virar task.

## 17. Configurações (UX-SET)

- **UX-SET-01** — **Upload de logo** do estabelecimento (processado por worker
  BullMQ: resize/otimização; storage igual UX-CNV-03). Logo aparece no app,
  cupom e página pública da nota.
- **UX-SET-02** — **Raios de entrega crescentes** com taxa por faixa (as
  tabelas `delivery_fee_rules`/`delivery_fee_zones` **já existem** no schema do
  bot — criar a UI de gestão e fazer o Order Hub consumir).
- **UX-SET-03** — Campos de **WhatsApp** e **nome** do estabelecimento
  editáveis nas configurações.
- **UX-SET-04** — Auditoria do que mais falta: endereço do estabelecimento,
  horários de funcionamento, moeda/fuso, impressora padrão, tempo médio de
  preparo (usado no bot), mínimo de pedido para delivery.

---

## Não-objetivos (desta feature)

- Reescrever o fluxo do bot n8n (somente consumo de tabelas já existentes).
- App mobile (Expo) — paridade mobile fica para feature futura.
- Migrar `dev/start/test` scripts de bun→node (fora de escopo).

## Critérios de aceite globais

1. Toda tela alterada segue `web.md` (§7 data-tables, §9 tokens, §10 responsivo).
2. Sem strings de UI em inglês visíveis.
3. `npx tsc --noEmit` limpo nos arquivos tocados (tsx não type-checa em runtime).
4. Nenhuma regressão nos fluxos existentes (pedido, caixa, fiscal, conversa).
5. Ações de negócio novas (mesas, estoque) geram `audit_logs`.
