# Marketplaces: iFood e 99Food

Pedidos do iFood e da 99Food entram no painel e na cozinha como qualquer outro pedido, com o selo
**iFood #8312** / **99Food #4421** (o número que o entregador da plataforma pede no balcão). O que a equipe
faz no painel volta para a plataforma. Tudo fica **desligado** até as credenciais existirem.

## Como funciona

```
iFood / 99Food ──polling 30 s (ou webhook)──▶ worker ──▶ MarketplaceOrderService ──▶ CreateOrderUseCase
                                                                │                       (painel, cozinha)
painel muda status ──▶ UpdateOrderStatusUseCase ──onStatusChanged──┘──▶ ação na plataforma
```

Código em `apps/api/src/modules/marketplaces/`:

| Arquivo | Papel |
|---|---|
| `domain/Marketplace.ts` | Tipos comuns (pedido, evento, ação) e a porta `MarketplaceProvider` |
| `domain/statusSync.ts` | Status do painel → ação na plataforma, só para a frente |
| `infra/providers/IfoodMarketplaceProvider.ts` | iFood Merchant API (`merchant-api.ifood.com.br`) |
| `infra/providers/OpenDeliveryMarketplaceProvider.ts` | Padrão Open Delivery (Abrasel), usado pela 99Food |
| `infra/marketplaceConfig.ts` | Lê as variáveis e liga cada plataforma |
| `application/MarketplaceOrderService.ts` | Importa pedido, cancela, avisa status |
| `infra/workers/MarketplacePollingWorker.ts` | Fila `marketplace-polling`, a cada 30 s |
| `infra/http/MarketplaceWebhookController.ts` | `POST /webhooks/marketplaces/:platform` |

Outra plataforma no padrão Open Delivery (Keeta, Aiqfome…) é só mais um bloco em `marketplaceConfig.ts`
com o mesmo `OpenDeliveryMarketplaceProvider`. Plataforma com API própria implementa `MarketplaceProvider`.

### Pedido novo

- O evento de pedido novo (`PLACED` no iFood, `CREATED` no Open Delivery) busca o pedido e grava com
  `channel = ifood | 99food`, `orders.code` = número da plataforma, nome do cliente em `customer_name`.
- **Preço é o da plataforma** (com adicionais), não o do cardápio. O item é ligado ao produto pelo
  **código do PDV** cadastrado na plataforma (id do produto ou código de barras) ou pelo nome igual (sem
  acento e caixa). Sem vínculo, entra com o nome da plataforma e a observação "sem vínculo no cardápio"
  (a cozinha vê; o estoque não baixa esse item).
- Adicionais e observação do item vão em `order_items.notes`; pagamento, troco, desconto, quem entrega,
  código de coleta e telefone/localizador vão na observação do pedido.
- **Entregador da plataforma:** o pedido não entra em Entregas e o total do painel é só itens (a taxa é da
  plataforma). **Entrega própria:** entra em Entregas com a taxa que a plataforma cobrou.
- Não cria cliente nem manda WhatsApp: o telefone do iFood é um 0800 com localizador.
- Aceite automático (`MARKETPLACE_AUTO_CONFIRM=true`, padrão). Com `false`, o aceite sai junto com o
  primeiro passo do painel (Em preparo).
- Idempotente: `marketplace_events` guarda os eventos tratados e `marketplace_orders` liga o pedido da
  plataforma ao do painel (único por plataforma + id). Evento que falhou não recebe acknowledgment e volta.

### Status do painel → plataforma

| Painel | iFood | Open Delivery (99Food) |
|---|---|---|
| Em preparo | `startPreparation` | `preparing` |
| Pronto | `readyToPickup` | `readyForPickup` |
| Em entrega (só entrega própria) | `dispatch` | `dispatch` |
| Concluído (só entrega própria) | — (o iFood conclui) | `delivered` |
| Cancelado | `requestCancellation` com o código da lista do pedido | `requestCancellation` com código do padrão |

Falha ao avisar a plataforma vai para o log e não desfaz nada no painel. Cancelado na plataforma
(cliente, portal, a própria plataforma) cancela no painel com o motivo "Cancelado no iFood" e não volta em eco.

## Variáveis (API e worker)

Ver `apps/api/.env.example`. Resumo:

| Variável | Para quê |
|---|---|
| `IFOOD_ENABLED`, `FOOD99_ENABLED` | `true` liga a plataforma (e a fila de polling) |
| `IFOOD_CLIENT_ID`, `IFOOD_CLIENT_SECRET` | Credenciais do app no Portal do Desenvolvedor iFood |
| `IFOOD_MERCHANT_IDS` | Lojas no iFood (vírgula); aceita o antigo `IFOOD_MERCHANT_ID` |
| `FOOD99_API_BASE_URL`, `FOOD99_TOKEN_URL` | Endereços da API Open Delivery que a 99Food informa |
| `FOOD99_CLIENT_ID`, `FOOD99_CLIENT_SECRET`, `FOOD99_MERCHANT_IDS` | Credenciais e lojas na 99Food |
| `IFOOD_ESTABLISHMENT_ID`, `FOOD99_ESTABLISHMENT_ID` | Restaurante do ComandAdA que recebe os pedidos |
| `MARKETPLACE_AUTO_CONFIRM` | `false` deixa o aceite para o painel |

O polling roda onde as filas rodam (serviço worker, ou a API sem `API_QUEUE_WORKERS=false`). O webhook é
opcional: URL `https://<API_PUBLIC_URL>/webhooks/marketplaces/ifood` (assinatura `X-IFood-Signature`) ou
`/webhooks/marketplaces/99food` (`X-App-Signature`), HMAC-SHA256 do corpo com o client secret.

## Passo a passo do cadastro (resumo)

### iFood
1. Criar conta e organização (CNPJ da empresa que desenvolve) no Portal do Desenvolvedor: developer.ifood.com.br.
2. Criar um aplicativo **centralizado** (um restaurante ou rede própria) com os módulos Order, Events e Merchant.
   Para vender o ComandAdA a vários restaurantes, depois vira app **distribuído** (autorização por código).
3. Pegar `clientId`/`clientSecret` de teste e a loja de teste; ligar no staging e simular pedidos.
4. Pedir a homologação no portal. O iFood confere polling a cada 30 s, acknowledgment de todo evento, aceite,
   preparo/pronto/despacho, cancelamento pelos dois lados e a exibição de itens, observações, pagamento e troco.
5. Aprovado: credenciais de produção; o dono da loja autoriza o app e informa o `merchantId`
   (Portal do Parceiro). Preencher o código PDV dos itens no cardápio do iFood.

### 99Food
1. A loja precisa estar ativa na 99Food (Portal: merchant.99app.com).
2. A 99Food não tem portal público de desenvolvedor: a integração de PDV é feita pelo padrão Open Delivery
   (Abrasel). Pedir à 99Food (gerente de conta ou suporte do Portal 99Food) a integração como **software
   house / PDV próprio** no Open Delivery: credenciais, URL da API e do token, ambiente de teste e homologação.
3. Preencher o código do PDV ("Extra ID") dos itens no Portal 99Food e fazer os testes de validação.
4. Depois de integrado, a loja não aceita pedido à mão no app da 99.

Nada disso roda em produção sem os passos acima: o código fica pronto e desligado.
