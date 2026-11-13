#!/usr/bin/env bash
# Desde que o ComandAdA passou a rodar no projeto quickcart, comandada-api e comandada-n8n já
# leem WHATSAPP_* da api do QuickCart por referência (${{api.WHATSAPP_*}}). Este script só
# serve para fixar cópias, e substitui as referências.
#
# Copia as variáveis WHATSAPP_* da api do QuickCart (staging) para os serviços api e n8n do
# ComandAdA (staging). Nenhum valor aparece na tela.
#
# Pré-requisitos: CLI do Railway (https://docs.railway.com/guides/cli) e `railway login`.
# Uso: bash scripts/ops/01-copiar-whatsapp-do-quickcart.sh
set -euo pipefail
source "$(dirname "$0")/_railway.sh"
require railway mktemp

info "Lendo as variáveis da api do QuickCart..."
quickcart_dir="$(railway_workdir "$QUICKCART_PROJECT_ID")"
comandada_dir="$(railway_workdir "$COMANDADA_PROJECT_ID")"
trap 'rm -rf "$quickcart_dir" "$comandada_dir"' EXIT

whatsapp_lines="$(railway_read_variables "$quickcart_dir" api | grep -E '^WHATSAPP_[A-Z_]+=' || true)"
[ -n "$whatsapp_lines" ] || die "Nenhuma variável WHATSAPP_* encontrada na api do QuickCart."

copied=0
while IFS= read -r line; do
  key="${line%%=*}"
  value="${line#*=}"
  [ -n "$value" ] || { echo "  (pulando $key: vazia no QuickCart)"; continue; }
  for service in "$COMANDADA_API_SERVICE" "$COMANDADA_N8N_SERVICE"; do
    railway_set_variable "$comandada_dir" "$service" "$key" "$value"
  done
  echo "  $key copiada para api e n8n"
  copied=$((copied + 1))
done <<< "$whatsapp_lines"

[ "$copied" -gt 0 ] || die "Nada copiado."

info "Redeploy da api e do n8n do ComandAdA..."
railway_redeploy "$comandada_dir" "$COMANDADA_API_SERVICE"
railway_redeploy "$comandada_dir" "$COMANDADA_N8N_SERVICE"
ok "$copied variável(is) copiada(s). O QuickCart não foi alterado."
