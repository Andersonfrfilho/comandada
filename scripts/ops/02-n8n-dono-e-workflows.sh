#!/usr/bin/env bash
# Prepara o n8n do ComandAdA de ponta a ponta:
#   1. cria a conta de dono (ou entra nela, se já existir);
#   2. gera uma API key;
#   3. cria a credencial "Postgres account" (usada pelos crons), lendo o banco do serviço
#      comandada-n8n no Railway;
#   4. importa e ativa os workflows de n8n/workflows/ (scripts/import-workflows.sh).
#
# A API key e o id da credencial ficam em ~/.config/comandada/ (permissão 600), para rodar de
# novo sem repetir o login nem duplicar a credencial. Rode na raiz do repositório, depois do `make build` se mexeu em src/.
#
# Uso: N8N_OWNER_EMAIL=voce@exemplo.com bash scripts/ops/02-n8n-dono-e-workflows.sh
set -euo pipefail
source "$(dirname "$0")/_railway.sh"
require curl python3

repository_root="$(cd "$(dirname "$0")/../.." && pwd)"
key_file="${HOME}/.config/comandada/n8n-api-key"
credential_file="${HOME}/.config/comandada/n8n-postgres-credential-id"
cookie_jar="$(mktemp)"
browser_id="$(python3 -c 'import uuid; print(uuid.uuid4())')"
trap 'rm -f "$cookie_jar"' EXIT

rest() {
  local method="$1" path="$2"
  shift 2
  curl -sS -b "$cookie_jar" -c "$cookie_jar" -H "Content-Type: application/json" \
    -H "browser-id: $browser_id" -X "$method" "$N8N_URL/rest$path" "$@"
}

json_get() {
  python3 -c '
import json, sys
data = json.load(sys.stdin)
for part in sys.argv[1].split("."):
    data = data.get(part, {}) if isinstance(data, dict) else {}
print(data if isinstance(data, (str, int, bool)) else "")
' "$1"
}

info "Esperando o n8n responder em $N8N_URL..."
for attempt in $(seq 1 30); do
  curl -sf "$N8N_URL/healthz" >/dev/null 2>&1 && break
  [ "$attempt" = 30 ] && die "O n8n não respondeu."
  sleep 3
done

if [ -s "$key_file" ] && [ -z "${FORCE_NEW_KEY:-}" ]; then
  ok "Usando a API key salva em $key_file (FORCE_NEW_KEY=1 para gerar outra)."
else
  [ -n "${N8N_OWNER_EMAIL:-}" ] || die "Defina N8N_OWNER_EMAIL."
  if [ -z "${N8N_OWNER_PASSWORD:-}" ]; then
    read -r -s -p "Senha do dono do n8n (8+ caracteres, 1 maiúscula e 1 número): " N8N_OWNER_PASSWORD
    echo
  fi

  credentials="$(python3 -c '
import json, sys
print(json.dumps({"email": sys.argv[1], "password": sys.argv[2],
                  "emailOrLdapLoginId": sys.argv[1],
                  "firstName": sys.argv[3], "lastName": sys.argv[4]}))
' "$N8N_OWNER_EMAIL" "$N8N_OWNER_PASSWORD" "${N8N_OWNER_FIRST_NAME:-Anderson}" "${N8N_OWNER_LAST_NAME:-Fernandes}")"

  needs_setup="$(rest GET /settings | json_get data.userManagement.showSetupOnFirstLoad)"
  if [ "$needs_setup" = "True" ]; then
    info "Criando a conta de dono..."
    response="$(rest POST /owner/setup -d "$credentials")"
    [ -n "$(echo "$response" | json_get data.id)" ] || die "Falha ao criar o dono: $response"
    ok "Dono criado: $N8N_OWNER_EMAIL"
  else
    info "O n8n já tem dono. Entrando com $N8N_OWNER_EMAIL..."
    response="$(rest POST /login -d "$credentials")"
    [ -n "$(echo "$response" | json_get data.id)" ] || die "Login recusado: $response"
  fi

  info "Gerando a API key..."
  scopes="$(rest GET /api-keys/scopes | python3 -c 'import json,sys; print(json.dumps(json.load(sys.stdin).get("data", [])))' 2>/dev/null || echo '[]')"
  body="$(python3 -c 'import json,sys; print(json.dumps({"label": "comandada-ops", "scopes": json.loads(sys.argv[1]), "expiresAt": None}))' "$scopes")"
  response="$(rest POST /api-keys -d "$body")"
  api_key="$(echo "$response" | json_get data.rawApiKey)"
  [ -n "$api_key" ] || api_key="$(echo "$response" | json_get data.apiKey)"
  [ -n "$api_key" ] || die "Não consegui gerar a API key (crie em Settings → n8n API e salve em $key_file): $response"

  mkdir -p "$(dirname "$key_file")"
  (umask 077 && printf '%s' "$api_key" > "$key_file")
  ok "API key salva em $key_file"
fi

api_key="$(cat "$key_file")"

if [ -s "$credential_file" ]; then
  ok "Usando a credencial do Postgres já criada (id $(cat "$credential_file"))."
else
  require railway mktemp
  info "Criando a credencial do Postgres no n8n..."
  railway_dir="$(railway_workdir "$COMANDADA_PROJECT_ID")"
  database_variables="$(railway_read_variables "$railway_dir" "$COMANDADA_N8N_SERVICE" | grep -E '^DB_POSTGRESDB_' || true)"
  rm -rf "$railway_dir"
  [ -n "$database_variables" ] || die "Não li as variáveis DB_POSTGRESDB_* do $COMANDADA_N8N_SERVICE no Railway."
  body="$(DATABASE_VARIABLES="$database_variables" python3 -c '
import json, os
variables = dict(line.split("=", 1) for line in os.environ["DATABASE_VARIABLES"].splitlines() if "=" in line)
print(json.dumps({"name": "Postgres account", "type": "postgres", "data": {
    "host": variables.get("DB_POSTGRESDB_HOST", ""),
    "port": int(variables.get("DB_POSTGRESDB_PORT", "5432")),
    "database": variables.get("DB_POSTGRESDB_DATABASE", ""),
    "user": variables.get("DB_POSTGRESDB_USER", ""),
    "password": variables.get("DB_POSTGRESDB_PASSWORD", ""),
    "ssl": "disable", "sshTunnel": False}}))
')"
  response="$(curl -sS -H "X-N8N-API-KEY: $api_key" -H "Content-Type: application/json" \
    -X POST "$N8N_URL/api/v1/credentials" -d "$body")"
  credential_id="$(echo "$response" | json_get id)"
  [ -n "$credential_id" ] || die "O n8n recusou a credencial do Postgres: $response"
  mkdir -p "$(dirname "$credential_file")"
  (umask 077 && printf '%s' "$credential_id" > "$credential_file")
  ok "Credencial do Postgres criada (id $credential_id)."
fi

info "Importando e ativando os workflows..."
N8N_API_KEY="$api_key" N8N_POSTGRES_CREDENTIAL_ID="$(cat "$credential_file")" \
  bash "$repository_root/scripts/import-workflows.sh" "$N8N_URL"

echo
ok "n8n pronto. URL de callback para a Meta: $META_CALLBACK_URL"
