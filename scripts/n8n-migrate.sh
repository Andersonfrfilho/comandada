#!/usr/bin/env bash
# Migration dos workflows do n8n: aplica n8n/workflows/*.json pela API do n8n e só mexe no que
# mudou (ativação conforme n8n/manifest.json). Roda sozinha no GitHub Actions a cada push na main
# (.github/workflows/sync-n8n-workflows.yml) e pode rodar à mão:
#
#   N8N_URL=https://n8n-... N8N_API_KEY=xxx bash scripts/n8n-migrate.sh
#   DRY_RUN=1 ...   mostra o que faria sem alterar nada
set -euo pipefail
exec python3 "$(dirname "$0")/n8n_migrate.py" "$@"
