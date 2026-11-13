#!/usr/bin/env bash
# Aponta o webhook do app da Meta para o n8n do ComandAdA e inscreve a conta do WhatsApp
# Business no app. É o passo que tira as mensagens do QuickCart e passa para o ComandAdA.
#
# Para voltar ao QuickCart: rode de novo com
#   META_CALLBACK_URL=https://quickcart-api-staging.up.railway.app/v1/webhook/whatsapp
#
# Precisa de: META_APP_ID e META_APP_SECRET (developers.facebook.com → app → Configurações
# → Básico). O verify token e o WABA ID são lidos do serviço n8n do ComandAdA no Railway,
# então rode o 01 antes. O app secret é pedido sem eco se não vier no ambiente.
#
# Uso: META_APP_ID=123 bash scripts/ops/03-meta-apontar-webhook.sh
set -euo pipefail
source "$(dirname "$0")/_railway.sh"
require railway curl python3 mktemp

graph="https://graph.facebook.com/${WHATSAPP_API_VERSION:-v21.0}"
[ -n "${META_APP_ID:-}" ] || die "Defina META_APP_ID."
if [ -z "${META_APP_SECRET:-}" ]; then
  read -r -s -p "App secret do app da Meta: " META_APP_SECRET
  echo
fi

comandada_dir="$(railway_workdir "$COMANDADA_PROJECT_ID")"
trap 'rm -rf "$comandada_dir"' EXIT
variables="$(railway_read_variables "$comandada_dir" "$COMANDADA_N8N_SERVICE")"
read_variable() { echo "$variables" | grep -E "^$1=" | head -1 | cut -d= -f2-; }

verify_token="$(read_variable WHATSAPP_WEBHOOK_VERIFY_TOKEN)"
waba_id="$(read_variable WHATSAPP_BUSINESS_ACCOUNT_ID)"
access_token="$(read_variable WHATSAPP_ACCESS_TOKEN)"
[ -n "$verify_token" ] || die "WHATSAPP_WEBHOOK_VERIFY_TOKEN vazio no n8n do ComandAdA (rode o 01)."

info "Apontando o webhook do app para $META_CALLBACK_URL ..."
response="$(curl -sS -X POST "$graph/$META_APP_ID/subscriptions" \
  --data-urlencode "object=whatsapp_business_account" \
  --data-urlencode "callback_url=$META_CALLBACK_URL" \
  --data-urlencode "verify_token=$verify_token" \
  --data-urlencode "fields=messages" \
  --data-urlencode "access_token=$META_APP_ID|$META_APP_SECRET")"
echo "$response" | grep -q '"success":true' || die "A Meta recusou o webhook (o n8n respondeu ao handshake?): $response"
ok "Webhook apontado. A Meta já fez o handshake com o n8n."

if [ -n "$waba_id" ] && [ -n "$access_token" ]; then
  info "Inscrevendo a conta do WhatsApp Business no app..."
  response="$(curl -sS -X POST "$graph/$waba_id/subscribed_apps" -H "Authorization: Bearer $access_token")"
  echo "$response" | grep -q '"success":true' && ok "Conta inscrita." \
    || echo "  (inscrição não confirmou: $response)"
fi

echo
ok "Pronto. Mande \"oi\" para o número e acompanhe os logs do n8n no Railway."
