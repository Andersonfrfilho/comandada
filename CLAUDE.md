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
| Salvar Preferência Marketing | `PUT /internal/bot/:whatsapp/marketing-opt-in` (`customers.marketing_opt_in`) |
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
e ajusta total e partes do pagamento; NÃO cancela. **Observação do pedido:** uma pergunta só, antes do pagamento (`goToPayment`): "Deseja informar alguma observação?"
(📝 Sim / ➡️ Não, seguir; texto escrito direto já vale), estado `awaiting_order_note_choice` → `awaiting_order_note`, fica em
`cart.order_note` e vai em `orders.notes` (`notes` no `POST /internal/bot/:whatsapp/orders`; cozinha e painel mostram).
**Observação por item** (sem botão desde então): escrever "obs" na escolha do item ou "2 sem cebolinha" ainda funciona; fica em
`cart.pending_item_note` até a quantidade e vai em `order_items.notes` (cozinha e painel). Mesmo produto com observação
diferente é outra linha. No resumo, a observação aparece embaixo do nome, antes da conta.
**Trocar item e editar carrinho:** a tela do produto tem Adicionar 1 / ↩️ Trocar item (quantidade
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
**Flag:** só funciona com `FEATURE_AUDIO_ORDERS=true` na API (padrão desligado). Desligada, a transcrição responde 503
sem chamar a Groq, o contexto manda `config.feature_audio_orders = 'false'` e o bot tira toda menção a áudio das
mensagens; nota de voz recebe "Por enquanto não consigo ouvir áudios" (`AUDIO_DESLIGADO`).

**Status do pedido ao cliente** sai da API (`NotifyOrderStatusUseCase`) quando a equipe muda o status: cozinha, painel e
Entregas ("saiu" → em entrega, "entregue" → concluído). Na loja (`SYNC_ROLE=loja`) não sai nada: a nuvem avisa quando o
histórico de status chega pela sincronização. Fora da janela de 24 h vai o template `atualizacao_pedido`
(`ORDER_UPDATE_TEMPLATE`, criar no WhatsApp Manager: pt_BR, Utilidade, corpo
`Oi! Temos novidades sobre o seu pedido *{{1}}*: {{2}} Qualquer dúvida, é só responder esta mensagem. 😊`). A nota
fiscal vai pelo mesmo WhatsApp (sem n8n).

**Lembretes (workflows 04 e 05)** saem da API (`apps/api/src/modules/reminders/`): o n8n só chama
`POST /internal/reminders/reorder` (a cada hora) e `POST /internal/reminders/reservations` (a cada 15 min). Telefone vem do
cliente vinculado; fora da janela vão os templates `lembrete_pedido` (marketing) e `lembrete_reserva` (utilidade).
Detalhes em `n8n/workflows/README.md`.

**Endereço da última entrega:** o contexto traz `last_delivery_address` (snapshot da última entrega do cliente, com complemento). Ao escolher Entregar, o bot pergunta "Entregamos no mesmo endereço?" (✅ Usar este / 📍 Outro endereço / ↩️ Voltar, estado `awaiting_saved_address`); usar recalcula a taxa pelo mapa (taxa base sem coordenadas, fora do raio oferece retirada) e vai direto ao pagamento; escrever outro endereço segue o fluxo normal.

**Pagamento do último pedido:** cada pedido em `recent_orders` traz `payment_method` (só quando pago numa parte). Depois da
observação, se a forma ainda está ativa, o bot pergunta "Vai pagar igual ao último pedido?" (✅ Usar o mesmo / 💳 Outra forma /
↩️ Voltar, estado `awaiting_saved_payment`); usar segue como se tivesse escolhido na lista (dinheiro ainda pergunta o troco).

**Endereço e complemento:** endereço achado no mapa → pin (`location`) + botões "Tem complemento?" (⏭️ Sem complemento /
✏️ Corrigir endereço / ↩️ Voltar); sem coordenadas → texto com o link do Google Maps e os mesmos botões. O nó Enviar
Resposta manda todo texto com link com `preview_url: true` (a Meta mostra a prévia da primeira URL; mensagem interativa
não tem prévia). Endereço pelo CEP que o Nominatim não acha tenta de novo sem o bairro.

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
- **Cancelamento:** cancelar pedido com Pix em aberto cancela a cobrança no Mercado Pago (`OrderCancellationPayments`,
  hook do `UpdateOrderStatusUseCase`). Link de cartão não cancela pela API; pago depois de cancelado → estorno automático.
- **Estorno** (`RefundOrderPaymentUseCase`, `POST /orders/:id/refunds`, permissão `orders:delete` = gerente/admin): total
  ou parcial. Pago online → `refundCharge` do SDK; pago no balcão → devolução manual (só registro + caixa). Livro em
  `payment_refunds`; `orders.refunded_amount` é reservado antes de chamar o provedor (`OrderRefundLedger`), então dois
  cliques ou o webhook do mesmo estorno não devolvem duas vezes. Recusa do provedor desfaz a reserva.
- Estorno feito direto no painel do Mercado Pago chega pelo webhook e entra no mesmo livro. Toda devolução vira
  lançamento `refund` no caixa (saída) e relatórios somam `payment - refund` (`netCashAmount`).
- Item em falta com pedido pago online: a diferença é estornada sozinha (`refundedOnline` na resposta do bot); recusa do
  cliente cancela e devolve tudo. Painel: quadro **Pagamento** no detalhe do pedido (`GET /orders/:id/payments`).
- Teste de banco: `TEST_DATABASE_URL=postgres://… bun test integration` (inclui o livro de estornos).

## Dinheiro e estoque (regras únicas)

- **Faturamento** (`modules/reports/shared/revenue.ts`): pedidos **concluídos** no período, pela hora da conclusão,
  `total_amount - refunded_amount`, no dia/mês de São Paulo. Dashboard, Relatórios e Financeiro usam a mesma regra.
- **Caixa** (`modules/cashier/shared/cashRegisterSummary.ts`): "dinheiro na gaveta" = abertura + pagamentos em dinheiro +
  suprimentos − sangrias − devoluções em dinheiro (Pix/cartão ficam fora). O fechamento grava `expected_cash_amount`,
  `closing_difference` (contado − esperado), quem fechou e o motivo; `GET /cashier/registers/history` lista. Lançamento
  manual (`POST /cashier/movements`) recusa sangria acima da gaveta e pagamento em pedido cancelado.
- **Estoque do pedido**: a receita baixa ao entrar em produção (`out`); se o pedido pulou a produção, baixa ao ficar
  pronto/concluído (com saldo negativo se faltar). Cancelar devolve aos mesmos lotes (`return`,
  `RestoreStockForOrderUseCase`); reaberto e produzido de novo baixa outra vez.
- **Pedido do painel** (`POST /orders`): preço e nome vêm do cardápio (`priceFromCatalog`), pagamento não passa do total,
  "troco para" ≥ valor da parte e agendamento não fica no passado. iFood mantém o preço dele.

## Marketplaces (iFood, 99Food)

`apps/api/src/modules/marketplaces/` (detalhes em `docs/marketplaces-ifood-99food.md`). Porta comum
`MarketplaceProvider`; iFood pela Merchant API, 99Food pelo padrão Open Delivery (`OpenDeliveryMarketplaceProvider`,
serve para outras plataformas do padrão). Desligado por padrão: `IFOOD_ENABLED`/`FOOD99_ENABLED=true` + credenciais
(faltando, o log avisa e a plataforma fica de fora). Polling a cada 30 s na fila `marketplace-polling` (ou webhook
`POST /webhooks/marketplaces/:platform`); `marketplace_events` evita evento repetido e `marketplace_orders` liga o
pedido da plataforma ao do painel. Pedido entra com o **preço da plataforma**, `channel` = `ifood`/`99food`,
`orders.code` = número da plataforma (selo `MarketplaceBadge` no painel e na cozinha), aceite automático
(`MARKETPLACE_AUTO_CONFIRM`). Entregador da plataforma: fora de Entregas e sem taxa no total. Mudança de status no
painel volta para a plataforma pelo `onStatusChanged` do `UpdateOrderStatusUseCase`; cancelado lá cancela aqui sem eco.

## Permissões (painel = API)

- O painel decide menu, rotas e botões pelas **permissões** do usuário (recurso + ação, as mesmas do `authorize` da
  API), nunca pelo nome do cargo: `constants/navigation.ts` (cada item tem `permission`), `PermissionGate`,
  `useCan`. As permissões vêm no login e são relidas do access token a cada renovação. Tela inicial: Dashboard para
  quem tem `reports:read`; senão a primeira tela do menu do cargo (`homePathFor`).
- `customers` e `fiscal` são recursos próprios (migration `0048`): clientes para quem lança pedido, notas para quem
  lança pedido ou mexe no caixa. Cozinha e entregador não leem dados de cliente nem notas.
- Equipe (`StaffAccessPolicy`): ninguém dá cargo com permissão que não tem, nem mexe em quem tem mais acesso.
  Conta do Mercado Pago exige `settings:manage` (administrador); o resto das Configurações, `settings:write`.

## Operação do dia a dia

- **Número do pedido:** `orders.number` sequencial por restaurante (`order_counters`, migration `0049`); tudo mostra
  `#N` (`orderDisplayCode`/`orderBotCode`, painel `orderNumberLabel`), e mesa ou cliente vem junto na cozinha e nas listas.
- **Alertas:** pedido novo e cliente pedindo atendente (`conversation:handoff-requested`) tocam som, toast, notificação do
  navegador e contador no menu (`useOperationAlerts`). Pedido novo toca o "Yooo!" (`public/sounds/yo-longo.mp3`,
  `playNewOrderSound`); atendente, o bipe. Erro de ação vira toast (`toastStore`); botões travam enquanto a ação roda.
- **Entrega segue o pedido** (`UpdateOrderStatusUseCase.syncDelivery`); pedido cancelado/concluído não muda a entrega;
  "não entregue" exige motivo; entregador é escolhido em Entregas (`PATCH /delivery/:id/assign`).
- **Taxa no pedido do painel:** `POST /orders/delivery-fee/quote` mostra a taxa antes do pagamento; atendente pode ajustar (`feeAmount`).

## Conta da mesa

- Pedido de mesa entra na comanda aberta (`orders.comanda_id`; painel escolhe a comanda, sem comanda recusa com
  `table_comanda_required`; bot sem comanda segue sem). Pedido de mesa no painel não passa por pagamento: paga na conta.
- `GET /comandas/:id/bill` (consumo, pago, a receber), `POST /comandas/:id/settle` (`cashier:write`): partes do pagamento
  repartidas pelos pedidos (`allocateComandaPayments`), cada parte vira lançamento no caixa ligado ao pedido, pedidos
  abertos viram concluídos, comanda paga, mesa livre. Precisa de caixa aberto.
- `PATCH /comandas/:id/close` só encerra sem nada a receber; comanda encerrada não reabre. `PATCH /comandas/:id/transfer`
  troca de mesa (comanda + pedidos). Card da mesa mostra consumo e tempo; Mesas aparece para o caixa (`notHome`).

## App do garçom (`/garcom`)

- PWA de celular separado do painel (`apps/web/src/pages/waiter/`), instalável com o próprio manifest
  (`public/garcom.webmanifest`, escopo `/garcom`; o `index.html` e o `WaiterApp` trocam o `<link rel="manifest">`).
  Entra quem tem `orders:write` (cargo **Garçom** no seed: pedidos + clientes); login com `?next=/garcom` volta ao app.
- Mesas → comanda → lançar itens (`POST /orders`, tipo mesa, sem pagamento) → pedir a conta.
- Abrir comanda: `POST /tables/:id/comanda` aceita `{ customerId?, customerName?, customerPhone?, guestsCount? }`
  (corpo vazio continua valendo). Telefone acha o cliente com e sem o nono dígito; com nome e sem cadastro, cadastra.
  `comandas.guests_count` e `comandas.bill_requested_at` (migrations `0056` e `0057`).
- Pedir a conta: `POST /comandas/:id/request-bill` (`{ requested }`) → evento `comanda:bill_requested`; o painel avisa
  quem tem `cashier:write` e a mesa mostra "Conta pedida". Quem tem caixa também recebe pelo app (`ComandaBillModal`).
- Pedido pronto: `order:status_changed` traz `number`, `type`, `tableId`, `comandaId`; pedido de mesa pronto toca o bipe,
  vibra, notifica pelo service worker (`public/sw-notifications.js` abre a comanda) e fica em "Prontos para levar"
  (no aparelho) até o garçom tocar em "Levei". Com o app fechado não chega aviso (sem Web Push).
- Sem conexão (`pages/waiter/waiterOffline.ts`): mesas, cardápio e contas ficam no aparelho (`waiter-cache:<restaurante>:<usuário>`,
  até 12 h) e abrem na hora, atualizando por trás. Lançar pedido e pedir a conta vão para a fila (`waiter-outbox`) quando o
  servidor não responde e saem sozinhos quando volta; o pedido leva `id` gerado no aparelho e `POST /orders` com `id` já
  gravado devolve o mesmo pedido (não duplica). Abrir comanda precisa do servidor. Sair apaga cache, carrinhos e fila.
- Loja e nuvem (`pages/waiter/waiterServers.ts`, tela **Servidores e fila** em `/garcom/servidores`, abre sem login):
  endereço da API de cada um, modo Automático/Só loja/Só nuvem. No automático o app mede `/health` dos dois (10 s; 4 s
  com o atual fora) e usa a loja quando ela responde, senão a nuvem; nenhum → fila do celular. Login entra nos dois com a
  mesma conta (usuários são sincronizados); cada servidor tem a própria sessão (`waiter-servers`) e trocar troca o token
  do `authStore` e o endereço do cliente HTTP/WebSocket (`setApiServerOverride`). Servidor que estava fora entra sozinho
  quando volta (senha só na memória) ou pelo botão Entrar da tela. A fila mostra pendentes, recusados e os últimos enviados
  (por qual servidor); 404 nos primeiros 5 min é atraso da sincronização e tenta de novo. A loja precisa de HTTPS e da
  origem do app em `ALLOWED_ORIGINS`. Renovação de sessão que falha por rede não desloga mais (só recusa do servidor).
- Número do pedido com sincronização (`nextOrderNumber`): loja usa ímpares e nuvem pares, sempre acima do maior número
  já gravado (inclusive o que veio do outro lado), então `#N` não repete entre os dois.

## Painel: base comum

- Status de entrega e de nota em `constants/statusLabels.ts` (pedido em `orderLabels.ts`): mesmo nome e cor em toda tela.
- Números e datas em pt-BR com `formatBRL`/`formatDecimal`/`formatPercent`/`formatMinutes`/`formatUnitCost` (`lib/listing.ts`);
  nada de `toFixed` na tela. Endereço da entrega por `formatDeliveryAddress` (aceita o formato antigo rua/número).
- Escolha numa lista sempre com `components/ui/Select.tsx` (`FilterSelect` para filtro com "Todos"), nunca `<select>` nativo:
  lista presa ao botão num portal no computador (modal não corta, Esc não fecha o modal) e folha de baixo no celular,
  com o nome do campo de título; busca liga sozinha com mais de 8 opções.
- Confirmação com `confirmDialog` (`stores/confirmStore.ts`, desenhado pelo `ConfirmHost`), erro com `toast`; nunca
  `window.confirm`/`prompt`/`alert`. Botão novo usa `components/ui/Button.tsx`.
- Configurações: nome e WhatsApp do restaurante gravam em `establishments` (`ESTABLISHMENT_PROFILE_KEYS`); pedido mínimo
  é `min_order_value` (o que o bot lê). Nome digitado no pedido do painel vai em `orders.customer_name` (migration `0051`).

## Agenda (encomendas e reservas)

`@adatechnology/scheduling-module` (schema `scheduling`, exige `btree_gist`), código em `apps/api/src/modules/agenda/`.
A API espelha o restaurante no SDK sozinha: 3 linhas de produção (até 3 encomendas por faixa de 15 min)
e uma agenda por mesa, com o horário de `opening_time`/`closing_time`/`working_days` no momento da criação.
Encomenda ocupa a faixa antes de o pedido existir (e libera se o pedido falhar); reserva escolhe a menor mesa livre.
No bot, o cliente agenda **antes** de escolher os itens: com horários livres, o menu da saudação troca
"Reservar mesa" por "📅 Agendar pedido" (`schedule:start`; reservar segue por escrito) → dia → horário → categorias com
"📅 Agendado para…" (escrever *agendar* muda; o menu de dias ganha "⚡ Pedir para agora"). Voltar dos dias volta ao menu.
Confirmar o pedido não pergunta mais "agora ou agendar".
Voltar (id `0`) nos dias, horários, forma de receber (→ resumo), pagamento (→ forma de receber) e "voltar" no endereço.
Painel: página **Agenda** (`GET /agenda?date=`). Cardápio com tamanhos: `products.variant_group`/`variant_label`.
Seed do Yuyaki: `bun run --cwd apps/api db:seed:yuyaki`.

**Foto do produto:** Catálogo → Editar produto → Foto no cardápio (`PUT/DELETE /catalog/products/:id/image`, data URL).
A API reduz para 800 px em WebP (`productImage.ts`) e grava os bytes em `product_images` (o disco do Railway some no deploy);
`products.image_version` é o hash e vai no `?v=` de `GET /public/products/:id/foto.webp` (cache imutável). O cardápio
online mostra a foto no card e na folha do item (tamanhos do mesmo grupo usam a primeira foto). Fotos do Yuyaki:
`seeds/data/yuyaki/fotos.csv` (arquivo local ou URL) com `db:seed:yuyaki -- --fotos` (só quem está sem foto; `--fotos-forcar` regrava).

**Cadastro do cardápio online (opcional, sem senha):** `POST /public/storefront/:id/login/code` manda um código de 6
números pelo WhatsApp do restaurante (mensagem do bot; código com hash no Redis por 10 min, 5 tentativas, 3 envios por
15 min por telefone). Janela de 24 h fechada → erro `whatsapp_window_closed` e a página pede um "oi" no WhatsApp antes.
`POST …/login/verify` devolve uma sessão assinada (HMAC com `STOREFRONT_TRACKING_SECRET`/`JWT_SECRET`, 90 dias, só daquele
restaurante) e `GET …/me` (Bearer) traz endereços das últimas entregas, pagamento do último pedido e os 5 últimos pedidos
para repetir. Sessão inválida responde 403 (`storefront_session_expired`), não 401, para não acionar a renovação do painel.
Código em `apps/api/src/modules/storefront/application/StorefrontAccountService.ts` e
`apps/web/src/pages/storefront/StorefrontAccount.tsx`.

**Animações do cardápio online** (`apps/web/src/pages/storefront/storefrontMotion.tsx`): itens sobem ao entrar na tela
(`data-reveal`), a foto voa até o carrinho ao adicionar (`flyToCart` até `[data-cart-target]`), números dão um pulo ao mudar
(`key` com o valor). Na seleção: o fundo da categoria ativa desliza entre as categorias, tamanho/entrega/pagamento
escolhidos afundam e voltam com mola e o check aparece girando (`MOTION.select`/`check`/`hop`), botão de adicionar solta
uma onda (`ping`). Toques japoneses (`storefrontOriental.tsx`): pétalas de sakura caem no topo por 9 s ao abrir,
o hashi pega a foto e leva ao carrinho (`flyToCart`) e o selo hanko "受付" carimba o "Pedido enviado!" (kanji desenhado em SVG com contornos da fonte IPA, porque nem todo celular tem fonte japonesa). A página do pedido
aplica a cor do restaurante (busca o cardápio pelo id). O selo toca o "Yo!" curto (`public/sounds/yo-curto.mp3`,
`storefrontSound.ts`) e a página de acompanhamento toca o "Yooo!" longo quando o pedido anda ou o pagamento cai
(não na primeira leitura); o alto-falante (`SoundToggle`, no topo do cardápio e do acompanhamento) desliga (`storefront-sound` no aparelho).
**Meus pedidos** (`MyOrdersSheet.tsx`): botão "Pedidos" no topo do cardápio, link na Minha conta e no acompanhamento
(`/cardapio/:id?pedidos=1`). Junta os pedidos da conta (`/me` traz até 10, com `status`, `paymentStatus` e `trackingToken`,
cancelados inclusive) com os 10 últimos feitos no aparelho (`storefront-orders:<id>`); em andamento atualiza a cada 15 s.
O cartão do topo mostra o status do último pedido. Carrinho não tem som. Só transform/opacity, e tudo some com "reduzir movimento" do sistema.

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
