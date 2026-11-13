# SETUP.md — sakura-bot-oficial

Guia completo para configurar o bot com a **Meta WhatsApp Cloud API** do zero até a primeira mensagem.

---

## 1. Pré-requisitos

- [ ] Docker + Docker Compose instalados
- [ ] Conta em [developers.facebook.com](https://developers.facebook.com) com app criado
- [ ] Número de WhatsApp Business verificado no app Meta
- [ ] URL pública HTTPS disponível (Railway, Fly.io ou ngrok)

---

## 2. Credenciais Meta — onde encontrar cada valor

Acesse: `developers.facebook.com/apps/SEU_APP_ID/whatsapp/getting-started`

| Variável `.env` | Onde está no console |
|---|---|
| `WHATSAPP_ACCESS_TOKEN` | Aba "Primeiros passos" → "Token de acesso temporário" (dev) ou Meta Business Suite → Usuários do sistema (permanente) |
| `WHATSAPP_PHONE_NUMBER_ID` | Aba "Primeiros passos" → "ID do número de telefone" (abaixo do número) |
| `WHATSAPP_BUSINESS_ACCOUNT_ID` | Aba "Primeiros passos" → "ID da conta do WhatsApp Business" |
| `WHATSAPP_APP_ID` | Canto superior da página do app |
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | Você define — qualquer string secreta |

> **Token permanente**: o token da aba "Primeiros passos" expira em 24h. Para produção, crie um Usuário do Sistema no Meta Business Suite e gere um token permanente.

---

## 3. Configurar o projeto

```bash
# Clone o repositório
git clone https://github.com/Andersonfrfilho/sakura-bot-oficial
cd sakura-bot-oficial

# Gere o .env a partir do exemplo
make setup

# Abra e preencha as credenciais
nano infra/.env   # ou use seu editor preferido
```

Campos obrigatórios no `.env`:
```bash
WHATSAPP_ACCESS_TOKEN=EAAxx...
WHATSAPP_PHONE_NUMBER_ID=112905...
WHATSAPP_BUSINESS_ACCOUNT_ID=133...
WHATSAPP_WEBHOOK_VERIFY_TOKEN=minha_string_secreta_aqui
WHATSAPP_API_VERSION=v21.0
```

---

## 4. Subir os serviços

```bash
make up
```

Aguarde todos os containers ficarem `healthy`:
```bash
make ps
```

---

## 5. Expor o n8n publicamente

A Meta precisa de uma URL HTTPS pública para enviar os webhooks.

### Opção A — ngrok (desenvolvimento local)

```bash
# Instalar ngrok se não tiver
brew install ngrok

# Expor a porta do n8n
ngrok http 5678
```

Saída:
```
Forwarding  https://abc123.ngrok.io → http://localhost:5678
```

Use `https://abc123.ngrok.io` como base da URL do webhook.

### Opção B — Railway (produção, grátis)

1. Crie conta em [railway.app](https://railway.app)
2. "New Project" → "Deploy from GitHub repo" → selecione este repo
3. Railway detecta o `docker-compose.yml` e sobe todos os serviços
4. Cada serviço recebe uma URL pública automática
5. Use a URL do serviço `n8n` como base

> Deploy automático a cada `git push main`.

### Opção C — Fly.io (produção, grátis)

```bash
# Instalar flyctl
brew install flyctl
flyctl auth login

# Deploy
cd infra
flyctl launch
flyctl deploy
```

---

## 6. Configurar o webhook na Meta

Acesse: `developers.facebook.com/apps/SEU_APP_ID/whatsapp/config`

1. Clique em **"Editar"** na seção Webhook
2. **URL do callback**: `https://SUA_URL_PUBLICA/webhook/whatsapp`
3. **Token de verificação**: o valor de `WHATSAPP_WEBHOOK_VERIFY_TOKEN` do seu `.env`
4. Clique em **"Verificar e salvar"**
5. Assine os eventos: `messages` e `message_status_updates`

> A Meta fará um GET para verificar — o n8n deve responder com o `hub.challenge`. Configure o workflow antes deste passo.

---

## 7. Configurar o workflow n8n

Acesse: `http://localhost:5678` (ou URL do Railway)

### 7.1 Criar o workflow de webhook

1. "New Workflow"
2. Adicione um nó **Webhook**:
   - Method: `GET` e `POST`
   - Path: `whatsapp`
   - Authentication: None

3. Adicione um nó **IF** após o webhook:
   - Condição: `{{ $json.query["hub.mode"] }}` é igual a `subscribe`

4. Branch **true** (verificação Meta):
   - Nó **Respond to Webhook** → Body: `{{ $json.query["hub.challenge"] }}`
   - Também verificar: `{{ $json.query["hub.verify_token"] }}` === `{{ $env.WHATSAPP_WEBHOOK_VERIFY_TOKEN }}`

5. Branch **false** (mensagem recebida):
   - Extrair dados: `{{ $json.body.entry[0].changes[0].value.messages[0] }}`
   - Processar e responder via HTTP Request → Graph API

### 7.2 Estrutura da mensagem recebida (POST da Meta)

```json
{
  "object": "whatsapp_business_account",
  "entry": [{
    "id": "WABA_ID",
    "changes": [{
      "value": {
        "messaging_product": "whatsapp",
        "metadata": {
          "display_phone_number": "5516991707267",
          "phone_number_id": "1129051206965973"
        },
        "messages": [{
          "from": "5511999999999",
          "id": "wamid.xxx",
          "timestamp": "1234567890",
          "type": "text",
          "text": { "body": "Olá!" }
        }]
      },
      "field": "messages"
    }]
  }]
}
```

Expressões n8n para extrair os dados:
```
Telefone do cliente : {{ $json.body.entry[0].changes[0].value.messages[0].from }}
Texto da mensagem   : {{ $json.body.entry[0].changes[0].value.messages[0].text.body }}
Tipo da mensagem    : {{ $json.body.entry[0].changes[0].value.messages[0].type }}
ID da mensagem      : {{ $json.body.entry[0].changes[0].value.messages[0].id }}
```

### 7.3 Enviar resposta (HTTP Request node)

```
Method : POST
URL    : https://graph.facebook.com/v21.0/{{ $env.WHATSAPP_PHONE_NUMBER_ID }}/messages
Headers:
  Authorization : Bearer {{ $env.WHATSAPP_ACCESS_TOKEN }}
  Content-Type  : application/json

Body (texto simples):
{
  "messaging_product": "whatsapp",
  "to": "{{ $json.from }}",
  "type": "text",
  "text": { "body": "Olá! Como posso ajudar?" }
}

Body (com botões):
{
  "messaging_product": "whatsapp",
  "to": "{{ $json.from }}",
  "type": "interactive",
  "interactive": {
    "type": "button",
    "body": { "text": "Como posso te ajudar hoje?" },
    "action": {
      "buttons": [
        { "type": "reply", "reply": { "id": "cardapio", "title": "Ver cardápio" } },
        { "type": "reply", "reply": { "id": "pedido",   "title": "Fazer pedido" } },
        { "type": "reply", "reply": { "id": "suporte",  "title": "Falar com humano" } }
      ]
    }
  }
}
```

---

## 8. Testar

### Enviar mensagem de teste pela Meta

No console: `developers.facebook.com/apps/SEU_APP_ID/whatsapp/getting-started`

Clique em **"Enviar mensagem"** — envia um template "Hello World" para um número cadastrado como destinatário de teste.

### Simular mensagem localmente

```bash
make test-msg MSG="Olá, quero fazer um pedido" TEL=5516991707267
```

### Verificar logs do n8n

```bash
make logs   # filtra automaticamente o serviço n8n
```

---

## 9. Token permanente (produção)

O token da aba "Primeiros passos" expira em **24 horas**. Para produção:

1. Acesse **Meta Business Suite** → Configurações → Usuários do sistema
2. Crie um "Usuário do sistema" com função de Administrador
3. Atribua o ativo "Número de telefone do WhatsApp" com permissão `whatsapp_business_messaging`
4. "Gerar novo token" → selecione o app → permissões: `whatsapp_business_messaging`, `whatsapp_business_management`
5. Copie o token — ele não expira
6. Atualize `WHATSAPP_ACCESS_TOKEN` no `.env` e reinicie: `make restart`

---

## 10. Limites do plano gratuito

| Item | Limite |
|---|---|
| Conversas iniciadas pelo cliente | Grátis (dentro da janela de 24h) |
| Conversas iniciadas pela empresa | 1.000/mês grátis, depois ~R$ 0,30–0,80 cada |
| Números de teste (modo dev) | Até 5 destinatários cadastrados |
| Volume de mensagens | Começa em 1.000/dia, aumenta com uso |

Para remover o limite de 5 destinatários, submeta o app para **revisão da Meta** (processo simples para uso real).

---

## Troubleshooting

| Problema | Causa | Solução |
|---|---|---|
| Webhook não verifica | URL incorreta ou verify_token errado | Conferir URL pública e `WHATSAPP_WEBHOOK_VERIFY_TOKEN` |
| `401 Unauthorized` ao enviar | Token expirado ou incorreto | Regenerar token no console Meta |
| Mensagem não chega no n8n | Evento `messages` não assinado | Webhook config → assinar `messages` |
| `400 Bad Request` | Estrutura JSON errada | Validar com a [referência da API](https://developers.facebook.com/docs/whatsapp/cloud-api/reference/messages) |
| n8n não responde ao GET de verificação | Workflow não ativado ou path errado | Ativar workflow e conferir path do webhook node |
