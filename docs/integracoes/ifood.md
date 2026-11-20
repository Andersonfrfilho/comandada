# iFood: base de conhecimento da integração

Resumo do que a documentação oficial do iFood exige e recomenda (developer.ifood.com.br, lida em
novembro de 2026), e de como o ComandAdA atende cada ponto. Use este arquivo antes de mexer em
`apps/api/src/modules/marketplaces/`: os prazos e as regras abaixo são o que reprova uma homologação.

Fontes: Guia de implementação de Order, Eventos de pedido, Cancelamento de pedidos, Guia de negociação
(Plataforma de Negociação), Critérios de homologação (Order, Events, Financial, Review) e a Referência
de API (OpenAPI de Authentication, Events, Order, Financial v2/v2.1/v3, Review v1/v2).

## 1. Conta, app e homologação

- Conta **profissional (CNPJ)** no Portal do Desenvolvedor. Conta CPF/estudante não homologa.
- O cadastro cria um **app de teste** e uma **loja de teste**. Para produção, cria-se um app da
  categoria **PDV**. App centralizado: um `clientId`/`clientSecret` para todas as lojas; cada loja
  autoriza o app no Portal do Parceiro e o `merchantId` dela entra em `IFOOD_MERCHANT_IDS`.
- **Order + Events** são homologados juntos por um assistente automático (Portal do Desenvolvedor →
  Homologação → Nova homologação). Só o dono do app inicia; uma tentativa a cada **4 horas**.
  Etapas: conectividade (loja aparece aberta e app autenticado), receber e confirmar pedidos com
  acknowledgment de todos os eventos, cancelar consultando `cancellationReasons`, despachar (entrega
  própria: `readyToPickup` e depois `dispatch`) e concluir. Até 5 capturas de tela por etapa.
- **Catalog, Review e Financial** são homologados depois, por chamado de suporte. Financial sempre em
  chamado separado, com questionário e vídeos dos cenários; no teste usa o header
  `x-request-homologation: true`.

## 2. Autenticação

- `POST https://merchant-api.ifood.com.br/authentication/v1.0/oauth/token`, formulário
  `grantType=client_credentials`, `clientId`, `clientSecret`. Resposta `{ accessToken, expiresIn }`
  (cerca de 6 h).
- Critério de homologação: **renovar só quando vencer**, não antes. O ComandAdA guarda o token até o
  vencimento e, se a API responder 401, pede outro uma vez e repete a chamada.
- Respeitar os limites de requisição; em 429, esperar e tentar de novo com backoff.

## 3. Eventos (polling ou webhook)

- Polling: `GET /events/v1.0/events:polling` **a cada 30 s** (nem mais, nem menos), com o header
  `x-polling-merchants` (até 100 lojas por chamada). Filtros opcionais `types`, `groups`,
  `categories`: o que fica de fora é confirmado automaticamente pelo iFood. 204 = nada novo.
- O polling também é o **sinal de presença** da loja: parar de consultar fecha a loja no app.
- Acknowledgment: `POST /events/v1.0/events/acknowledgment` com `[{ "id": "..." }]`, resposta 202.
  A homologação cobra acknowledgment de **todos** os eventos recebidos; evento sem acknowledgment volta
  na próxima consulta. O ComandAdA confirma tudo o que tratou (inclusive os eventos que só registra) e
  deixa sem confirmar apenas o que falhou, para tentar de novo.
- Webhook (alternativa): HTTPS, responder em até **30 s**, assinatura `X-IFood-Signature` = HMAC-SHA256
  (hex) do corpo cru com o `clientSecret`. Rota no ComandAdA: `POST /webhooks/marketplaces/ifood`.
- Deduplicação é critério de homologação: a tabela `marketplace_events` guarda `(platform, event_id)`.

Estrutura do evento: `id`, `code`, `fullCode`, `orderId`, `merchantId`, `salesChannel`, `category`
(`FOOD`/`GROCERY`), `createdAt` (UTC) e `metadata`.

| Código | fullCode | O que é | O que o ComandAdA faz |
|---|---|---|---|
| PLC | PLACED | Pedido novo | Busca o pedido, cria no painel e na cozinha, confirma (aceite automático) |
| CFM | CONFIRMED | Pedido confirmado | Marca confirmado |
| PRS | PREPARATION_STARTED | Preparo iniciado | Registra |
| RPS | RECOMMENDED_PREPARATION_START | Horário sugerido pelo Preparo Inteligente | Registra |
| RTP | READY_TO_PICKUP | Pronto | Registra |
| DSP | DISPATCHED | Saiu para entrega | Registra |
| CON | CONCLUDED | Concluído | Marca concluído na plataforma |
| CAR | CANCELLATION_REQUESTED | Pedido de cancelamento (loja, cliente ou sistema) | Aguarda CAN ou CARF |
| CARF | CANCELLATION_REQUEST_FAILED | iFood recusou o cancelamento | Avisa no pedido (motivo em `metadata`) |
| CAN | CANCELLED | Cancelado | Cancela no painel (só aqui o cancelamento vale) |
| HSD | HANDSHAKE_DISPUTE | Cliente abriu negociação | Abre a negociação no painel com prazo |
| HSS | HANDSHAKE_SETTLEMENT | Negociação encerrada | Fecha a negociação com o resultado |
| OPA | ORDER_PATCHED | Itens alterados ou cancelamento parcial | Relê o pedido e anota a mudança |
| DAR | DELIVERY_ADDRESS_CHANGE_REQUESTED | Cliente mudou o endereço | Anota o endereço novo no pedido |
| ADR, GTO, AAO, CLT, AAD | Logística do entregador iFood | Registra |
| DRGO, DRDO, DRCR | Devolução ao restaurante (DRCR traz o código) | Registra |
| SPS, SPE | Separação (só mercado) | Registra |

## 4. Pedido

- `GET /order/v1.0/orders/{id}` sempre **antes** de confirmar ou cancelar. O PLACED pode chegar antes
  do pedido existir: 404 logo depois do evento deve ser tentado de novo com backoff por até 10 min.
  Os detalhes ficam disponíveis por 7 dias.
- Campos usados: `displayId` (número curto do pedido, vai na comanda), `orderType`
  (`DELIVERY`, `TAKEOUT`, `INDOOR`, `DINE_IN`), `orderTiming` (`IMMEDIATE`/`SCHEDULED`),
  `schedule.deliveryDateTimeStart`, `indoor.table`, `takeout.takeoutDateTime`, `customer`
  (`name`, `documentNumber` = CPF/CNPJ para a nota, `phone.number` + `phone.localizer`),
  `items[]` (`totalPrice` já inclui os complementos, `observations`, `options[]`), `total`
  (`subTotal`, `deliveryFee`, `benefits`, `additionalFees`, `orderAmount`), `benefits[]` com
  `sponsorshipValues` (quem paga o cupom: `IFOOD` ou `MERCHANT`), `payments.methods[]` (`method`,
  `type` ONLINE/OFFLINE, `prepaid`, `card.brand`, `cash.changeFor`), `delivery` (`deliveredBy`
  `IFOOD`/`MERCHANT`, `pickupCode`, `deliveryAddress`).
- Homologação exige mostrar: **bandeira do cartão**, **troco**, **valor do cupom e quem paga**,
  observações dos itens, código de coleta e **CPF/CNPJ** quando vierem. O ComandAdA põe tudo isso na
  observação do pedido, que aparece na cozinha e no painel.

## 5. Ciclo do pedido e prazos

```
PLACED → CONFIRMED → (PREPARATION_STARTED) → READY_TO_PICKUP → DISPATCHED → CONCLUDED
                                    └──────────── CANCELLED (a qualquer momento, com regras)
```

- **Confirmar em até 8 minutos** (`POST /orders/{id}/confirm`, 202, idempotente). Depois disso o iFood
  cancela sozinho. Vale também para pedido agendado.
- `startPreparation` é opcional. `readyToPickup` é **obrigatório** em TAKEOUT, DINE_IN/INDOOR e
  DELIVERY.
- Entrega própria: `readyToPickup` **antes** de `dispatch`. O ComandAdA manda o "pronto" sozinho se o
  pedido sair para entrega sem ter passado por "pronto".
- Entrega do iFood: a conclusão é do iFood (o entregador confirma). Entrega própria pode validar o
  código de entrega (`verifyDeliveryCode`); retirada pode validar o código de coleta.
- Conclusão automática: entrega iFood 6 h; entrega própria 4 h (agendado: depois de `scheduling.to`).

Mapa do painel para o iFood: em produção → `startPreparation`; pronto → `readyToPickup`; saiu para
entrega (só entrega própria) → `dispatch`. A ação nunca volta atrás e nunca sai depois de cancelado
ou concluído (`domain/statusSync.ts`).

## 6. Cancelamento pelo restaurante

1. `GET /orders/{id}/cancellationReasons` → `[{ cancelCodeId, description }]`; **204 = não pode mais
   cancelar**. A homologação exige mostrar esses motivos para quem cancela.
2. `POST /orders/{id}/requestCancellation` com `{ reason, cancellationCode }` → 202.
3. O cancelamento só vale quando chega **CAN**. Se chegar **CARF**, o iFood recusou (motivo em
   `metadata.CANCELLATION_REQUEST_FAILED_REASON`); erros 400 comuns: `OrderExceededCancellationDeadline`,
   `OrderHasACancellationInProgress`.

Códigos: 501 problemas de sistema, 502 pedido em duplicidade, 503 item indisponível, 504 sem motoboy,
505 cardápio desatualizado, 506 fora da área, 507 golpe/trote, 508 fora do horário, 509 dificuldades
internas, 511 área de risco, 512 abrirá mais tarde, 513 (outros). Tratar como texto e usar a lista
que a API devolve. Cancelar demais gera penalidade (loja fechada temporariamente).

No painel: pedido do iFood tem "Cancelar no iFood", que lista os motivos da API (o "Cancelar pedido"
comum some nesses pedidos). O pedido continua aberto até o CAN; com CARF, o painel toca o alerta e anota
a recusa no pedido.

## 7. Plataforma de negociação (disputas)

- Evento **HSD** com `metadata`: `disputeId`, `action` (`CANCELLATION`, `PARTIAL_CANCELLATION`),
  `handshakeType` (`AFTER_DELIVERY`, `AFTER_DELIVERY_PARTIALLY`, `PREPARATION_TIME`, `DELAY`),
  `message`, `expiresAt`, `timeoutAction`, `alternatives[]` (`REFUND` com `maxAmount`,
  `ADDITIONAL_TIME` com minutos e motivos aceitos), itens (`garnishItems`) e fotos (`evidences`).
- Responder **antes de `expiresAt`**. Sem resposta, o iFood aplica a ação automática (em geral
  reembolso ao cliente).
  - `POST /order/v1.0/disputes/{disputeId}/accept` (corpo opcional `{ reason }`)
  - `POST /order/v1.0/disputes/{disputeId}/reject` com `{ reason }`
  - `POST /order/v1.0/disputes/{disputeId}/alternatives/{alternativeId}` com
    `{ type: "REFUND", metadata: { amount: { value, currency } } }` ou
    `{ type: "ADDITIONAL_TIME", metadata: { additionalTimeInMinutes, additionalTimeReason } }`
- Durante o preparo só há aceitar ou recusar. Em atraso: aceitar ou propor mais tempo.
- Evento **HSS** fecha: `status` `ACCEPTED`, `REJECTED`, `ALTERNATIVE_REPLIED` ou `EXPIRED`.
- Processar esses eventos é critério de homologação. No ComandAdA as negociações ficam em
  `marketplace_disputes`, tocam o alerta do painel e aparecem no detalhe do pedido com contagem regressiva
  e os botões Aceitar / Recusar / Fazer proposta (reembolso até o máximo ou mais tempo).

## 8. Financeiro (Financial API)

Base `https://merchant-api.ifood.com.br/financial/v3.0`:

- `GET /merchants/{merchantId}/sales?beginSalesDate&endSalesDate&page` → vendas com `saleGrossValue`
  (itens, entrega, serviço), `benefits` (com patrocinador), `payments` (método, bandeira,
  responsável) e `billingSummary` (`saleBalance` = valor líquido da venda e `billingEntries` com
  comissão, taxa de pagamento, entrega etc.).
- `GET /merchants/{merchantId}/settlements?beginPaymentDate&endPaymentDate` → repasses com
  `closingItems` (tipo `REPASSE`, `BOLETO`, `REGISTRO_RECEBIVEIS`; valor, status, data de pagamento,
  conta).
- `GET /merchants/{merchantId}/financial-events?beginDate&endDate&page&size` (máx. 33 dias) → cada
  lançamento com `hasTransferImpact`. **Filtrar `hasTransferImpact`** é o primeiro motivo de reprovação.
- `GET /merchants/{merchantId}/anticipations`; `POST /merchants/{merchantId}/reconciliation/on-demand`
  `{ competence }` e `GET .../on-demand/{requestId}` (arquivo de conciliação; 409 = reaproveitar o
  `requestId`).

Homologação Financial pede: mostrar número e data do pedido, status, forma de pagamento e
responsável, bruto, líquido, comissões e taxas; datas e status dos repasses; exportar CSV; tratar
401/429 com backoff. O ComandAdA mostra vendas, taxas e repasses em **Financeiro → Marketplaces**
(com CSV). Lançamentos financeiros, antecipações e o arquivo de conciliação ficam para a próxima etapa,
antes de pedir a homologação Financial.

## 9. Avaliações (Review API v2)

Base `https://merchant-api.ifood.com.br/review/v2.0`:

- `GET /merchants/{merchantId}/reviews?page&pageSize(≤50)&dateFrom&dateTo&addCount=true`
- `GET /merchants/{merchantId}/reviews/{reviewId}`
- `POST /merchants/{merchantId}/reviews/{reviewId}/answers` com `{ text }` (10 a 300 caracteres; só
  avaliação `NOT_REPLIED`, senão 409/422)
- `GET /merchants/{merchantId}/summary` → `{ totalReviewsCount, validReviewsCount, score }`

Homologação Review: paginação, filtro por data, resposta válida e inválida, resumo e **link para a
Política de Avaliações do iFood** (`https://portal.ifood.com.br/evaluation-policies`) visível na tela.
No ComandAdA: **Relatórios → Avaliações iFood**.

## 10. Variáveis de ambiente

| Variável | Uso |
|---|---|
| `IFOOD_ENABLED` | `true` liga a integração (padrão desligado) |
| `IFOOD_CLIENT_ID`, `IFOOD_CLIENT_SECRET` | Credenciais do app |
| `IFOOD_MERCHANT_IDS` | Lojas, separadas por vírgula |
| `IFOOD_ESTABLISHMENT_ID` | Restaurante do ComandAdA que recebe os pedidos |
| `IFOOD_API_BASE_URL` | Opcional (padrão `https://merchant-api.ifood.com.br`) |
| `MARKETPLACE_AUTO_CONFIRM` | `false` deixa o aceite para a equipe (cuidado com os 8 min) |

## 11. Checklist antes de pedir homologação

- [ ] Polling a cada 30 s rodando no worker (`API_QUEUE_WORKERS` ligado) e loja aparecendo aberta.
- [ ] Pedido de teste entra no painel e é confirmado em menos de 8 min.
- [ ] Todos os eventos com acknowledgment (conferir no log que nada fica voltando).
- [ ] Cancelamento pelo painel mostra os motivos do iFood e o pedido só cancela depois do CAN.
- [ ] Pedido com entrega própria: pronto e depois saiu para entrega.
- [ ] Negociação de teste (cliente pede cancelamento) aparece no painel e é respondida.
- [ ] Comanda mostra bandeira, troco, cupom e quem paga, observações, código de coleta e CPF.
