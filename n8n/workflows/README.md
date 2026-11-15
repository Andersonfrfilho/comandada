# Workflows n8n

## Como chegam ao n8n (migration)

Não importe à mão. A cada push na `main` que mexe no bot, o GitHub Actions (`Sync n8n Workflows`) roda
`scripts/n8n-migrate.sh`, que aplica estes arquivos pela API do n8n como uma migration:

- workflow novo é criado; workflow igual ao do n8n não é tocado; workflow que mudou é desativado,
  atualizado e reativado;
- quem fica ligado ou desligado está em [`../manifest.json`](../manifest.json) (`true`, `false` ou `"keep"`);
- precisa dos secrets `N8N_URL` e `N8N_API_KEY` no repositório (Settings → Secrets and variables → Actions).

À mão (mesmo resultado; `DRY_RUN=1` só mostra o que mudaria):

```bash
N8N_URL=https://n8n-comandada-yuyaki.up.railway.app N8N_API_KEY=$(cat ~/.config/comandada/n8n-api-key) \
  bash scripts/n8n-migrate.sh
```

> **Importante — n8n 2.x:** Code nodes rodam em sandbox isolado onde `process.env` não está disponível. Todas as variáveis de runtime (API keys, flags de feature, configurações de horário) são lidas da tabela `configuracoes` no banco de dados. Para alterar qualquer configuração, use o Directus (`http://localhost:8055`) ou Adminer (`http://localhost:8181`) — a mudança entra na próxima mensagem, sem restart.

## Workflows

| Arquivo | O que faz | Gatilho |
|---|---|---|
| `00-preview-chat.json` | Simulador do bot no painel (mesmo roteamento do 01, sem WhatsApp) | Webhook |
| `01-receber-mensagem.json` | Bot principal: recebe a mensagem da Meta, roteia (`src/` → `make build`), grava pela API e responde | Webhook da Meta |
| `01-whatsapp-receiver.json` | Receptor alternativo que repassa para o roteamento | Webhook |
| `02-cron-limpeza-sessoes.json` | Apaga sessões antigas | A cada hora |
| `03-cron-promocoes.json` | Disparo de promoções (desligado: não existe cadastro de promoções) | A cada 5 min |
| `04-cron-lembretes.json` | "Faz X dias que você pediu..." (`POST /internal/reminders/reorder`) | A cada hora |
| `05-cron-lembretes-reserva.json` | Lembrete de reserva de mesa nas 24 h antes (`POST /internal/reminders/reservations`) | A cada 15 min |
| `07-cron-retry-fiscal.json` | Reenvia notas fiscais pendentes (`POST /fiscal-documents/retry-pending`) | A cada 5 min |

**Aviso de status do pedido ao cliente não é workflow.** Sai da API quando alguém da equipe muda o status
(cozinha, entregas, painel), inclusive quando a mudança foi feita na loja offline e chegou pela sincronização.
Fora da janela de 24 h vai como template `atualizacao_pedido` (ver `ORDER_UPDATE_TEMPLATE` na API). O antigo
`06-notificar-status-pedido.json` foi removido: lia tabelas que não existem mais.

## Lembretes (04 e 05)

O n8n só dá o horário: os dois workflows chamam a API (mesmo `ORDER_HUB_API_URL` e
`ORDER_HUB_N8N_INTERNAL_TOKEN` do 01), que acha o telefone pelo cliente vinculado ao pedido ou à reserva
(`customers.whatsapp_number`) e envia pelo mesmo canal da inbox. Dentro da janela de 24 h vai texto; fora dela,
o template aprovado na Meta. Sem template aprovado, o lembrete fora da janela é pulado (não dá erro).
Código em `apps/api/src/modules/reminders/`.

- **04 — "faz X dias que você pediu"**: só para quem respondeu *sim* à pergunta de novidades do bot
  (`customers.marketing_opt_in`, gravado pelo nó Salvar Preferência Marketing do 01). Sai na hora
  `reminder_send_hour` (padrão 11) para quem fez o último pedido há exatamente `reminder_interval_days` dias
  (padrão 15; 0 desliga), no máximo um a cada `reminder_min_gap_days` (padrão 7). Texto em
  `reminder_message_template`. Template de marketing `lembrete_pedido` (pt_BR):
  `Oi, {{1}}! Faz {{2}} dias que você pediu {{3}} e a gente já está com saudade. Que tal pedir de novo hoje? É só responder esta mensagem. 😋`
- **05 — lembrete de reserva**: a agenda (scheduling SDK) marca cada reserva confirmada que começa nas próximas
  24 h e manda um lembrete por reserva (`reminder_sent_at` evita repetir). Reserva feita há menos de 2 h não
  recebe. Template de utilidade `lembrete_reserva` (pt_BR):
  `Oi, {{1}}! Passando para lembrar da sua reserva {{2}}: mesa para {{3}} pessoas {{4}}. Se não puder vir, é só responder esta mensagem. 😊`

Os nomes dos templates podem ser trocados nas Configurações (`whatsapp_reorder_reminder_template`,
`whatsapp_reservation_reminder_template`; vazio desliga o envio fora da janela).

> **03 continua desligado:** consulta a tabela `promotions`, que não existe no banco atual, e envia pela
> Evolution API. Precisa de um cadastro de promoções na API antes de voltar.

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
