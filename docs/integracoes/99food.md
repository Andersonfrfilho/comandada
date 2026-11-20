# 99Food: resumo da integração

A documentação técnica da 99Food é confidencial (compartilhada só com parceiros). Por isso este repositório,
que é público, não traz nada dela. A base de conhecimento completa fica nos arquivos privados do projeto:
`marketplaces/99food-conhecimento.md`.

## Situação

- **Hoje:** a 99Food entra pelo padrão público **Open Delivery** (Abrasel), pelo conector genérico
  `OpenDeliveryMarketplaceProvider` (pacote `@adatechnology/opendelivery-marketplace-provider` do SDK), que também serve para outras plataformas do padrão.
- **Conector próprio da 99Food:** pronto e testado, mas guardado fora do repositório (arquivos privados do
  projeto, `marketplaces/food99-nativo/`) até decidir onde ele pode morar sem expor a documentação confidencial.
  É o caminho que a 99Food recomenda e o único com dados financeiros pela API.
- **Sem avaliações:** a 99Food não oferece API de avaliações.

## O que o ComandAdA faz com a 99Food (Open Delivery)

- Pedido novo entra no painel e na cozinha com o número da 99Food no selo e é aceito sozinho.
- Status do painel volta para a 99Food (em preparo, pronto, saiu, entregue, retirado).
- **Cancelar na 99Food:** botão no pedido com os motivos do padrão; o pedido fecha quando a 99Food confirmar.

## Ligar

Variáveis `FOOD99_*` em `apps/api/.env.example`. Antes de produção, seguir o checklist do arquivo privado e
validar no ambiente de teste da 99Food.
