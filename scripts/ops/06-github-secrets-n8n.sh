#!/usr/bin/env bash
# Grava no GitHub os secrets que a migration dos workflows (Sync n8n Workflows) usa:
#   N8N_URL                      URL do n8n de staging
#   N8N_API_KEY                  a chave salva pelo 02-n8n-dono-e-workflows.sh
#   N8N_POSTGRES_CREDENTIAL_ID   só se o 02 já criou a credencial (opcional para o workflow)
#
# Precisa do gh logado com acesso de admin ao repositório (gh auth login).
# Uso: bash scripts/ops/06-github-secrets-n8n.sh
#      GITHUB_REPOSITORY=dono/repo bash scripts/ops/06-github-secrets-n8n.sh
set -euo pipefail
source "$(dirname "$0")/_railway.sh"
require gh

repository="${GITHUB_REPOSITORY:-Andersonfrfilho/comandada}"
key_file="${HOME}/.config/comandada/n8n-api-key"
credential_file="${HOME}/.config/comandada/n8n-postgres-credential-id"

gh auth status >/dev/null 2>&1 || die "O gh não está logado. Rode 'gh auth login' e tente de novo."
[ -s "$key_file" ] || die "Não achei a API key em $key_file. Rode antes o 02-n8n-dono-e-workflows.sh."

info "Conferindo se o n8n responde em $N8N_URL..."
status="$(curl -s -o /dev/null -w '%{http_code}' -H "X-N8N-API-KEY: $(cat "$key_file")" "$N8N_URL/api/v1/workflows?limit=1" || true)"
[ "$status" = "200" ] || die "O n8n respondeu $status com essa API key. Gere outra com FORCE_NEW_KEY=1 no 02 e rode de novo."

info "Gravando secrets em $repository..."
gh secret set N8N_URL --repo "$repository" --body "$N8N_URL"
gh secret set N8N_API_KEY --repo "$repository" < "$key_file"
if [ -s "$credential_file" ]; then
  gh secret set N8N_POSTGRES_CREDENTIAL_ID --repo "$repository" < "$credential_file"
fi

gh secret list --repo "$repository" | grep -E '^N8N_' || true
ok "Pronto. Para testar sem alterar nada: gh workflow run sync-n8n-workflows.yml --repo $repository -f dry_run=true"
