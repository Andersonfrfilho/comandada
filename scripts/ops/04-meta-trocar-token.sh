#!/usr/bin/env bash
# Troca o access token do WhatsApp no ComandAdA (api e n8n) e confere que o antigo morreu.
#
# A REVOGAÇÃO é manual, porque a Meta não revoga token de system user por API:
#   1. business.facebook.com → Configurações do negócio → Usuários → Usuários do sistema.
#   2. Escolha o usuário do sistema do app → "Revogar tokens".
#   3. "Gerar novo token" → app do bot → permissões whatsapp_business_messaging e
#      whatsapp_business_management → validade "Nunca" → copie o token.
# Depois rode este script e cole o token novo quando ele pedir (sem eco).
#
# Uso: bash scripts/ops/04-meta-trocar-token.sh
set -euo pipefail
source "$(dirname "$0")/_railway.sh"
require railway curl python3 mktemp

graph="https://graph.facebook.com/${WHATSAPP_API_VERSION:-v21.0}"

if [ -n "${OLD_TOKEN_FILE:-}" ]; then
  info "Conferindo se o token antigo foi revogado..."
  if curl -sS "$graph/me?access_token=$(cat "$OLD_TOKEN_FILE")" | grep -q '"error"'; then
    ok "Token antigo recusado pela Meta, como esperado."
  else
    die "O token antigo AINDA FUNCIONA. Revogue em Usuários do sistema → Revogar tokens."
  fi
fi

read -r -s -p "Token novo do WhatsApp: " new_token
echo
[ -n "$new_token" ] || die "Token vazio."

response="$(curl -sS "$graph/me?access_token=$new_token")"
echo "$response" | grep -q '"id"' || die "A Meta recusou o token novo: $response"
ok "Token novo válido."

comandada_dir="$(railway_workdir "$COMANDADA_PROJECT_ID")"
trap 'rm -rf "$comandada_dir"' EXIT
for service in "$COMANDADA_API_SERVICE" "$COMANDADA_N8N_SERVICE"; do
  railway_set_variable "$comandada_dir" "$service" WHATSAPP_ACCESS_TOKEN "$new_token"
done
railway_redeploy "$comandada_dir" "$COMANDADA_API_SERVICE"
railway_redeploy "$comandada_dir" "$COMANDADA_N8N_SERVICE"
ok "WHATSAPP_ACCESS_TOKEN trocado na api e no n8n do ComandAdA."
