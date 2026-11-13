#!/usr/bin/env bash
# Lista, em TODOS os seus projetos e ambientes do Railway (produção incluída), quais serviços
# ainda usam o token do WhatsApp que vazou. Só lê: não altera nada e não imprime nenhum valor.
#
# A comparação é pelo começo do token (OLD_TOKEN_PREFIX). Os 12 primeiros caracteres não servem
# para nada sozinhos, e o token inteiro nunca passa por este script.
#
# Uso: bash scripts/ops/05-onde-esta-o-token-antigo.sh
set -euo pipefail
source "$(dirname "$0")/_railway.sh"
require railway python3 mktemp

OLD_TOKEN_PREFIX="${OLD_TOKEN_PREFIX:-EAAOdYzIYwN4}"

projects_json="$(railway list --json)" || die "Falha no 'railway list'. Rode 'railway login'."
mapfile -t projects < <(echo "$projects_json" | python3 -c '
import json, sys
data = json.load(sys.stdin)
items = data if isinstance(data, list) else data.get("projects", [])
for project in items:
    print(project["id"] + "\t" + project.get("name", "?"))
')

found=0
for project_line in "${projects[@]}"; do
  project_id="${project_line%%$'\t'*}"
  project_name="${project_line#*$'\t'}"
  workdir="$(mktemp -d)"
  if ! (cd "$workdir" && railway link --project "$project_id" >/dev/null 2>&1); then
    echo "  (não consegui abrir o projeto $project_name)"; rm -rf "$workdir"; continue
  fi

  mapfile -t pairs < <(cd "$workdir" && railway status --json | python3 -c '
import json, sys
data = json.load(sys.stdin)
def nodes(block):
    return [edge["node"] for edge in (block or {}).get("edges", [])]
environments = [environment["name"] for environment in nodes(data.get("environments"))]
services = [service["name"] for service in nodes(data.get("services"))]
for environment in environments:
    for service in services:
        print(environment + "\t" + service)
')

  for pair in "${pairs[@]}"; do
    environment="${pair%%$'\t'*}"
    service="${pair#*$'\t'}"
    value="$(cd "$workdir" && railway variables --service "$service" --environment "$environment" --kv 2>/dev/null \
      | grep -E '^WHATSAPP_ACCESS_TOKEN=' | head -1 | cut -d= -f2- || true)"
    if [ -n "$value" ] && [ "${value#"$OLD_TOKEN_PREFIX"}" != "$value" ]; then
      echo "⚠️  $project_name / $environment / $service usa o token antigo"
      found=$((found + 1))
    elif [ -n "$value" ]; then
      echo "   $project_name / $environment / $service tem outro token"
    fi
  done
  rm -rf "$workdir"
done

echo
if [ "$found" -eq 0 ]; then
  ok "Nenhum serviço usa o token antigo. Pode revogar."
else
  echo "$found serviço(s) ainda usam o token antigo. Troque em todos antes de revogar."
fi
