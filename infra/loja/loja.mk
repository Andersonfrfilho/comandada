# Alvos do servidor da loja (ComandAdA rodando sem internet). Incluído pelo Makefile da raiz.
LOJA_COMPOSE = docker compose -f infra/loja/docker-compose.yml --env-file infra/loja/.env
LOJA_SECRET_KEYS = POSTGRES_PASSWORD JWT_SECRET JWT_REFRESH_SECRET APP_SECRET N8N_INTERNAL_API_TOKEN

.PHONY: loja-setup loja-up loja-down loja-logs loja-ps loja-backup loja-restore

loja-setup: ## Cria infra/loja/.env com segredos aleatórios
	@if [ -f infra/loja/.env ]; then echo "infra/loja/.env já existe"; exit 0; fi; \
	cp infra/loja/.env.example infra/loja/.env; \
	for key in $(LOJA_SECRET_KEYS); do \
		sed -i "s|^$$key=.*|$$key=$$(openssl rand -hex 32)|" infra/loja/.env; \
	done; \
	echo "infra/loja/.env criado. Ajuste FISCAL_PRINTER_INTERFACE com o IP da impressora."

loja-up: ## Sobe o ComandAdA no servidor da loja
	$(LOJA_COMPOSE) up -d --build
	@echo "Painel: http://comandada.local  (ou http://$$(hostname -I | awk '{print $$1}'))"

loja-down:
	$(LOJA_COMPOSE) down

loja-logs:
	$(LOJA_COMPOSE) logs -f --tail=100

loja-ps:
	$(LOJA_COMPOSE) ps

loja-backup: ## Backup manual do banco agora
	$(LOJA_COMPOSE) exec backup sh -c 'pg_dump --format=custom --file=/backups/comandada_manual_$$(date +%Y-%m-%d_%H%M).dump'
	@ls -1t infra/loja/backups/*.dump | head -3

loja-restore: ## Restaura um backup: make loja-restore FILE=infra/loja/backups/arquivo.dump
	@test -n "$(FILE)" || { echo "Use: make loja-restore FILE=infra/loja/backups/arquivo.dump"; exit 1; }
	$(LOJA_COMPOSE) exec -T backup sh -c 'pg_restore --clean --if-exists --dbname="$$PGDATABASE"' < $(FILE)
