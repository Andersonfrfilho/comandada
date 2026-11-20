# Marketplaces: iFood e 99Food

Pedidos do iFood e da 99Food entram no painel e na cozinha como qualquer outro pedido, com o selo
**iFood #8312** / **99Food #4421** (o número que o entregador da plataforma pede no balcão). O que a equipe
faz no painel volta para a plataforma. Tudo fica **desligado** até as credenciais existirem.

Regras de cada plataforma: [iFood](integracoes/ifood.md) e [99Food](integracoes/99food.md) (a base completa da
99Food fica nos arquivos privados do projeto, porque a documentação dela é confidencial).

## Como funciona

```
iFood / 99Food ──polling 30 s (ou webhook)──▶ worker ──▶ MarketplaceOrderService ──▶ CreateOrderUseCase
                                                                │                       (painel, cozinha)
painel muda status ──▶ UpdateOrderStatusUseCase ──onStatusChanged──┘──▶ ação na plataforma
```

Os conectores ficam no SDK `adatechnology-packages`, para outros projetos usarem:

| Pacote | Papel |
|---|---|
| `@adatechnology/marketplace-contracts` | Tipos comuns (pedido, evento, ação), porta `MarketplaceProvider`, regra de status e utilitários HTTP |
| `@adatechnology/ifood-marketplace-provider` | iFood Merchant API, Financial v3 e Review v2 (`IfoodMarketplaceProvider`) |
| `@adatechnology/opendelivery-marketplace-provider` | Padrão Open Delivery (Abrasel), usado pela 99Food e outras plataformas |

Mudança no conector é feita no SDK (com changeset), publicada e só então a versão sobe aqui.

Código do ComandAdA em `apps/api/src/modules/marketplaces/`:

| Arquivo | Papel |
|---|---|
| `domain/Marketplace.ts`, `domain/statusSync.ts` | Reexportam `@adatechnology/marketplace-contracts` (tipos, porta `MarketplaceProvider`, status painel → plataforma) |
| `infra/marketplaceConfig.ts` | Lê as variáveis e liga cada plataforma |
| `application/MarketplaceOrderService.ts` | Importa pedido, cancela, avisa status, negociações, financeiro e avaliações |
| `infra/http/MarketplacePanelController.ts` | Rotas `/marketplaces/*` do painel |
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
| Concluído, entrega própria | — (o iFood conclui) | `delivered` |
| Concluído, retirada | — (o iFood conclui) | `pickedUp` |

Passo pulado no painel sai antes, na ordem: o aceite vem primeiro e o
"pronto" sai antes do "saiu para entrega" (exigência do iFood). Falha ao avisar a plataforma vai para o log e
não desfaz nada no painel. Cancelado na plataforma (cliente, portal, a própria plataforma) cancela no painel
com o motivo e não volta em eco.

### Cancelar e negociar

- **Cancelar no iFood / na 99Food** (quadro da plataforma no detalhe do pedido): lista os motivos que a
  plataforma aceita naquele momento e manda o escolhido. O pedido **continua aberto** até a plataforma
  confirmar; se ela recusar, o painel toca o alerta e anota no pedido. O "Cancelar pedido" comum some
  nesses pedidos enquanto a plataforma estiver ligada (o cancelamento pelo status continua como reserva).
- **Negociações** (cliente pede cancelamento, reembolso ou mais prazo): ficam em `marketplace_disputes`,
  tocam o alerta e aparecem no pedido com o prazo correndo. Aceitar, recusar com motivo ou, no iFood,
  propor reembolso parcial (até o máximo) ou mais tempo. Sem resposta, a plataforma decide sozinha.
- Mudança de itens ou de endereço feita na plataforma vira linha na observação do pedido.

### Financeiro e avaliações

- **Financeiro → Marketplaces** (aparece só com plataforma ligada e com API financeira): vendas com bruto,
  comissão, taxas, subsídios e líquido, repasses com data e situação, totais e planilha CSV (abre no Excel
  em português). Período de até 90 dias, quebrado no máximo de cada plataforma (31 dias). Serve para
  conferir o extrato do banco.
- **Relatórios → Avaliações iFood**: nota, lista e resposta pública (10 a 300 caracteres, uma resposta por
  avaliação), com o link da política de avaliações do iFood. A 99Food não tem API de avaliações.
- Ficaram de fora por enquanto: lançamentos financeiros com impacto no repasse, antecipações e arquivo de
  conciliação do iFood (necessários antes de pedir a homologação Financial), e os módulos de logística e
  analytics das plataformas (o painel já tem Entregas e Relatórios próprios).

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
2. Cadastro no portal de desenvolvedor da 99Food (developer-food.99app.com, com aceite de confidencialidade):
   criar o app e pegar as credenciais de teste.
3. Ligar no staging com `FOOD99_*`, simular pedidos e conferir o checklist do arquivo privado
   `marketplaces/99food-conhecimento.md`.
4. Preencher o código do PDV dos itens no Portal 99Food. Depois de integrado, a loja não aceita pedido à mão
   no app da 99.

Nada disso roda em produção sem os passos acima: o código fica pronto e desligado.
