#!/usr/bin/env bash
# Mantido por compatibilidade (Makefile, scripts/ops). A lógica está em scripts/n8n-migrate.sh.
# Uso: N8N_API_KEY=xxx bash scripts/import-workflows.sh [n8n_url]
set -euo pipefail
if [ -n "${1:-}" ]; then export N8N_URL="$1"; fi
exec bash "$(dirname "$0")/n8n-migrate.sh"
