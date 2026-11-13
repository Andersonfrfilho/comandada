ENV_FILE = infra/.env

# Nome do projeto derivado de ESTABELECIMENTO_NOME no .env (ex: "Sakura Delivery" → "sakura-delivery")
# Fallback para "whatsapp-bot" se o .env ainda não existir
PROJECT := $(shell grep -s ^ESTABELECIMENTO_NOME $(ENV_FILE) | cut -d= -f2 | tr '[:upper:]' '[:lower:]' | tr ' ' '-' | tr -cd 'a-z0-9-')
PROJECT := $(if $(PROJECT),$(PROJECT),whatsapp-bot)

COMPOSE = docker compose -f infra/docker-compose.yml -p $(PROJECT)

.PHONY: help all setup init up down restart logs ps db-reset db-seed bot-seed n8n-import directus-init test test-order test-msg evolution-start evolution-stop evolution-logs validate build hub-up hub-down hub-restart hub-logs hub-seed hub-generate hub-wait

help:
	@echo ""
	@echo "  make all           Primeira execução completa: setup + up + init"
	@echo "  make setup         Cria infra/.env a partir do exemplo"
	@echo "  make up            Sobe todos os serviços (bot + Order Hub)"
	@echo "  make init          Seed banco + workflows + Directus admin (roda após 'up')"
	@echo "  make directus-init Cria admin do Directus a partir do .env"
	@echo "  make n8n-import    Importa/atualiza workflows no n8n manualmente"
	@echo "  make down          Para todos os serviços"
	@echo "  make restart       Para e sobe novamente"
	@echo "  make logs          Acompanha logs em tempo real"
	@echo "  make ps            Status dos containers"
	@echo "  make validate      Valida JSON + JS syntax + anti-padrões"
	@echo "  make test          Roda testes de parsing + validação do workflow"
	@echo "  make db-reset      Recria o schema do app no banco (destrói dados)"
	@echo "  make db-seed       Importa cardapio.csv e faq.csv para o banco"
	@echo "  make bot-seed      Seed de reservations/order_status_logs/question_logs/promotions (roda após hub-seed)"
	@echo "  make test-order    Insere pedido de teste completo no banco"
	@echo "  make test-msg      Simula uma mensagem WhatsApp no n8n (webhook)"
	@echo ""
	@echo "  Order Hub (painel de pedidos):"
	@echo "  make hub-up        Sobe apenas order-hub-api e order-hub-web"
	@echo "  make hub-down      Para order-hub-api e order-hub-web"
	@echo "  make hub-restart   Reinicia order-hub-api e order-hub-web"
	@echo "  make hub-logs      Segue logs do Order Hub em tempo real"
	@echo "  make hub-seed      Cria roles, permissões e admin (admin@orderhub.io / Admin@123)"
	@echo "  make hub-generate  Gera nova migration Drizzle (após mudar schema)"
	@echo ""
	@echo "  Serviços após 'make up':"
	@echo "    http://localhost:3333  Order Hub API  (REST + WebSocket)"
	@echo "    http://localhost:4000  Order Hub Web  (painel operacional + atendimento humano)"
	@echo "    http://localhost:3001  Typebot        (fluxos do bot)"
	@echo "    http://localhost:4100  Metabase       (dashboards e relatórios)"
	@echo "    http://localhost:5678  n8n            (workflows)"
	@echo "    http://localhost:8055  Directus       (painel admin cardápio/config)"
	@echo "    http://localhost:8080  Evolution API  (HOST — rode: make evolution-start)"
	@echo "    http://localhost:8181  Adminer        (banco de dados)"
	@echo ""

# Primeira execução completa — sobe tudo e faz seed de todos os serviços
all: setup up
	@echo ""
	@echo "⏳ Aguardando postgres, n8n e Order Hub API iniciarem..."
	@i=0; \
	while [ $$i -lt 45 ]; do \
	  case $$((i % 10)) in \
	    0) s="⠋";; 1) s="⠙";; 2) s="⠹";; 3) s="⠸";; 4) s="⠼";; \
	    5) s="⠴";; 6) s="⠦";; 7) s="⠧";; 8) s="⠇";; 9) s="⠏";; \
	  esac; \
	  printf "\r   %s  %ds/45s" "$$s" "$$i"; \
	  sleep 1; \
	  i=$$((i+1)); \
	done; \
	printf "\r   ✅  Pronto! (45s/45s)\n"
	@$(MAKE) init
	@echo ""
	@echo "🌸 Ambiente pronto! Acesse os serviços com 'make help'."
	@echo ""

# Seed banco + importa workflows + configura Directus + Order Hub
init: db-seed n8n-import directus-init hub-wait hub-seed bot-seed
	@echo ""
	@echo "🚀 Inicialização concluída."

# Cria o admin do Directus a partir do DIRECTUS_ADMIN_EMAIL/.._PASSWORD do .env
DIRECTUS_EMAIL    := $(shell grep -s ^DIRECTUS_ADMIN_EMAIL    $(ENV_FILE) | cut -d= -f2)
DIRECTUS_PASSWORD := $(shell grep -s ^DIRECTUS_ADMIN_PASSWORD $(ENV_FILE) | cut -d= -f2)

directus-init:
	@echo "📁 Configurando Directus..."
	@docker exec directus node /directus/cli.js bootstrap 2>/dev/null || true
	@ROLE_ID=$$(docker exec postgres psql -U $(DB_USER) -d $(DB_NAME) -tAc \
	  "SELECT id FROM directus_roles WHERE name='Administrator' LIMIT 1;" 2>/dev/null | tr -d ' '); \
	EXISTS=$$(docker exec postgres psql -U $(DB_USER) -d $(DB_NAME) -tAc \
	  "SELECT COUNT(*) FROM directus_users WHERE email='$(DIRECTUS_EMAIL)';" 2>/dev/null | tr -d ' '); \
	if [ "$$EXISTS" = "0" ]; then \
	  docker exec postgres psql -U $(DB_USER) -d $(DB_NAME) -c \
	    "INSERT INTO directus_users (id, first_name, email, password, role, status, provider) \
	     VALUES (gen_random_uuid(), 'Admin', '$(DIRECTUS_EMAIL)', 'placeholder', '$$ROLE_ID', 'active', 'default');" 2>/dev/null; \
	  docker exec directus node /directus/cli.js users passwd \
	    --email "$(DIRECTUS_EMAIL)" --password "$(DIRECTUS_PASSWORD)"; \
	  echo "  Admin Directus criado: $(DIRECTUS_EMAIL)"; \
	else \
	  echo "  Admin Directus já existe — pulando"; \
	fi

setup:
	@test -f $(ENV_FILE) && echo "✅ infra/.env já existe — edite manualmente se necessário" || \
	  (cp infra/.env.example $(ENV_FILE) && echo "📝 infra/.env criado — preencha as credenciais antes de rodar 'make up'")

up:
	@echo "🚀 Subindo containers..."
	$(COMPOSE) up -d

down:
	@echo "⏹️ Parando containers..."
	$(COMPOSE) down

restart:
	@echo "🔄 Reiniciando containers..."
	$(COMPOSE) down
	$(COMPOSE) up -d

logs:
	$(COMPOSE) logs -f

ps:
	$(COMPOSE) ps

# Recria apenas o schema da aplicação (tabelas do bot)
# Não afeta o banco do Typebot
# 1. Drop + recria schema público + drizzle (migração tracking)
# 2. Roda migrations do Drizzle (Order Hub)
# 3. Roda schema do bot (tabelas exclusivas)
db-reset:
	@echo "🔄 Recriando schema da aplicação..."
	$(COMPOSE) exec -T postgres psql \
	  -U $$(grep ^POSTGRES_USER $(ENV_FILE) | cut -d= -f2) \
	  -d $$(grep ^POSTGRES_DB $(ENV_FILE) | cut -d= -f2) \
	  -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public; DROP SCHEMA IF EXISTS drizzle CASCADE; DROP SCHEMA IF EXISTS meta_whatsapp CASCADE;"
	@echo "  📦 Rodando migrations do Drizzle (Order Hub)..."
	docker exec order_hub_api npx drizzle-kit migrate 2>/dev/null || \
	  docker compose -f infra/docker-compose.yml -p ada-technology exec order-hub-api npx drizzle-kit migrate
	@echo "  🤖 Aplicando schema do bot (tabelas exclusivas)..."
	$(COMPOSE) exec -T postgres psql \
	  -U $$(grep ^POSTGRES_USER $(ENV_FILE) | cut -d= -f2) \
	  -d $$(grep ^POSTGRES_DB $(ENV_FILE) | cut -d= -f2) \
	  < database/schema.sql
	@echo "✅ Schema recriado."

DB_USER := $(shell grep ^POSTGRES_USER $(ENV_FILE) | cut -d= -f2)
DB_NAME := $(shell grep ^POSTGRES_DB $(ENV_FILE) | cut -d= -f2)

# Importa os CSVs de dados iniciais para o banco
db-seed:
	@echo "🌱 Populando banco de dados..."
	@bash scripts/seed-db.sh

# Seed das tabelas exclusivas do bot que dependem de customers/tables/orders
# (populados pelo hub-seed) — reservations, order_status_logs, question_logs, promotions
bot-seed:
	@bash scripts/seed-bot-tables.sh

# Importa workflows do n8n via REST API (idempotente — pula se já existir)
N8N_URL      := http://localhost:5678
N8N_EMAIL    := $(shell grep -s ^N8N_EMAIL    $(ENV_FILE) | cut -d= -f2)
N8N_EMAIL    := $(if $(N8N_EMAIL),$(N8N_EMAIL),admin@sakura.local)
N8N_PASSWORD := $(shell grep -s ^N8N_PASSWORD $(ENV_FILE) | cut -d= -f2)
N8N_PASSWORD := $(if $(N8N_PASSWORD),$(N8N_PASSWORD),SakuraBot123)

test:
	@echo ""
	@echo "🧪 Testes de parsing de pedidos"
	@node tests/ordering.test.js
	@echo ""
	@echo "📋 Validação da estrutura do workflow"
	@node tests/workflow.validate.js
	@echo ""

build:
	@echo "🔨 Compilando módulos TypeScript..."
	@node scripts/build-workflow.js

validate: build
	@echo "🔍 Validando workflows..."
	@bash scripts/validate-workflows.sh

n8n-import: validate
	@echo "📦 Importando workflows no n8n..."
	@bash scripts/import-workflows.sh "$(N8N_URL)" "$(N8N_EMAIL)" "$(N8N_PASSWORD)"

# Importa workflows direto no Railway (produção)
# Uso: make n8n-import-railway N8N_RAILWAY_URL=https://n8n-xxx.up.railway.app
n8n-import-railway:
	@bash scripts/import-workflows.sh \
		"$(N8N_RAILWAY_URL)" \
		"$(N8N_EMAIL)" \
		"$(N8N_PASSWORD)"

# Insere um pedido de teste completo no banco (cliente + 2 pedidos + logs + IA)
# Idempotente — limpa dados anteriores antes de inserir
test-order:
	@$(COMPOSE) exec -T postgres psql -U $(DB_USER) -d $(DB_NAME) \
	  < database/seed_test.sql
	@echo ""
	@echo "Visualize em: http://localhost:8181 (Adminer) ou http://localhost:4100 (Metabase)"

# Simula uma mensagem recebida via Evolution API para testar o workflow do n8n
# Uso: make test-msg MSG="quero fazer um pedido" TEL=5511999999999
MSG ?= oi, quero fazer um pedido
TEL ?= 5511999999999

test-msg:
	@curl -s -X POST http://localhost:5678/webhook/whatsapp \
	  -H "Content-Type: application/json" \
	  -d '{ \
	    "event": "messages.upsert", \
	    "instance": "$(shell grep ^EVOLUTION_INSTANCE_NAME $(ENV_FILE) | cut -d= -f2)", \
	    "data": { \
	      "key": { \
	        "remoteJid": "$(TEL)@s.whatsapp.net", \
	        "fromMe": false, \
	        "id": "TESTMSG001" \
	      }, \
	      "message": { "conversation": "$(MSG)" }, \
	      "messageTimestamp": "$(shell date +%s)", \
	      "pushName": "Cliente Teste" \
	    } \
	  }' | cat
	@echo ""

# Evolution API — roda no HOST (Baileys não funciona em Docker no Mac)
# Instalar: npm install -g @evolution-api/cli
EVOLUTION_ENV = AUTHENTICATION_API_KEY=$(shell grep ^AUTHENTICATION_API_KEY $(ENV_FILE) | cut -d= -f2) \
                AUTHENTICATION_JWT_SECRET=$(shell grep ^AUTHENTICATION_JWT_SECRET $(ENV_FILE) | cut -d= -f2) \
                DATABASE_ENABLED=true \
                DATABASE_PROVIDER=postgresql \
                DATABASE_CONNECTION_URI=postgresql://$(DB_USER):$(shell grep ^POSTGRES_PASSWORD $(ENV_FILE) | cut -d= -f2)@localhost:5432/evolution \
                CACHE_REDIS_ENABLED=true \
                CACHE_REDIS_URI=redis://localhost:6379 \
                SERVER_URL=http://localhost:8080 \
                WEBHOOK_GLOBAL_URL=http://localhost:5678/webhook/whatsapp \
                WEBHOOK_GLOBAL_ENABLED=true \
                WEBHOOK_EVENTS_MESSAGES_UPSERT=true

evolution-start:
	@echo "Iniciando Evolution API no HOST (porta 8080)..."
	@$(EVOLUTION_ENV) evolution-api --port 8080 & echo $$! > /tmp/evolution.pid
	@echo "PID: $$(cat /tmp/evolution.pid)"
	@echo "Manager: http://localhost:8080/manager"

evolution-stop:
	@[ -f /tmp/evolution.pid ] && kill $$(cat /tmp/evolution.pid) && rm /tmp/evolution.pid && echo "Evolution parado" || echo "Evolution não está rodando"

evolution-logs:
	@tail -f /tmp/evolution.log 2>/dev/null || echo "Log não encontrado — use 'make evolution-start' primeiro"

# ─── Order Hub ───────────────────────────────────────────────────────────────

# Aguarda a API do Order Hub responder /health (até 3 min)
hub-wait:
	@echo "⏳ Aguardando Order Hub API..."
	@n=0; until curl -sf http://localhost:3333/health > /dev/null 2>&1; do \
	  n=$$((n+1)); \
	  if [ $$n -ge 36 ]; then echo "\n  ❌ Timeout — verifique: make hub-logs" && exit 1; fi; \
	  printf '.'; sleep 5; \
	done
	@echo " ✅ pronta!"

# Sobe apenas os serviços do Order Hub (postgres e redis devem já estar rodando)
hub-up:
	$(COMPOSE) up -d order-hub-api order-hub-web

hub-down:
	$(COMPOSE) stop order-hub-api order-hub-web

hub-restart:
	$(COMPOSE) restart order-hub-api order-hub-web

hub-logs:
	$(COMPOSE) logs -f order-hub-api order-hub-web

# Seed: cria roles, permissões e usuário admin padrão (admin@orderhub.io / Admin@123)
# Container roda em node:22 (não bun) — seed via npm/tsx conforme package.json.
hub-seed:
	@echo "🌱 Seed Order Hub..."
	$(COMPOSE) exec order-hub-api npm run db:seed

# Gera nova migration Drizzle após mudança de schema (persiste em apps/api/drizzle/migrations/)
hub-generate:
	$(COMPOSE) exec order-hub-api npm run db:generate

# Servidor da loja (roda sem internet): make loja-setup, make loja-up
include infra/loja/loja.mk
