# Automação de Pedidos via WhatsApp — Restaurante Japonês

**Contexto**: Restaurante de comida japonesa com delivery. Pedidos automatizados via WhatsApp com fallback para IA e atendente humano.

---

## Fluxo Geral

```
Cliente envia mensagem
        │
        ▼
[Evolution API / WhatsApp]
        │
        ▼
[Bot de pedidos — Typebot / n8n]
        │
        ├─── Pedido padrão? ──► Registra e confirma ──► Notifica cozinha
        │
        ├─── Dúvida? ──────────► [IA — Groq/Gemini] ──► Responde
        │                                │
        │                         Não resolveu?
        │                                │
        └─────────────────────────────── ▼
                                [Atendente humano — Chatwoot]
```

---

## Stack Recomendada (máximo free)

| Camada | Ferramenta | Custo | Motivo |
|---|---|---|---|
| WhatsApp Gateway | Evolution API | Grátis (self-hosted) | Open source, amplamente usado no Brasil |
| Orquestração de fluxo | n8n (self-hosted) | Grátis | Visual, conecta tudo, sem limite |
| Builder de chatbot | Typebot | Grátis (self-hosted) | Flow builder visual, integra com n8n |
| IA para dúvidas | Groq API | Grátis (rate limit generoso) | Llama 3 rápido, free tier real |
| Atendimento humano | Chatwoot | Grátis (self-hosted) | Inbox omnichannel + handoff |
| Banco de dados | Supabase | Grátis (500MB) | PostgreSQL gerenciado |
| Hospedagem | Oracle Cloud Free Tier | Grátis permanente | 2 VMs ARM, 24GB RAM total |

> **Custo estimado**: R$ 0/mês se self-hosted na Oracle. Se quiser simplicidade com Railway/Render: ~R$ 0–50/mês.

---

## Componentes Detalhados

### 1. WhatsApp — Evolution API

- Conecta via **WhatsApp Business** (número próprio)
- Suporta QR Code login ou WhatsApp Cloud API oficial (Meta)
- Webhooks para receber mensagens em tempo real
- Envio de texto, imagem (foto do cardápio), botões interativos

```
https://github.com/EvolutionAPI/evolution-api
```

**Alternativa oficial (mais estável)**: Meta WhatsApp Cloud API
- Gratuita, mas exige verificação de negócio no Meta
- Até 1.000 conversas/mês grátis

---

### 2. Fluxo do Bot — Typebot + n8n

**Typebot** monta o fluxo conversacional (sem código):

```
Início
  └── Boas-vindas + menu principal
        ├── "1. Ver cardápio" → envia imagem/link
        ├── "2. Fazer pedido" → coleta itens, quantidade, endereço
        ├── "3. Status do pedido" → consulta DB
        ├── "4. Falar com atendente" → transfer Chatwoot
        └── Mensagem livre → encaminha para IA
```

**n8n** orquestra a lógica de negócio:
- Recebe webhook da Evolution API
- Decide o caminho (bot / IA / humano)
- Salva pedido no Supabase
- Notifica cozinha (WhatsApp group ou Telegram)
- Dispara confirmação para o cliente

---

### 3. IA para Dúvidas — Groq

**Quando acionar**: mensagem não mapeada no fluxo do bot.

**Setup**:
```
API: https://api.groq.com
Modelo: llama-3.1-8b-instant (rápido, grátis)
```

**System prompt base**:
```
Você é o assistente virtual do [Nome do Restaurante], um restaurante japonês de delivery.
Responda dúvidas sobre cardápio, ingredientes, alérgenos, tempo de entrega e área de cobertura.
Se não souber ou for reclamação/pedido complexo, diga que vai transferir para um atendente.
Seja simpático, objetivo, use no máximo 3 linhas.
Cardápio: [lista simplificada]
Horário: [X às Y]
Taxa de entrega: [valor por bairro ou grátis acima de R$X]
```

**Fallback**: Se a IA responder com incerteza ou o cliente pedir humano → transfere para Chatwoot.

---

### 4. Atendente Humano — Chatwoot

- Inbox conectado ao WhatsApp via Evolution API
- Atendente recebe a conversa com **histórico completo**
- Pode responder direto do painel web ou mobile
- Quando resolve, pode devolver ao bot ou encerrar

**Handoff automático via n8n**:
```
SE IA.confiança < threshold
OU cliente disse "atendente" / "humano" / "problema"
→ cria conversa no Chatwoot
→ envia mensagem: "Estou te conectando com um atendente, aguarde!"
→ notifica equipe (push / WhatsApp interno)
```

---

### 5. Banco de Dados — Supabase

**Tabelas principais**:

```sql
-- Pedidos
CREATE TABLE pedidos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_tel TEXT NOT NULL,
  cliente_nome TEXT,
  itens JSONB NOT NULL,        -- [{item, qty, obs}]
  total DECIMAL(10,2),
  endereco TEXT,
  status TEXT DEFAULT 'recebido', -- recebido | preparando | saiu | entregue
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Cardápio
CREATE TABLE cardapio (
  id SERIAL PRIMARY KEY,
  nome TEXT NOT NULL,
  descricao TEXT,
  preco DECIMAL(10,2),
  categoria TEXT,
  disponivel BOOLEAN DEFAULT true,
  imagem_url TEXT
);

-- Sessões de conversa (contexto do bot)
CREATE TABLE sessoes (
  tel TEXT PRIMARY KEY,
  estado TEXT,                 -- etapa atual do fluxo
  carrinho JSONB DEFAULT '[]',
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

---

### 6. Notificação para a Cozinha

Opções (escolha uma):

| Opção | Como | Custo |
|---|---|---|
| WhatsApp Group | n8n envia mensagem no grupo da cozinha | Grátis |
| Telegram Bot | Bot envia pedido formatado | Grátis |
| Impressora ESC/POS | Raspberry Pi + impressora térmica | ~R$ 200 hardware |
| Tela na cozinha | Dashboard Next.js simples + Supabase Realtime | Grátis |

**Recomendação**: Telegram Bot para cozinha + dashboard simples web.

---

## Arquitetura de Infraestrutura

```
Oracle Cloud Free Tier (VM 1 — 4GB RAM)
├── Evolution API          (porta 8080)
├── Typebot                (porta 3001)
└── n8n                    (porta 5678)

Oracle Cloud Free Tier (VM 2 — 4GB RAM)
└── Chatwoot               (porta 3000)

Serviços externos (gratuitos)
├── Supabase               (banco + realtime)
├── Groq API               (IA)
└── Cloudflare Tunnel      (HTTPS grátis, sem IP fixo)
```

> Cloudflare Tunnel expõe os serviços locais/cloud com HTTPS sem precisar de IP fixo ou load balancer pago.

---

## Roadmap de Desenvolvimento

### Fase 1 — MVP (2–3 semanas)

- [ ] Subir Evolution API + conectar número WhatsApp
- [ ] Criar fluxo básico no Typebot (cardápio + pedido)
- [ ] Integrar n8n recebendo webhooks e salvando no Supabase
- [ ] Confirmação de pedido por WhatsApp
- [ ] Notificação cozinha via Telegram

### Fase 2 — IA + Handoff (1–2 semanas)

- [ ] Integrar Groq para mensagens fora do fluxo
- [ ] Subir Chatwoot + conectar inbox WhatsApp
- [ ] Lógica de transferência bot → humano → bot
- [ ] Dashboard de pedidos para cozinha (Supabase Realtime)

### Fase 3 — Polimento (1 semana)

- [ ] Envio de cardápio com imagens
- [ ] Botões interativos no WhatsApp (WhatsApp Cloud API)
- [ ] Relatório diário de pedidos (n8n scheduled)
- [ ] Blacklist de horários (restaurante fechado)
- [ ] Integração com sistema de pagamento (Mercado Pago link)

---

## Requisitos Técnicos Mínimos

**Para desenvolver:**
- Node.js 20+ ou Python 3.11+
- Docker + Docker Compose (para subir todos os serviços)
- Conta Oracle Cloud (gratuita)
- Número de WhatsApp Business dedicado
- Conta Supabase (gratuita)
- Conta Groq (gratuita)

**Conhecimentos necessários:**
- Docker Compose básico
- Configuração de webhooks
- SQL básico (Supabase)
- Lógica de fluxo no Typebot (visual, sem código)
- n8n workflows (visual, low-code)

---

## Custo Real Estimado

| Item | Custo |
|---|---|
| Infraestrutura (Oracle) | R$ 0/mês |
| WhatsApp Business | R$ 0 (próprio número) |
| Groq API (até ~1M tokens/dia) | R$ 0/mês |
| Supabase (até 500MB) | R$ 0/mês |
| Cloudflare Tunnel | R$ 0/mês |
| **Total** | **R$ 0/mês** |

Custos que podem surgir:
- Meta Cloud API: R$ 0,30–0,80 por conversa iniciada pela empresa (conversas do cliente são grátis)
- Domínio próprio: ~R$ 40/ano (opcional)
- Impressora térmica: ~R$ 200 (one-time, opcional)

---

## Riscos e Considerações

| Risco | Mitigação |
|---|---|
| WhatsApp banir número (API não oficial) | Usar Meta Cloud API oficial para produção |
| Rate limit do Groq | Implementar fila + fallback para Gemini |
| Oracle Cloud down | Backup no Railway (~R$ 30/mês) |
| Cliente com pedido complexo preso no bot | Timeout de 2 min sem resposta → transfere para humano |
| Cardápio desatualizado no bot | Painel admin simples para atualizar Supabase |

---

## Próximos Passos Imediatos

1. **Criar conta Oracle Cloud** e provisionar 2 VMs
2. **Registrar número** no WhatsApp Business (chip dedicado)
3. **Subir Evolution API** via Docker Compose e testar QR Code
4. **Modelar cardápio** no Supabase
5. **Desenhar fluxo** no Typebot seguindo o mapa acima
6. **Integrar n8n** como cérebro da orquestração

---

*Gerado em 2026-06-01 — Arquitetura para restaurante japonês delivery WhatsApp bot*
