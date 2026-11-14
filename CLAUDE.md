# CLAUDE.md — sakura-bot-oficial

Template de bot de atendimento WhatsApp usando a **Meta WhatsApp Cloud API** (oficial).
Projeto irmão de `sakura-bot/` (Evolution API). Use este para produção — sem risco de ban.

## O que é este projeto

Infrastructure-as-configuration: sem código para compilar ou testar. Trabalho aqui significa editar
CSVs de dados, schemas SQL, regras de negócio em markdown, workflows n8n e configuração Docker.

Cada estabelecimento recebe sua própria cópia configurada via `infra/.env` e arquivos em `dados/`.

## Diferença fundamental em relação ao sakura-bot (Evolution)

| Aspecto | sakura-bot (Evolution) | sakura-bot-oficial (Meta) |
|---|---|---|
| Gateway WhatsApp | Evolution API (Docker, porta 8081) | Meta Cloud API (hospedado pela Meta) |
| Webhook | Evolution → n8n | Meta → n8n (HTTPS obrigatório) |
| Teste local | Possível | Requer URL pública (Railway ou ngrok) |
| Risco de ban | Alto | Zero |
| Botões interativos | Instável | Nativo e confiável |
| Mensagem format | JSON Evolution | JSON Meta Graph API |
| Envio de mensagem | POST → Evolution API | POST → graph.facebook.com |

## Arquitetura

```
WhatsApp → Meta Cloud API (hospedado pela Meta)
                  ↓ POST webhook (HTTPS obrigatório)
             n8n [:5678]  ←→  Groq (IA)
                  ↓
            PostgreSQL [:5432]
                  ↓
     ┌────────────┴────────────┐
 Order Hub Web [:4000]   Directus [:8055]
 (atendente humano)      (painel admin)
```

Não há Evolution API neste projeto. O n8n recebe webhooks diretamente da Meta.

## Variáveis de ambiente Meta (em infra/.env)

```bash
WHATSAPP_ACCESS_TOKEN          # token do app Meta
WHATSAPP_PHONE_NUMBER_ID       # ID do número (não o número em si)
WHATSAPP_BUSINESS_ACCOUNT_ID   # WABA ID
WHATSAPP_WEBHOOK_VERIFY_TOKEN  # string que você define para verificação
WHATSAPP_API_VERSION           # padrão: v21.0
```

Obter em: developers.facebook.com/apps → WhatsApp → Primeiros passos

## Enviar mensagem (referência para workflows n8n)

```
POST https://graph.facebook.com/{{WHATSAPP_API_VERSION}}/{{WHATSAPP_PHONE_NUMBER_ID}}/messages
Authorization: Bearer {{WHATSAPP_ACCESS_TOKEN}}

# Texto
{ "messaging_product":"whatsapp", "to":"5511999999999",
  "type":"text", "text":{"body":"Olá!"} }

# Botões (até 3)
{ "messaging_product":"whatsapp", "to":"5511999999999",
  "type":"interactive",
  "interactive":{ "type":"button", "body":{"text":"Como posso ajudar?"},
    "action":{ "buttons":[
      {"type":"reply","reply":{"id":"cardapio","title":"Cardápio"}},
      {"type":"reply","reply":{"id":"pedido","title":"Fazer pedido"}},
      {"type":"reply","reply":{"id":"suporte","title":"Suporte"}}
    ]}}}
```

## Receber mensagem (POST da Meta no n8n)

```json
{
  "entry": [{ "changes": [{ "value": {
    "messages": [{
      "from": "5511999999999",
      "type": "text",
      "text": { "body": "Olá" }
    }]
  }}]}]
}
```

Expressões n8n:
```
Telefone : {{ $json.body.entry[0].changes[0].value.messages[0].from }}
Texto    : {{ $json.body.entry[0].changes[0].value.messages[0].text.body }}
```

O webhook também recebe GET para verificação (hub.challenge) — tratar no workflow.

## Setup

1. `make setup` → cria `infra/.env` a partir do `.env.example`
2. Preencher credenciais Meta em `infra/.env`
3. `make up` → sobe todos os serviços localmente
4. Expor n8n publicamente:
   - Dev: `ngrok http 5678`
   - Produção: Railway (build e deploy configurados em cada serviço; ver `scripts/ops/README.md`)
5. Registrar webhook na Meta com a URL pública

Ver [SETUP.md](SETUP.md) para passo a passo detalhado.

## Regras de desenvolvimento TypeScript

- **Sem `any`** — usar interfaces tipadas ou `unknown` + type guard
- **Sem diminutivos** — nomes de variável descritivos (`product`, não `p`; `paymentType`, não `pt`)
- **Strings em constants** — toda string de UI vai em `MessagesConstants`
- **Providers sem prefixo `I`** — interface: `GeocodingProvider`; implementação: `NominatimProviderImplementation`
- **Shared first** — types em `src/shared/types/`, constants em `src/shared/constants/`, providers em `src/shared/providers/`

## Protocolo de modelos nas tasks (.specs/)

Os `tasks.md` em `.specs/features/*/` anotam o **modelo recomendado por fase**
(`haiku` mecânico · `sonnet` execução padrão · `opus`/`fable` 🧠 arquitetura).
Ao iniciar uma fase/task: se o modelo da sessão divergir do recomendado,
**pare e peça ao usuário para rodar `/model <modelo>`** antes de codar.
Regra completa: `~/.claude/rules/rules/model-economy.md`.

## Dados do bot (n8n ↔ API)

O workflow `01-receber-mensagem.json` não fala SQL com o Postgres: lê e grava pela API, nas rotas
internas protegidas por `X-Internal-Token` (`N8N_INTERNAL_API_TOKEN` na API = `ORDER_HUB_N8N_INTERNAL_TOKEN`
no n8n, mínimo 32 caracteres; sem ele as rotas respondem 401):

| Nó | Rota |
|---|---|
| Buscar Dados | `GET /internal/bot/:whatsapp/context` (inclui `schedule_slots`: horários livres de encomenda) |
| Salvar Sessão | `PUT /internal/bot/:whatsapp/session` (tabela `bot_sessions`) |
| Gravar Pedido e Reserva | `POST /internal/bot/:whatsapp/orders` e `POST /internal/bot/:whatsapp/reservations` |
| Atualizar Nome Cliente | `PUT /internal/bot/:whatsapp/customer` |
| Gravar Pedido e Reserva | `POST /internal/bot/:whatsapp/issues` (problema relatado pelo cliente) |
| Gravar Pedido e Reserva | `POST /internal/bot/:whatsapp/partial-confirmation` (SIM/NÃO à confirmação parcial) |

**Cache do contexto no Redis:** o `GET /internal/bot/:whatsapp/context` guarda a parte igual para todo cliente
(estabelecimento, configurações, cardápio, formas de pagamento, tipos de pedido, mesas, taxa, coordenadas) em
`bot:context:shared:<instance>` por 30 s (`BOT_CONTEXT_CACHE_TTL_SECONDS`, 0 desliga). Sessão, pedidos, conversa,
confirmação parcial e horários da agenda vêm sempre do banco. Mudança no cardápio ou nas configurações chega ao bot em até 30 s.

**Ajuda com o pedido** (`src/handlers/IssueHandler.ts`, palavras *problema*/*ajuda*): as opções seguem o momento do pedido
(em andamento: onde está, atrasado só depois da previsão, alterar só antes do preparo; entregue há até 6 h: faltou item,
item errado, qualidade, entrega, pagamento; sem pedido: fazer pedido, cardápio). *Falar com atendente* aparece sempre.
O problema vai para `order_issues` e aparece em **Relatórios → Problemas relatados**.

**Atendimento humano segue a inbox** (`HandoffHandler`): o contexto traz `conversation.mode` de `meta_whatsapp.sessions`.
Atendente assumiu no painel → bot calado; liberou → bot volta na hora.

**Confirmação só depois de gravar:** `Rotear e Responder → Gravar Pedido e Reserva → Salvar Sessão → Enviar Resposta`.
Se a API recusa, o cliente recebe um aviso, a sessão volta ao passo anterior com o carrinho e a cozinha não é avisada.
O pedido gravado volta com `estimatedAt`, que entra na confirmação como previsão.

**Entrada pela API com worker** (`docs/whatsapp-entrada-pela-api.md`): `POST /webhooks/whatsapp` confere a assinatura,
enfileira (`whatsapp-inbound`) e o serviço worker (`src/worker.ts`, só consome filas) repassa o corpo cru com a assinatura
original para `/webhook/routing` do n8n. Filas não rodam na API com `API_QUEUE_WORKERS=false`.

**Webhook da Meta no n8n** (nó Extrair Mensagem): com `WHATSAPP_APP_SECRET` no n8n, só passa POST com
`X-Hub-Signature-256` válido (corpo cru via `rawBody` do nó Webhook, `NODE_FUNCTION_ALLOW_BUILTIN=crypto`), e o
formato já extraído só entra com `X-Internal-Token`. A mesma mensagem (id da Meta) entregue de novo em 24 h é ignorada.

**Confirmação parcial:** o painel avisa que itens acabaram (`order_partial_confirmations`, pendente); o contexto do bot
traz `partial_confirmation` e o `PartialConfirmationHandler` lê SIM/NÃO (antes do "cancelar" global). SIM tira os itens
e ajusta total e partes do pagamento; NÃO cancela. **Observação por item:** na escolha do item (botões Adicionar 1 /
📝 Com observação / ↩️ Trocar item; Evolution aceita "obs"; "2 sem cebolinha" já manda quantidade e observação), fica em
`cart.pending_item_note` até a quantidade e vai em `order_items.notes` (cozinha e painel). Mesmo produto com observação
diferente é outra linha. No resumo, a observação aparece embaixo do nome, antes da conta.
**Trocar item e editar carrinho:** a tela do produto tem Adicionar 1 / 📝 Com observação / ↩️ Trocar item (quantidade
maior é digitada); a da observação tem ⏭️ Sem observação / ↩️ Trocar item. `CartEditHandler`: "✏️ Editar carrinho"
(depois de adicionar) e "✏️ Editar" (na confirmação) abrem a lista das linhas do carrinho (`awaiting_cart_edit`), e a
linha escolhida (`cart.edit_index`) tem 🗑️ Remover / 🔢 Mudar qtd / ↩️ Voltar; 0 tira; carrinho vazio volta às categorias.
**Tamanho e finalizar pelas listas:** a tela do tamanho traz emoji + nome em negrito, descrição em itálico, cada tamanho
com 🔸 e preço e ↩️ Trocar item (até 2 tamanhos em botões, mais vira lista). Com carrinho, as listas de categorias e
itens terminam com "🛒 Finalizar pedido" (logo acima do Voltar) (id `finalizar`, quantos itens e total; Evolution: "digite *finalizar*") e a página
perde uma linha (`itemsPageSize`). A dica de escrever/mandar áudio só aparece na primeira lista, sem carrinho.
**Descrição do produto:** no cadastro, `porção · composição` ("32 unidades · 4 sashimi de salmão, 8 hot roll") ou texto com
a porção no fim entre parênteses. Na lista (limite de 72 da Meta) a descrição nunca corta palavra: composição termina em
"+N itens", texto em "…" (`compactDescription`). Na tela do produto vai inteira: 📦 porção em negrito e uma peça por linha
(`detailDescription`).

**Saudação** (`GreetingHandler`): na Meta vai **numa mensagem só**: logo no topo (cabeçalho de imagem), boas-vindas,
cartão do restaurante (blocos em negrito separados por linha em branco: horário com "aberto agora", endereço + cidade
com link do mapa, entrega/retirada com taxa, pagamento, Instagram, site; cada bloco só com o dado cadastrado) e o fecho:
menu em 3 botões (sem pedido: Fazer pedido/Reservar mesa/Atendente; com pedido em andamento: Meu pedido/Ajuda com o
pedido/Fazer pedido), Sim/Não para repetir o último pedido, ou foto com legenda pedindo o nome. Texto acima de 1024
caracteres ou Evolution → mensagens separadas (figurinha, boas-vindas, cartão, pin, fecho).
Dados em Configurações → Estabelecimento (`establishment_address`, `establishment_city`,
`establishment_instagram`, `establishment_website`, lat/lng opcionais). Sem lat/lng digitadas, a API geocodifica
endereço + cidade uma vez (`EstablishmentLocationService`, Nominatim) e salva com `establishment_geocoded_for`.
O cabeçalho é o logo sem fundo numa faixa 1200x628 na cor `brand_primary_color` (JPEG) em
`GET /public/branding/:establishmentId/cabecalho.jpg`; a figurinha (Evolution) é o logo em WebP 512x512 (≤100 KB)
em `GET /public/branding/:establishmentId/sticker.webp` (`BrandStickerService`, cache em memória por versão do logo
e da cor). O contexto do bot traz `establishment.header_image_url` e `sticker_url` só com logo e `API_PUBLIC_URL` em
HTTPS. O nó Enviar Resposta manda `headerImage` como cabeçalho interativo, `{ type: 'image' }` e `{ type: 'sticker' }`.
**Logo sem fundo:** ao salvar `brand_logo` a API tira o fundo liso ligado à borda (`removeLogoBackground`, tolerância
baixa para não comer detalhe escuro) e guarda PNG; a figurinha aplica o mesmo em logo antigo.

**Mensagens por provedor** (`src/shared/channels/ChannelMessageStrategy.ts`): toda resposta passa pela strategy do provedor
antes de sair (`renderPayloadForChannel` no teardown); handler nenhum monta texto numerado. `categoryList`/`itemsList`
montam um `MenuPage` paginado. `meta_cloud` (oficial): lista interativa, 8 opções por página + "➡️ Ver mais" +
"↩️ Voltar" (limite de 10 linhas, título 24, descrição 72). `evolution`: lista e botões viram texto numerado em negrito e o
número digitado volta a ser o id da opção (`cart.menu_choices`), menos nos passos de número livre (`NumericInputStates`). O provedor vem de `provider` no nó Extrair Mensagem
(payload da Meta = `meta_cloud`; senão `raw.provider` ou `WHATSAPP_PROVIDER`). Emoji sem cadastro: `MenuEmojiConstants`.

**Cardápio em PDF** (`apps/api/src/modules/menu/`): `GET /public/menu/:establishmentId/cardapio.pdf` gera o cardápio
do cadastro (produtos ativos na ordem do bot, tamanhos numa linha, descrição, logo sem fundo, cor `brand_primary_color`,
endereço/WhatsApp/Instagram) com um escritor de PDF próprio (`SimplePdfDocument`, Helvetica WinAnsi, sem dependência;
emoji some). Fica em memória por restaurante até o conteúdo ou o dia mudar. O contexto traz `establishment.menu_pdf_url`
(com `?v=` do conteúdo, só com `API_PUBLIC_URL` em HTTPS e cardápio não vazio); o bot põe "📄 Ver cardápio completo"
(id `menu:pdf`) na lista de categorias e responde a "cardápio completo"/"pdf" com `{ type: 'document' }`.

**Pedido por texto livre** (`src/shared/ordering/FreeTextOrderParser.ts` + `src/handlers/TextOrderHandler.ts`): nos passos
de escolher do cardápio (início, categorias, itens, "mais alguma coisa?") o cliente pode escrever
"2 combo tradicional e 1 hot roll". Cada trecho vira quantidade (número, por extenso, "x2") + palavras comparadas ao nome
(sem acento, plural, prefixo, 1 erro de digitação). Ambíguo ou com tamanhos → lista (`pick:<id>`, `pick:none`) em
`awaiting_text_order_choice`; tudo resolvido → "Anotei assim" com Confirmar/Pedir mais/Corrigir em
`awaiting_text_order_confirm` (rascunho em `cart.text_order`; só entra no carrinho ao confirmar). Texto sem item do
cardápio segue os atalhos de sempre.

**Pedido por áudio:** o nó Extrair Mensagem manda o id da nota de voz para `POST /internal/bot/:whatsapp/transcriptions`
(API baixa pelo canal do restaurante e transcreve com o Whisper da Groq, nomes do cardápio de dica; `GROQ_API_KEY` na
API, `AUDIO_TRANSCRIPTION_MODEL` opcional) e o texto segue como mensagem digitada, com `from_audio`; a resposta abre com
"🎤 Ouvi: …". Falhou ou sem chave → `__audio_unclear__` e o bot pede para repetir ou escrever.

**Status do pedido ao cliente** sai da API (`NotifyOrderStatusUseCase`) quando a equipe muda o status: cozinha, painel e
Entregas ("saiu" → em entrega, "entregue" → concluído). Na loja (`SYNC_ROLE=loja`) não sai nada: a nuvem avisa quando o
histórico de status chega pela sincronização. Fora da janela de 24 h vai o template `atualizacao_pedido`
(`ORDER_UPDATE_TEMPLATE`, criar no WhatsApp Manager: pt_BR, Utilidade, corpo
`Oi! Temos novidades sobre o seu pedido *{{1}}*: {{2}} Qualquer dúvida, é só responder esta mensagem. 😊`). A nota
fiscal vai pelo mesmo WhatsApp (sem n8n).

**Total do pedido = itens + taxa de entrega** (`orders.delivery_fee` guarda a taxa; a nota fiscal leva só os itens).
Pago na entrega/retirada entra no caixa ao concluir (`RecordOrderPaymentsUseCase`, uma entrada por parte). Encomenda só
aparece na fila da cozinha 40 min (retirada) ou 60 min (entrega) antes da hora marcada.

Código em `apps/api/src/modules/bot/`. Preço vem do catálogo, nunca do payload; o pagamento vem em
partes (`payments`: divisão por pessoa, misto cartão + dinheiro, troco por parte).

## Pagamento pelo WhatsApp (Mercado Pago)

Cada restaurante liga a própria conta em **Configurações → Pagamentos** (access token + assinatura secreta do
webhook, cifrados com `SecretCipher` em `payment_accounts`); o dinheiro cai direto nela. Provedor vem do SDK:
`@adatechnology/payment-contracts` (porta `ChargeProviderPort`) + `@adatechnology/mercadopago-payment-provider`.
Outro provedor (Stone) é outra implementação de `PaymentGatewayFactory`. Código em `apps/api/src/modules/payments/`.

- Conta ligada: o contexto do bot marca Pix com `config.online` e acrescenta `link_cartao` (cartão pelo link).
- Pedido de **uma parte** em Pix/link: a API gera a cobrança (`payment_charges`), põe `orders.payment_status = awaiting`
  e devolve `payment` no `POST /internal/bot/:whatsapp/orders`; o nó Gravar Pedido manda o copia-e-cola (mensagem
  sozinha) ou o link. Divisão e misto continuam pagos na entrega/retirada.
- `awaiting`/`failed` ficam fora da fila da cozinha. Webhook `POST /webhooks/payments/mercadopago/:establishmentId`
  (assinatura `x-signature` conferida e estado relido na API do Mercado Pago, idempotente por `payment_webhook_events`):
  aprovado → `paid`, movimento no caixa aberto, cozinha avisada, cliente avisado; expirado/cancelado → pedido cancelado.
- Link de cartão vencido não gera webhook: a varredura a cada 5 min (`ExpireStaleChargesUseCase`) cancela.
- `API_PUBLIC_URL` (HTTPS) monta o `notification_url`.

## Agenda (encomendas e reservas)

`@adatechnology/scheduling-module` (schema `scheduling`, exige `btree_gist`), código em `apps/api/src/modules/agenda/`.
A API espelha o restaurante no SDK sozinha: 3 linhas de produção (até 3 encomendas por faixa de 15 min)
e uma agenda por mesa, com o horário de `opening_time`/`closing_time`/`working_days` no momento da criação.
Encomenda ocupa a faixa antes de o pedido existir (e libera se o pedido falhar); reserva escolhe a menor mesa livre.
Painel: página **Agenda** (`GET /agenda?date=`). Cardápio com tamanhos: `products.variant_group`/`variant_label`.
Seed do Yuyaki: `bun run --cwd apps/api db:seed:yuyaki`.

## Lógica do bot (src/)

O nó `Rotear e Responder` do workflow é gerado a partir de módulos em `src/`:

```
src/
  setup.js              — extração de contexto, helpers, message builders
  handlers/
    SchedulingHandler.ts — "para agora ou agendar?", dia e horário da encomenda
    global.js           — sair / cancelar (qualquer estado)
    greeting.js         — saudações → boas-vindas ou awaiting_name
    cart.js             — repeat_order, carrinho, finalizar, confirmar
    delivery.js         — awaiting_type/address/complement/offer_pickup
    payment.js          — awaiting_payment/change/split/mixed
    menu-shortcuts.js   — atalhos 1/2/3/4/5/6/0 (!expectingRawInput)
    reservation.js      — reserving, confirming_reservation
    misc.js             — human_handoff, order_detail, notifications, name
    ordering.js         — browsing_cat, ordering_items, awaiting_qty, more
    fallback.js         — parsing livre de número/texto
  teardown.js           — return statement final
scripts/
  build-workflow.js     — concatena src/ → injeta em n8n/workflows/
```

**Nunca edite `n8n/workflows/01-receber-mensagem.json` diretamente.**
Edite os arquivos em `src/` e execute `make build` (ou `node scripts/build-workflow.js`).

## Comandos

```bash
make build      # compila src/ → injeta no workflow JSON
make validate   # build + testes + JSON + JS syntax (roda antes do push)
make setup      # cria infra/.env
make up         # sobe todos os serviços
make down       # para containers
make logs       # logs em tempo real
make ps         # status dos containers
make db-reset   # recria schema (destrói dados)
make test-msg   # simula mensagem: MSG="oi" TEL=5511999999999
```

## URLs após make up

- n8n: http://localhost:5678
- Directus: http://localhost:8055
- Order Hub Web: http://localhost:4000
- Typebot Builder: http://localhost:3001
- Metabase: http://localhost:4100
- Adminer: http://localhost:8181

## Arquivos de dados

| Arquivo | Função | Quando editar |
|---|---|---|
| `dados/processos.md` | Contexto da IA — regras de negócio | Mudar regras, horários, preços |
| `dados/cardapio.csv` | Seed do cardápio | Adicionar/remover/reprear itens |
| `dados/faq.csv` | Seed do FAQ | Adicionar perguntas frequentes |
| `database/schema.sql` | Schema completo | Mudanças de estrutura |
| `infra/.env.example` | Template de variáveis | Adicionar novas credenciais |

## Feature flags (em .env)

| Variável | Padrão | Efeito |
|---|---|---|
| `FEATURE_DELIVERY` | `true` | Habilita fluxo de delivery |
| `FEATURE_RETIRADA` | `true` | Habilita retirada |
| `FEATURE_RESERVAS` | `false` | Habilita reservas |
| `FEATURE_PEDIDO_MESA` | `false` | Habilita pedido na mesa |
