# 99Food: resumo da integração

A documentação técnica da 99Food é confidencial (compartilhada só com parceiros). Por isso este repositório,
que é público, guarda só o resumo. A base de conhecimento completa (autenticação, eventos, campos do pedido,
motivos de cancelamento, financeiro e checklist da 99Food) fica nos arquivos privados do projeto:
`marketplaces/99food-conhecimento.md`.

## Decisões

- **Protocolo nativo da 99Food por padrão.** É o que a 99Food recomenda e o único com API financeira e
  gestão de loja. Pedidos chegam por **webhook** assinado (não há polling). Pacote do SDK
  `@adatechnology/food99-marketplace-provider`.
- **Open Delivery como alternativa** (`FOOD99_PROTOCOL=opendelivery`), pelo conector genérico
  `OpenDeliveryMarketplaceProvider` (`@adatechnology/opendelivery-marketplace-provider`), que também serve para outras plataformas do padrão.
- **Sem avaliações:** a 99Food não tem API de avaliações.

## O que o ComandAdA faz

- Pedido novo entra no painel e na cozinha com o número do dia da 99Food no selo e o id completo na
  observação, e é aceito sozinho (a 99Food cancela se ninguém aceitar em poucos minutos).
- Status do painel volta para a 99Food: aceito, pronto, saiu e entregue (entrega da loja), retirado
  (retirada no balcão). Antes de "saiu", o "pronto" sai sozinho.
- **Cancelar na 99Food:** botão no pedido com os motivos aceitos; o pedido fecha quando a 99Food confirmar.
- **Pedidos de cancelamento e de reembolso do cliente** aparecem no pedido com o prazo, aviso sonoro e os
  botões Aceitar/Recusar. Sem resposta, a 99Food decide sozinha (recusa o cancelamento, aprova o reembolso).
- Dinheiro com entregador da 99Food, cupons (parte da loja e da 99Food), CPF na nota e talheres vão na
  observação do pedido.
- **Financeiro → Marketplaces:** vendas com comissão e taxas, valor líquido, repasses semanais e planilha.

## Ligar

Variáveis em `apps/api/.env.example` (`FOOD99_*`). Webhook a cadastrar no portal da 99Food:
`https://<API_PUBLIC_URL>/webhooks/marketplaces/99food`. Antes de produção, seguir o checklist do arquivo
privado e validar no ambiente de teste da 99Food.
