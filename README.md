# sakura-bot-oficial

Template de bot de atendimento WhatsApp usando a **Meta WhatsApp Cloud API** (oficial).
Fork este repo, preencha o `.env` com as credenciais do seu estabelecimento e faça deploy em minutos.

> Projeto irmão: [sakura-bot](https://github.com/Andersonfrfilho/sakura-bot) usa Evolution API — indicado apenas para testes locais.

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/template/new?template=https://github.com/Andersonfrfilho/sakura-bot-oficial)

---

## Por que API oficial?

| | Evolution API (não-oficial) | Meta Cloud API (oficial) |
|---|---|---|
| Risco de ban | Alto | Zero |
| Botões / Menus nativos | Instável | Sim |
| WhatsApp Flows (formulários) | Não | Sim |
| Catálogo de produtos | Não | Sim |
| Templates para mensagens ativas | Não | Sim |
| Reconexão QR periódica | Necessária | Não precisa |
| Webhook confiável | Depende do host | Garantido pela Meta |

### Mensagens interativas disponíveis

**Botões de resposta rápida** (até 3):
```
┌─────────────────────────────┐
│  Como posso te ajudar hoje? │
├────────────┬────────────────┤
│  Cardápio  │  Fazer pedido  │  Suporte
└────────────┴────────────────┘
```

**Menu lista** (até 10 opções em categorias):
```
┌─────────────────────────────┐
│  Escolha uma opção          │
│              [Ver opções ▼] │
└─────────────────────────────┘
  Abre drawer nativo do WhatsApp
```

**WhatsApp Flows** — formulários completos (endereço, agendamento, pagamento) sem sair do app.

---

## Como usar este template

```bash
# 1. Fork ou clone
git clone https://github.com/Andersonfrfilho/sakura-bot-oficial meu-bot
cd meu-bot

# 2. Configure o ambiente
make setup                # gera infra/.env a partir do .env.example
nano infra/.env           # preencha com suas credenciais Meta

# 3. Suba localmente (stack completo)
cd infra && docker compose up -d

# 4. Deploy em produção (Railway)
railway login
railway init              # cria projeto novo no Railway
railway variables set WHATSAPP_ACCESS_TOKEN=EAAxx...
railway variables set WHATSAPP_PHONE_NUMBER_ID=1129...
railway variables set WHATSAPP_BUSINESS_ACCOUNT_ID=133...
railway variables set WHATSAPP_WEBHOOK_VERIFY_TOKEN=minha_string
railway variables set POSTGRES_USER=botuser POSTGRES_PASSWORD=senha POSTGRES_DB=botdb
railway variables set N8N_USER=admin N8N_PASSWORD=senha
railway up                # deploy — Railway gera URL pública automaticamente

# 5. Registre o webhook na Meta
# URL: https://SEU_APP.up.railway.app/webhook/whatsapp
# Token: o valor de WHATSAPP_WEBHOOK_VERIFY_TOKEN
```

> Veja o [SETUP.md](SETUP.md) para o guia completo com screenshots e troubleshooting.

---

## Arquitetura

```
                 ┌─── Meta Cloud API (hospedado pela Meta) ───┐
WhatsApp ───────►│  Webhook POST → n8n                        │
                 └───────────────────────────────────────────-┘
                               │
                    ┌──────────┼──────────┐
                    ▼          ▼          ▼
                 Typebot    Groq IA    Order Hub
               (fluxos)   (dúvidas)  (humano)
                    │
                    ▼
                PostgreSQL
```

**Stack mínimo para webhook funcionar:** n8n + postgres + redis (no `docker-compose.yml` da raiz).
**Stack completo para produção:** + order-hub + typebot + directus + metabase (em `infra/docker-compose.yml`).

---

## Pré-requisitos Meta

1. Conta em [developers.facebook.com](https://developers.facebook.com) com app WhatsApp criado
2. Número de WhatsApp Business verificado no app
3. Credenciais da aba **"Primeiros passos"**:
   - `WHATSAPP_ACCESS_TOKEN`
   - `WHATSAPP_PHONE_NUMBER_ID`
   - `WHATSAPP_BUSINESS_ACCOUNT_ID`

---

## Estrutura do projeto

```
sakura-bot-oficial/
├── docker-compose.yml        ← Stack mínimo (Railway / produção)
├── infra/
│   ├── docker-compose.yml    ← Stack completo (dev local)
│   └── .env.example          ← Template de variáveis
├── dados/
│   ├── processos.md          ← Regras de negócio (contexto IA)
│   ├── cardapio.csv          ← Seed do cardápio
│   └── faq.csv               ← Seed do FAQ
├── database/
│   ├── init.sql              ← Cria databases auxiliares
│   └── schema.sql            ← Schema completo da aplicação
├── n8n/workflows/            ← Workflows exportados para importar no n8n
├── SETUP.md                  ← Guia de setup passo a passo
└── Makefile                  ← Comandos principais
```

---

## Referência rápida — enviar mensagem via Graph API

```bash
# Texto simples
curl -X POST "https://graph.facebook.com/v21.0/$PHONE_NUMBER_ID/messages" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "messaging_product": "whatsapp",
    "to": "5511999999999",
    "type": "text",
    "text": { "body": "Olá! Como posso ajudar?" }
  }'

# Botões interativos
curl -X POST "https://graph.facebook.com/v21.0/$PHONE_NUMBER_ID/messages" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "messaging_product": "whatsapp",
    "to": "5511999999999",
    "type": "interactive",
    "interactive": {
      "type": "button",
      "body": { "text": "Como posso te ajudar hoje?" },
      "action": {
        "buttons": [
          { "type": "reply", "reply": { "id": "cardapio", "title": "Cardápio" } },
          { "type": "reply", "reply": { "id": "pedido",   "title": "Fazer pedido" } },
          { "type": "reply", "reply": { "id": "suporte",  "title": "Suporte" } }
        ]
      }
    }
  }'
```

---

## Comandos

```bash
make setup      # gera infra/.env
make up         # sobe stack completo local (infra/)
make down       # para containers
make logs       # logs em tempo real
make ps         # status dos containers
make db-reset   # recria schema (apaga dados)
make test-msg   # simula mensagem: MSG="oi" TEL=5511999999999
```

---

## URLs após make up (stack completo local)

| Serviço | URL |
|---|---|
| n8n (webhook + workflows) | http://localhost:5678 |
| Directus (painel admin) | http://localhost:8055 |
| Order Hub Web (atendimento humano) | http://localhost:4000 |
| Typebot Builder | http://localhost:3001 |
| Metabase (dashboards) | http://localhost:4100 |
| Adminer (banco de dados) | http://localhost:8181 |

---

## Personalizar para um novo estabelecimento

1. Fork deste repositório
2. `make setup` → preencha `infra/.env` com nome, telefone, horários, credenciais Meta
3. Edite `dados/processos.md` com as regras do negócio
4. Edite `dados/cardapio.csv` com os produtos/serviços
5. `railway init && railway up` → deploy em produção
6. Registre a URL do n8n como webhook na Meta

Cada estabelecimento tem seu próprio fork com seu próprio `.env`.
