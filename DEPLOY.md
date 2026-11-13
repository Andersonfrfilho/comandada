# Guia de Deploy — Sakura Bot

Tudo que você precisa para colocar o bot em produção: onde hospedar, quanto custa, como configurar e o que o cliente final precisa fazer.

---

## Onde hospedar

### Recomendado: Hetzner Cloud

A melhor relação custo-benefício para esse stack. O bot roda confortavelmente em 8 GB de RAM.

| Plano | RAM | vCPU | Disco | Preço |
|---|---|---|---|---|
| CX22 | 4 GB | 2 | 40 GB | ~€4/mês |
| **CX32** | **8 GB** | **4** | **80 GB** | **~€9/mês ✓** |
| CX42 | 16 GB | 8 | 160 GB | ~€19/mês |

> Use **CX32** para a maioria dos casos. CX22 suporta apenas se Metabase e Typebot estiverem desativados.

Crie sua conta em: https://hetzner.com/cloud

### Alternativas

| Provedor | Equivalente | Preço | Observação |
|---|---|---|---|
| DigitalOcean | 8 GB Droplet | ~$48/mês | Mais caro, suporte melhor |
| Vultr | 8 GB Cloud | ~$40/mês | Similar ao DigitalOcean |
| Contabo | VPS M | ~€7/mês | Barato, suporte lento |
| AWS/GCP | t3.large / e2-standard-2 | $60–80/mês | Excessivo para esse stack |

---

## Custo total por cliente (Hetzner)

| Item | Custo |
|---|---|
| Servidor CX32 | ~R$ 55/mês |
| Domínio `.com.br` | ~R$ 50/ano (~R$ 4/mês) |
| SSL (Let's Encrypt) | Gratuito |
| Groq API (IA) | Gratuito até alto volume |
| **Total** | **~R$ 60–70/mês** |

---

## Quanto cobrar

| Plano | Mensalidade sugerida | Inclui |
|---|---|---|
| Essencial | R$ 399/mês | 1 número WhatsApp, cardápio, pedidos, FAQ com IA |
| Profissional | R$ 699/mês | + Atendente humano (Order Hub), notificações de status, relatórios (Metabase) |
| Premium | R$ 1.199/mês | + Setup personalizado, suporte prioritário, dados/processos personalizados |

**Taxa de setup:** R$ 800–1.500 (cobre onboarding + personalização do cardápio/FAQ/regras).

**Margem bruta estimada:** 85–90% após o servidor.

---

## Pré-requisitos antes de começar

- [ ] Servidor Linux (Ubuntu 22.04 LTS recomendado)
- [ ] Domínio apontando para o IP do servidor (ex: `bot.seudominio.com.br`)
- [ ] Docker e Docker Compose instalados no servidor
- [ ] Número de WhatsApp dedicado para o bot (chip separado)
- [ ] Chave da API Groq: https://console.groq.com (gratuito)

---

## Passo a passo de deploy

### 1. Preparar o servidor

```bash
# Instalar Docker (Ubuntu)
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker

# Verificar
docker --version
docker compose version
```

### 2. Clonar o projeto

```bash
git clone git@github.com:Ad4-Technology/whatsapp-shop.git sakura-bot
cd sakura-bot
```

### 3. Configurar variáveis de ambiente

```bash
make setup
# Edite o arquivo criado:
nano infra/.env
```

Variáveis obrigatórias a preencher:

```env
# Identidade do estabelecimento
ESTABELECIMENTO_NOME=Nome do Estabelecimento
ESTABELECIMENTO_TEL=5511999999999

# Banco de dados (escolha senhas fortes)
POSTGRES_PASSWORD=SenhaForteAqui123!

# n8n
N8N_PASSWORD=SenhaForteAqui123!

# Evolution API (gere strings aleatórias)
AUTHENTICATION_API_KEY=chave-aleatoria-longa
AUTHENTICATION_JWT_SECRET=jwt-secret-longo

# IA (obter em console.groq.com)
GROQ_API_KEY=gsk_xxxx

# Directus
DIRECTUS_SECRET=string-aleatoria-longa
DIRECTUS_ADMIN_EMAIL=admin@seudominio.com.br
DIRECTUS_ADMIN_PASSWORD=SenhaForte123!

# URLs públicas (substituir pelo seu domínio)
N8N_HOST=n8n.seudominio.com.br
N8N_WEBHOOK_URL=https://n8n.seudominio.com.br
TYPEBOT_URL=https://bot.seudominio.com.br
DIRECTUS_URL=https://admin.seudominio.com.br
```

### 4. Personalizar cardápio e regras

Edite os arquivos antes de subir:

| Arquivo | O que fazer |
|---|---|
| `dados/produtos.csv` | Substitua pelos produtos/serviços do estabelecimento |
| `dados/categorias.csv` | Ajuste as categorias |
| `dados/faq.csv` | Adicione as perguntas frequentes reais |
| `dados/processos.md` | Descreva as regras do negócio (horários, entrega, pagamento) |

### 5. Subir tudo

```bash
make all
```

Esse comando:
1. Sobe todos os containers (~60s para inicializar)
2. Cria o schema do banco automaticamente
3. Importa cardápio, categorias e FAQ
4. Configura o n8n (owner, credenciais, workflows, ativação)
5. Configura o Directus (admin)

Aguarde a mensagem: `Ambiente pronto! Acesse os serviços com 'make help'.`

### 6. Conectar o WhatsApp (único passo manual)

1. Acesse `http://SEU-IP:8081/manager` (ou `https://evolution.seudominio.com.br/manager`)
2. Crie uma instância com o nome configurado em `EVOLUTION_INSTANCE_NAME` no `.env`
3. Escaneie o QR code com o celular do estabelecimento
4. Aguarde o status `connected`

> Esse passo é inevitável — o WhatsApp exige autenticação física via QR code. A sessão dura meses enquanto o celular tiver internet e bateria.

---

## Verificar se está funcionando

```bash
# Status dos containers
make ps

# Enviar mensagem de teste
make test-msg MSG="oi" TEL=5511999999999

# Acompanhar logs em tempo real
make logs
```

Serviços após o deploy:

| Serviço | URL padrão | Para quê |
|---|---|---|
| Evolution API | `:8081/manager` | Gerenciar instância WhatsApp |
| n8n | `:5678` | Ver/editar workflows |
| Directus | `:8055` | Painel admin (cardápio, config) |
| Order Hub Web | `:4000` | Atendimento humano |
| Metabase | `:4100` | Dashboards e relatórios |
| Adminer | `:8181` | Acesso direto ao banco |

---

## Configurar domínio e HTTPS (produção)

Use um reverse proxy (Nginx ou Caddy) com Let's Encrypt. O Caddy é o mais simples:

```bash
# Instalar Caddy
sudo apt install caddy

# /etc/caddy/Caddyfile
n8n.seudominio.com.br {
    reverse_proxy localhost:5678
}

chat.seudominio.com.br {
    reverse_proxy localhost:3010
}

admin.seudominio.com.br {
    reverse_proxy localhost:8055
}

evolution.seudominio.com.br {
    reverse_proxy localhost:8081
}
```

```bash
sudo systemctl reload caddy
# SSL gerado automaticamente
```

---

## O que o cliente final precisa fazer

Depois que você fez o deploy, o cliente (dono do estabelecimento) precisa de apenas 3 coisas:

**1. Fornecer o número de WhatsApp dedicado**
Um chip separado exclusivo para o bot. O número pessoal do dono não funciona.

**2. Escanear o QR code**
Uma única vez em `https://evolution.seudominio.com.br/manager`. Você pode fazer isso junto ao cliente no onboarding.

**3. Revisar os dados do estabelecimento**
Acessar o Directus (`https://admin.seudominio.com.br`) para:
- Conferir os produtos/serviços importados
- Ajustar preços e disponibilidade
- Atualizar horário de funcionamento nas `settings`

Pronto. O bot já está operando.

---

## Manutenção

```bash
# Atualizar para nova versão
git pull
make down
make up
make n8n-import   # reimporta workflows novos/alterados

# Backup do banco
docker exec postgres pg_dump -U botuser botdb > backup-$(date +%Y%m%d).sql

# Ver pedidos do dia (Adminer ou Metabase)
# http://localhost:4100
```

---

## Problemas comuns

| Sintoma | Causa provável | Solução |
|---|---|---|
| Bot não responde | WhatsApp desconectado | Reescaneie QR em `:8081/manager` |
| `make all` falha no n8n-import | n8n ainda inicializando | `make n8n-import` após 2 minutos |
| Order Hub Web não abre | Container ainda subindo | Aguarde 2-3 min após `make up` |
| IA respondendo errado | `processos.md` desatualizado | Edite `dados/processos.md` e reinicie n8n |
| Pedido não chega | Webhook Evolution → n8n | `make logs` e verifique n8n recebendo eventos |
