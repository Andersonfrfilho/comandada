# Workflows n8n

Importe os arquivos `.json` desta pasta diretamente no n8n (Menu → Import Workflow).

Ative somente os workflows correspondentes às features habilitadas no `.env`.

> **Importante — n8n 2.x:** Code nodes rodam em sandbox isolado onde `process.env` não está disponível. Todas as variáveis de runtime (API keys, flags de feature, configurações de horário) são lidas da tabela `configuracoes` no banco de dados. Para alterar qualquer configuração, use o Directus (`http://localhost:8055`) ou Adminer (`http://localhost:8181`) — a mudança entra na próxima mensagem, sem restart.

## Workflows

| Arquivo | O que faz | Gatilho |
|---|---|---|
| `00-preview-chat.json` | Simulador do bot no painel (mesmo roteamento do 01, sem WhatsApp) | Webhook |
| `01-receber-mensagem.json` | Bot principal: recebe a mensagem da Meta, roteia (`src/` → `make build`), grava pela API e responde | Webhook da Meta |
| `01-whatsapp-receiver.json` | Receptor alternativo que repassa para o roteamento | Webhook |
| `02-cron-limpeza-sessoes.json` | Apaga sessões antigas | A cada hora |
| `03-cron-promocoes.json` | Disparo de promoções | A cada 5 min |
| `04-cron-lembretes.json` | "Faz X dias que você pediu..." | Diário |
| `05-cron-lembretes-reserva.json` | Lembrete de reserva (véspera e no dia) | Diário |
| `07-cron-retry-fiscal.json` | Reenvia notas fiscais pendentes (`POST /fiscal-documents/retry-pending`) | A cada 5 min |

**Aviso de status do pedido ao cliente não é workflow.** Sai da API quando alguém da equipe muda o status
(cozinha, entregas, painel), inclusive quando a mudança foi feita na loja offline e chegou pela sincronização.
Fora da janela de 24 h vai como template `atualizacao_pedido` (ver `ORDER_UPDATE_TEMPLATE` na API). O antigo
`06-notificar-status-pedido.json` foi removido: lia tabelas que não existem mais.

> **Atenção — 03, 04 e 05 ainda são do modelo antigo:** enviam pela Evolution API e consultam colunas que
> não existem mais (`customers.phone` como chave, `orders.customer_phone`, `promotions`). Os textos já estão
> no tom novo, mas precisam ser migrados para a API (e, para mensagens fora da janela, templates de
> marketing aprovados na Meta) antes de serem ativados.

## Roteamento no workflow 01

O workflow principal decide o caminho com base na mensagem recebida e no estado da sessão:

```
mensagem recebida
  ├── sessão em andamento?  → continua o fluxo ativo (pedido / reserva)
  ├── palavra-chave pedido  → chama 02-fluxo-pedido
  ├── palavra-chave reserva → chama 08-fluxo-reserva  (se FEATURE_RESERVAS=true)
  ├── palavra-chave humano  → chama 04-handoff-humano
  └── livre                 → chama 03-ia-duvidas
```

## Cálculo de tempo de entrega (workflow 02)

O workflow usa dois serviços gratuitos em sequência:

### 1. Geocoding — Nominatim (sem API key)
Converte o endereço do cliente em coordenadas lat/lng:
```
GET https://nominatim.openstreetmap.org/search
  ?q={endereco_completo}
  &format=json
  &limit=1
  &countrycodes=br

Resposta → [{ "lat": "-23.561", "lon": "-46.656" }]
```

### 2. Validação de raio — PostgreSQL
Antes de chamar o OSRM, verifica se o endereço está dentro do limite de atendimento:
```sql
SELECT calcular_distancia_km(
  {lat_cliente}, {lng_cliente},
  {ESTABELECIMENTO_LAT}, {ESTABELECIMENTO_LNG}
) AS distancia_km
```
Se `distancia_km > RAIO_MAXIMO_KM` → informa que não atende a região.

### 3. Tempo de rota — OSRM (sem API key)
Calcula a duração real da rota de carro:
```
GET http://router.project-osrm.org/route/v1/driving/{lng_loja},{lat_loja};{lng_cliente},{lat_cliente}
  ?overview=false

Resposta → { "routes": [{ "duration": 1020, "distance": 5234 }] }
           duration em segundos, distance em metros
```

### 4. Tempo total estimado
```
tempo_rota_min  = ceil(duration / 60)
tempo_total_min = TEMPO_PREPARO_MIN + tempo_rota_min
```
Mensagem ao cliente: *"Seu pedido chega em aproximadamente {tempo_total_min} minutos!"*

### 5. Taxa de entrega
```
SE subtotal >= FRETE_GRATIS_ACIMA → taxa = 0
SENÃO → taxa = TAXA_ENTREGA (valor fixo do .env)
```

---

## Palavras-chave sugeridas para roteamento

Ajuste no workflow 01 conforme o tipo de estabelecimento:

| Intenção | Exemplos de palavras-chave |
|---|---|
| Fazer pedido | pedido, quero, cardápio, menu, pedir, delivery, retirar |
| Reservar mesa | reserva, reservar, mesa, lugar, jantar, almoço, data |
| Falar com humano | atendente, humano, pessoa, ajuda, problema, reclamação |
