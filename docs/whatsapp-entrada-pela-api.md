# Entrada do WhatsApp pela API, com worker

Mesmo padrão dos outros bots (financing-chatbot, QuickCart): a Meta chama a **API**, a API
confere a assinatura e põe a mensagem numa fila, e um **serviço worker** separado leva a mensagem
ao bot no n8n. Se o n8n cair ou estiver em deploy, a mensagem espera na fila e é reentregue
(8 tentativas, backoff exponencial a partir de 3 s, ~13 min) em vez de se perder.

```
Meta ──POST /webhooks/whatsapp──▶ API (confere X-Hub-Signature-256, enfileira, 200)
                                      │  BullMQ "whatsapp-inbound" (Redis)
                                      ▼
                                 worker (src/worker.ts)
                                      │  POST corpo cru + assinatura original
                                      ▼
                         n8n /webhook/routing  (workflow 01, sem mudança)
```

- O worker repassa o corpo **byte a byte** com o `X-Hub-Signature-256` original: o nó *Extrair
  Mensagem* confere a assinatura de novo e extrai tudo (nome do contato, localização, número da
  loja) como se a Meta tivesse chamado direto. Nenhuma mudança no workflow.
- Duplicata: o jobId é o id da mensagem da Meta (fica 24 h), e o n8n ainda ignora id repetido.
- Aviso só de status (entregue, lido) não entra na fila.
- Assinatura inválida → 401. Redis fora → 500 (a Meta reentrega).
- O `GET /webhooks/whatsapp` responde o `hub.challenge` com `WHATSAPP_WEBHOOK_VERIFY_TOKEN` da API.
- A rota antiga `POST /webhook/:establishmentId` (inbox pelo meta-whatsapp-module) não muda.

## Serviço worker no Railway

Mesma imagem da API (`apps/api/Dockerfile`), outro comando:

| Campo | Valor |
|---|---|
| Root directory | `apps/api` |
| Start command | `bun run src/worker.ts` |
| Healthcheck | nenhum (não abre porta HTTP) |

Variáveis do worker (referências ao serviço da API onde der):

| Variável | Valor |
|---|---|
| `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET` | iguais às da API |
| `WHATSAPP_*`, `N8N_INTERNAL_API_TOKEN`, demais da API | iguais às da API (os casos de uso das filas mandam WhatsApp e gravam no banco) |
| `N8N_BOT_WEBHOOK_URL` | `https://<n8n>/webhook/routing` |
| `FISCAL_WORKER_ENABLED`, `FINANCE_WORKER_ENABLED`, `STOCK_WORKER_ENABLED`, `PRODUCT_AFFINITY_WORKER_ENABLED`, `IFOOD_ENABLED` | `true` para ligar cada fila (mesmas variáveis de antes, agora no worker) |
| `WHATSAPP_INBOUND_WORKER_ENABLED` | `false` só para desligar o bot (padrão: ligado) |

Na API, quando o worker existir: `API_QUEUE_WORKERS=false` (nenhuma fila roda no processo da API).
Sem essa variável a API continua como antes (cada fila com a sua variável), útil em dev local.
A API precisa de `WHATSAPP_APP_SECRET` (assinatura) e `WHATSAPP_WEBHOOK_VERIFY_TOKEN` (handshake).

## Trocar o webhook da Meta

Só depois de o worker estar no ar e com `N8N_BOT_WEBHOOK_URL`:

```bash
META_APP_ID=... META_CALLBACK_URL=https://<api>/webhooks/whatsapp bash scripts/ops/03-meta-apontar-webhook.sh
```

O verify token tem de ser o mesmo na API e no n8n. Para voltar, rode o mesmo script com
`META_CALLBACK_URL=https://<n8n>/webhook/routing`.
