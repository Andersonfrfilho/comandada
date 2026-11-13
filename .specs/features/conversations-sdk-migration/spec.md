# CNV-SDK — Migração da tela de Conversas para `@adatechnology/conversations-ui`

Status: **em execução** · Criada em 2026-07-31
Precede: `.specs/features/ux-overhaul/` (T7.1–T7.5) · Referência de gaps:
`.specs/features/ux-overhaul/gap-analysis-conversations.md`

---

## 1. Contexto

A T7.4 do UX Overhaul foi dada como concluída tendo integrado apenas três peças
soltas do pacote (`AudioPlayer`, `EmojiPicker`, `useDarkMode`). A tela continua
sendo uma implementação própria: `ConversationsPage.tsx` (665 linhas) mais três
componentes locais (`ConversationListItem`, `MessageBubble`, `MessageComposer`,
320 linhas) que duplicam o que o pacote já entrega — e ficam para trás a cada
versão nova dele.

Enquanto isso, dois projetos irmãos já consomem o pacote pelo caminho completo,
com o SDK headless (`ConversationsProvider` + `ConversationsApi` + `SSEProvider`):

| Projeto | Tela | Forma |
|---|---|---|
| `quickcart` | `AdminConversations.page.tsx` (475 linhas) | Provider + hooks + componentes do SDK; adapter próprio em `conversationsApi.ts` |
| `financiamento-imobiliario-bot` | `ConversationsPage.tsx` | Mesma arquitetura, `conversationsSdkApi.ts` |

Esta spec faz o sakura chegar ao mesmo lugar.

## 2. Objetivo

Substituir a implementação local pela camada headless do SDK, mantendo intactas
as rotas e o WebSocket que o Order Hub já tem. Nenhuma mudança de backend.

**Não-objetivos:** migrar de WebSocket para SSE (o contrato do SDK é estrutural,
o WebSocket satisfaz), criar módulo de documentos, e transcrição de áudio — o
backend não expõe nenhum dos dois, e o SDK trata ambos como capacidade opcional.

## 3. Decisões de arquitetura

### 3.1 Adapter, não fork

O SDK não conhece as rotas do Order Hub, e não deve. Toda a tradução entre os
dois vocabulários vive em **um** arquivo (`lib/conversationsSdkApi.ts`):

| API do Order Hub | Contrato do SDK |
|---|---|
| `GET /conversations` → `{ data, total, page… }` | `fetchConversations` → `ConversationPage` |
| `id` = UUID da sessão | `id` = `whatsappNumber` (todas as demais rotas endereçam por número) |
| `createdAt`, `lastActivity` | `timestamp`, `lastAt` |
| histórico do mais novo para o mais antigo | timeline do mais antigo para baixo (inverter) |
| `status: 'received'` | `status: undefined` (entrada não tem tique de entrega) |
| tipos livres (`interactive_list`, `button`) | união fechada — o que não renderiza cai para `text` |
| `humanRequestedAt !== null` | `waitingHuman` |
| `{ currentState, context }` | dicionário plano (o estado entra como mais uma chave) |
| `{ base64, mimeType }` | `{ data, mimeType }` |

### 3.2 WebSocket cumprindo o papel de SSE

`SSEProvider` pede `connectConversationStream` / `connectGlobalStream`
devolvendo um `ConversationEventSource` — interface **estrutural** (`addEventListener`,
`removeEventListener`, `close`), deliberadamente não `EventSource`. Um
multiplexador sobre um único WebSocket compartilhado satisfaz o contrato sem
tocar no servidor: cada assinatura filtra por `whatsappNumber` e reemite como
evento `message`.

Uma conexão só, contada por referência: cada `ConversationPane` montado assina,
o último a desassinar fecha o socket.

### 3.3 Capacidades ausentes ficam ausentes

O SDK esconde a afordância quando o método não existe — `getDocumentUrl`,
`transcribeAudio`, `listTemplates`. Implementar um stub que estoura no clique
seria pior que não desenhar o botão.

## 4. Escopo da tela

Depois da migração, `ConversationsPage.tsx` monta:

```
ConversationsProvider (api + sse)
└── Inbox
    ├── cabeçalho: contadores + filtro "aguardando" + marcar todas como lidas
    ├── aside: busca · filtros de janela (WINDOW_FILTERS) · ConversationRow[] · paginação
    └── section: ConversationPane
        ├── ConversationHeader (assumir / devolver ao bot / finalizar / baixar transcript)
        ├── ConversationContextPanel (estado do fluxo + carrinho + dados coletados)
        ├── ConversationWallpaper + DateDivider + MessageBubble
        └── MessageComposer (anexo, gravador, respostas rápidas) ou WindowExpiredNotice
```

Ganhos diretos sobre a tela atual: preview inline de imagem/vídeo/documento,
player de áudio na bolha, divisor de data, avatar, gravador de voz, filtro por
janela de 24h, dark mode completo e formatação WhatsApp — tudo já resolvido no
pacote (itens 1, 2, 4, 5, 8, 9, 11, 13 do gap analysis).

## 5. Riscos

| Risco | Mitigação |
|---|---|
| `tailwind.config.ts` não declara `content` — as classes do pacote não seriam geradas | Declarar `content` com `./src/**/*` **e** o `dist` do pacote |
| `file:` aponta para o `dist` do pacote irmão; build desatualizado quebra silenciosamente | `npm run build` no pacote antes de validar |
| Sem tipagem estrita na tela, erro de contrato só aparece em runtime | Gate obrigatório: `npx tsc --noEmit` em `apps/web` |

## 6. Critério de pronto

- [ ] `apps/web/src/pages/conversations/components/` removido
- [ ] Nenhuma referência a `MessageBubble`/`MessageComposer` locais
- [ ] `npx tsc --noEmit` limpo em `apps/web`
- [ ] Build do Vite passa
