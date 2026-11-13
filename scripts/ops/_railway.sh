# Funções comuns dos scripts de operação. Não rode direto: é carregado pelos outros.
# shellcheck shell=bash

QUICKCART_PROJECT_ID="6cb8ca88-b886-4dfc-8b43-8b62c902d985"
# A demonstração do ComandAdA roda dentro do projeto quickcart, nos serviços comandada-*.
COMANDADA_PROJECT_ID="$QUICKCART_PROJECT_ID"
COMANDADA_API_SERVICE="comandada-api"
COMANDADA_N8N_SERVICE="comandada-n8n"
RAILWAY_ENVIRONMENT="${RAILWAY_ENVIRONMENT:-staging}"

N8N_URL="${N8N_URL:-https://n8n-comandada-yuyaki.up.railway.app}"
META_CALLBACK_URL="${META_CALLBACK_URL:-$N8N_URL/webhook/whatsapp}"

die() { echo "✗ $*" >&2; exit 1; }
info() { echo "→ $*"; }
ok() { echo "✓ $*"; }

require() {
  for command_name in "$@"; do
    command -v "$command_name" >/dev/null 2>&1 || die "Falta o comando '$command_name' no PATH."
  done
}

# A CLI do Railway guarda o projeto "linkado" por diretório. Cada projeto ganha uma pasta
# temporária própria, para os dois links não se sobrescreverem.
railway_workdir() {
  local project_id="$1"
  local directory
  directory="$(mktemp -d)"
  (cd "$directory" && railway link --project "$project_id" --environment "$RAILWAY_ENVIRONMENT" --service api >/dev/null) \
    || die "Não consegui linkar o projeto $project_id. Rode 'railway login' antes."
  echo "$directory"
}

# Lê as variáveis de um serviço no formato KEY=VALUE, sem imprimir nada na tela.
railway_read_variables() {
  local workdir="$1" service="$2"
  (cd "$workdir" && railway variables --service "$service" --environment "$RAILWAY_ENVIRONMENT" --kv)
}

# Grava uma variável sem redeploy (o redeploy é feito uma vez no fim).
railway_set_variable() {
  local workdir="$1" service="$2" key="$3" value="$4"
  (cd "$workdir" && railway variables --service "$service" --environment "$RAILWAY_ENVIRONMENT" \
    --set "$key=$value" --skip-deploys >/dev/null) || die "Falha ao gravar $key em $service."
}

railway_redeploy() {
  local workdir="$1" service="$2"
  (cd "$workdir" && railway redeploy --service "$service" --yes >/dev/null) \
    || echo "  (redeploy de $service não confirmou; confira no painel)"
}
