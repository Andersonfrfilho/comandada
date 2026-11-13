# CNV-SDK — Tasks

Gate obrigatório ao fim de cada task: `cd apps/web && npx tsc --noEmit`.
(O `tsx`/Vite não type-checa — já escondeu bugs neste repo.)

## Fase 1 — Camada de dados
> 🤖 Modelo: `sonnet`

- ✅ **T1.1** Adapter `ConversationsApi` em `apps/web/src/lib/conversationsSdkApi.ts`.
  Traduz rotas, envelope e vocabulário do Order Hub para o contrato do SDK
  (tabela §3.1 da spec). Omite `transcribeAudio` e `listTemplates` — o backend
  não tem as rotas.
  - Feito: `conversationsSdkApi` + `toMessagePayload` + `fetchConversationTranscriptMessages`.
- ✅ **T1.2** `SSEProvider` sobre o WebSocket existente em
  `apps/web/src/lib/conversationsSdkRealtime.ts`. Multiplexador com uma conexão
  compartilhada e contagem de referência; filtra por `whatsappNumber`.
- ✅ **T1.3** Tradução do contexto do fluxo para `ConversationContextEntry[]`
  em `apps/web/src/pages/conversations/conversationContext.ts` — os rótulos
  (`awaiting_address`, `cart`…) são do fluxo do bot, não do SDK.

## Fase 2 — Tela
> 🤖 Modelo: `sonnet`

- ✅ **T2.1** Reescrever `ConversationsPage.tsx` sobre `ConversationsProvider`
  + hooks headless + componentes do SDK (estrutura §4 da spec).
- ✅ **T2.2** Remover `pages/conversations/components/` (ConversationListItem,
  MessageBubble, MessageComposer locais).

## Fase 3 — Build e estilos
> 🤖 Modelo: `haiku`

- ✅ **T3.1** `tailwind.config.ts`: declarar `content` com `./src/**/*.{ts,tsx}`
  **e** `./node_modules/@adatechnology/conversations-ui/dist/**/*.js`, mais
  `darkMode: 'class'`.
- ✅ **T3.2** Importar `@adatechnology/conversations-ui/styles.css`.
- ✅ **T3.3** `vite.config.ts`: excluir o pacote do pre-bundle (`file:` linkado —
  o optimizer serve dist obsoleto entre rebuilds do pacote).

## Fase 4 — Validação
> 🤖 Modelo: `sonnet`

- ✅ **T4.1** `npx tsc --noEmit` em `apps/web`: zero erros em `ConversationsPage.tsx`
  e em todos os arquivos novos. Restam 5 erros **pré-existentes** e alheios à
  migração — `PWAInstallBanner.tsx` (2), `Sidebar.tsx`, `MobileNav.tsx`,
  `LoginPage.tsx` (1 cada).
- ✅ **T4.2** Build de produção verde (`../../node_modules/.bin/vite build` —
  os binários ficam hoisted na raiz do monorepo): 3654 módulos, `index.js`
  635 kB (169 kB gzip), `index.css` 71 kB, service worker gerado.
- 🟨 **T4.3** Fumaça na stack local (`sakura-bot`), API sobre o módulo:
  - ✅ Boot: `runMetaWhatsAppMigrations` criou o schema `meta_whatsapp`
    (`sessions`, `messages`, `settings`, `documents`, `flow_graphs`, `flow_media`).
  - ✅ `GET /conversations` (com e sem filtro), `/messages`, `/context`,
    `/export`, `POST /takeover`, `/read`, `/release` — todos 200 com o
    `ConversationSummary` do pacote.
  - ✅ Rota interna `POST /conversations/:numero/messages` (n8n) cria sessão +
    mensagem: 201.
  - ✅ Webhook fail-closed: `hub.challenge` válido devolve o desafio; token
    errado e POST sem `X-Hub-Signature-256` devolvem `401
    META_WHATSAPP_INVALID_SIGNATURE`.
  - ⬜ Enviar texto/anexo/template e janela expirada: bloqueado por credencial —
    a Meta responde `Authentication Error` ao `WHATSAPP_ACCESS_TOKEN` do
    `infra/.env`, e `WHATSAPP_APP_SECRET` está vazio (webhook de entrada real
    será rejeitado até ser preenchido).
  - ⬜ Fumaça visual no painel (dark mode, bolhas, transcript).

## Fase 5 — Paridade com o quickcart
> 🤖 Modelo: `sonnet`

Referência: `quickcart/apps/frontend-web/src/modules/conversations/`.

- ✅ **T5.1** Estado da inbox extraído para `useConversationsInbox.hook.ts`
  (espelho do `useAdminInbox.hook.ts`): filtros, paginação, seleção em massa,
  ações de atendimento, `loadFailure` e `now` carimbado por render.
- ✅ **T5.2** Marcar como lida em efeito com guarda `id:unread`, não no clique —
  cobre também mensagem nova chegando com a conversa aberta, sem laço quente.
- ✅ **T5.3** Aviso de falha de carregamento (401/403 vira "sessão expirada"),
  que antes ficava indistinguível de inbox vazia.
- ✅ **T5.4** Paginador completo (« ‹ › ») com faixa `1–20 de N`.
- ✅ **T5.5** Barra de filtro de canal (`channelFiltersFor` + `ChannelIcon`) —
  some sozinha enquanto houver só WhatsApp.
- ✅ **T5.6** Rótulos `cv-only-wide` nos contadores e botões do cabeçalho.
- ✅ **T5.7** Quick replies com variáveis (`{{nome}}` vindo do contexto do fluxo)
  em `quickReplies.ts`, e download do transcript em `conversationsExport.ts`.

Deliberadamente fora da paridade: painel de documentos, transcrição de áudio e
simulador de cliente — sem rota/engine no backend do Order Hub.

## Fase 6 — Backend sobre o SDK (`@adatechnology/meta-whatsapp-module`)
> 🤖 Modelo: `opus` 🧠 (troca de dono do domínio de conversas + webhook)

Gate desta fase: `npx tsc --noEmit` verde em `apps/api` **e** `apps/web`.

- ✅ **T6.1** `meta-whatsapp-module@0.2.0-rc.16` + `meta-whatsapp-contracts@0.2.0-rc.8`
  no `apps/api` (registry, como o quickcart).
- ✅ **T6.2** `CacheProvider.setIfNotExists` (`SET NX EX` atômico) no `RedisProvider`,
  base do `NonceStoreInterface` do módulo.
- ✅ **T6.3** `ConversationRealtimeNotifier`: canal `conv:<numero>` → `whatsappNumber`
  no payload, evento → `conversation:<evento>`, entrega na sala do `establishmentId`.
  Sem essa amarração os eventos do módulo (que não carregam tenant) vazariam entre
  estabelecimentos.
- ✅ **T6.4** `createMetaWhatsAppModuleRegistry`: uma instância memoizada por
  estabelecimento, `features: { flowEngine: false }` — o bot aqui é o n8n.
- ✅ **T6.5** `runMetaWhatsAppMigrations({ db, migrate })` no boot (`connection.ts`),
  criando o schema `meta_whatsapp` com journal próprio.
- ✅ **T6.6** `ConversationController` reescrito sobre os use-cases do módulo,
  preservando rotas, `authenticate`/`authorize`/`internalAuth` e tirando o tenant
  do JWT — nunca do corpo.
- ✅ **T6.7** `WebhookController` sobre `webhook.receive`/`verifyChallenge`. Corrige
  dois defeitos reais do código à mão: o HMAC era conferido contra o
  `WHATSAPP_ACCESS_TOKEN` em vez do **app secret**, e a guarda de replay era
  `exists`-depois-`set` (janela de corrida). Nova variável: `WHATSAPP_APP_SECRET`.
- ✅ **T6.8** Removidos os 14 use-cases, `ConversationRepository`,
  `DrizzleConversationRepository`, `WhatsAppSender`, `ReceiveWhatsAppWebhookUseCase`,
  as tabelas `conversation-sessions`/`conversation-messages` (schema, relations) e os
  seeds de conversa.
- ✅ **T6.9** Adapter web reduzido: a API devolve o `ConversationSummary` do pacote,
  então `toConversationSummary` deu lugar a só trocar `id` pelo número.
- ✅ **T6.10** `conversationsSdkRealtime` passou a despachar por nome de evento
  (`message`, `message-status`, `mode-changed`, `data-changed`); antes só `message`
  chegava, e mudança de modo era perdida em silêncio.

- ✅ **T6.11** Exception filter do router reconhece `MetaWhatsAppError`: o módulo
  já carrega `statusCode`/`code` estáveis, mas sem a ponte assinatura inválida e
  janela de 24h expirada saíam como `500 internal_error` — e acionavam o Sentry
  a cada webhook forjado.

Restrição herdada: o módulo não expõe contagem total de conversas. A rota pede um
item a mais que a página e devolve `total` como **piso** (exato na última página).

## Fase 7 — Tela de Mensagens (configuração do WhatsApp)
> 🤖 Modelo: `sonnet`

- ✅ **T7.1** `WhatsAppSettingsController` + `/whatsapp/settings` (GET/PUT) sobre o
  `SettingsRepository` do módulo. Saudação, despedida e template de reabertura passam
  a viver por empresa em `meta_whatsapp.settings` — mudar o texto de boas-vindas não
  exige mais deploy. `companyId` do JWT.
- ✅ **T7.2** `/whatsapp/templates` (GET/POST) sobre o `WhatsAppTemplateProvider`.
  Sem cache local: quem aprova ou reprova template é a Meta, e cópia daqui mostraria
  como disponível o que já foi rejeitado.
- ✅ **T7.3** `MessagesPage` em `/messages` (admin/gerente) com `WelcomeFarewellForm`
  e `WhatsAppTemplatesSettings` do SDK.

## Pendências conhecidas (fora do escopo desta spec)

- Documentos por conversa: **bloqueado por infraestrutura, não por rota.** O módulo
  já expõe `conversations.listDocuments`/`listCompanyDocuments`, mas eles dependem de
  `ingestInboundMedia`, que só existe com um `ObjectStorageInterface` — e o Order Hub
  não tem storage de objetos. A mídia é buscada da Meta sob demanda em base64. Sem
  bucket, a tabela `documents` nunca é populada e o painel seria uma tela vazia.
- Mapa de fluxos (`FlowMapCanvas`): `features.flowEngine` está desligado por decisão
  de produto — aqui o bot é o workflow do n8n. Ligar só para desenhar o mapa mostraria
  um grafo vazio, e ligar de verdade faria o módulo passar a interpretar fluxos no
  webhook. Exige também `@xyflow/react`, que não está instalado.
- Simulador de cliente (`ConversationPreview`): o cliente do preview assina um payload
  de webhook da Meta, e a rota do webhook é fail-closed. `WHATSAPP_APP_SECRET` está
  vazio neste ambiente — sem ele a simulação é recusada na assinatura, corretamente.
- Transcrição de áudio: sem engine configurado, e `WhatsAppSettings` do módulo não
  tem campo de transcrição. `TranscriptionSettingsForm` fica fora da tela de Mensagens.
- Notificações de navegador (`useWaitingNotifications`): item 7 do gap analysis,
  independente desta migração.
