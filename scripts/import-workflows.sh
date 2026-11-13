#!/usr/bin/env bash
# Importa e ATUALIZA todos os workflows de n8n/workflows/ via API Key (n8n v1+)
# Se o workflow já existe: PUT (atualiza). Se não: POST (cria).
# Uso: N8N_API_KEY=xxx bash scripts/import-workflows.sh [n8n_url]

set -euo pipefail

N8N_URL="${1:-${N8N_URL:-http://localhost:5678}}"
N8N_API_KEY="${N8N_API_KEY:-}"
WORKFLOWS_DIR="$(dirname "$0")/../n8n/workflows"

if [ -z "$N8N_API_KEY" ]; then
  echo "ERRO: N8N_API_KEY não definida."
  echo "Gere uma em: n8n UI → Settings → n8n API → Create API Key"
  exit 1
fi

echo "Sincronizando workflows para $N8N_URL..."

# Aguarda n8n ficar disponível
for i in $(seq 1 30); do
  if curl -sf "$N8N_URL/healthz" >/dev/null 2>&1; then
    break
  fi
  echo "  Aguardando n8n... ($i/30)"
  sleep 3
done

api() {
  local method="$1" path="$2"
  shift 2
  curl -s \
    -H "X-N8N-API-KEY: $N8N_API_KEY" \
    -H "Content-Type: application/json" \
    -X "$method" "$N8N_URL/api/v1$path" "$@"
}

# Busca todos os workflows existentes (id + name)
EXISTING_JSON=$(api GET "/workflows?limit=100")

get_existing_id() {
  local name="$1"
  echo "$EXISTING_JSON" | python3 -c "
import json, sys
name = sys.argv[1]
data = json.load(sys.stdin)
for w in data.get('data', []):
    if w.get('name') == name:
        print(w.get('id', ''))
        break
" "$name" 2>/dev/null || true
}

strip_readonly() {
  local wf_file="$1"
  python3 - "$wf_file" <<'PYEOF'
import json, sys
with open(sys.argv[1]) as f:
    wf = json.load(f)
for key in ('id', 'active', 'versionId', 'activeVersionId', 'activeVersion', 'tags', 'shared'):
    wf.pop(key, None)
# Os JSONs apontam para a credencial "Postgres account" do n8n onde foram exportados. Num n8n
# novo ela tem outro id: N8N_POSTGRES_CREDENTIAL_ID troca a referência pela credencial daqui.
import os
postgres_credential_id = os.environ.get('N8N_POSTGRES_CREDENTIAL_ID', '')
if postgres_credential_id:
    for node in wf.get('nodes', []):
        postgres = (node.get('credentials') or {}).get('postgres')
        if postgres is not None:
            postgres['id'] = postgres_credential_id
if 'settings' not in wf:
    wf['settings'] = {"executionOrder": "v1"}
print(json.dumps(wf))
PYEOF
}

CREATED=0
UPDATED=0
FAILED=0

for wf_file in "$WORKFLOWS_DIR"/*.json; do
  [ -f "$wf_file" ] || continue

  WF_NAME=$(python3 -c "import json; print(json.load(open('$wf_file')).get('name',''))" 2>/dev/null)
  [ -z "$WF_NAME" ] && continue

  EXISTING_ID=$(get_existing_id "$WF_NAME")
  WF_DATA=$(strip_readonly "$wf_file")

  if [ -n "$EXISTING_ID" ]; then
    echo "  ↺ Atualizando '$WF_NAME' (id=$EXISTING_ID)..."

    # Desativa e desarquiva antes de atualizar
    api POST "/workflows/$EXISTING_ID/deactivate" -d '{}' >/dev/null 2>&1 || true
    api POST "/workflows/$EXISTING_ID/unarchive" -d '{}' >/dev/null 2>&1 || true

    RESULT=$(echo "$WF_DATA" | api PUT "/workflows/$EXISTING_ID" -d @-)
    WF_ID=$(echo "$RESULT" | python3 -c \
      "import json,sys; d=json.load(sys.stdin); print(d.get('id',''))" 2>/dev/null || true)

    if [ -z "$WF_ID" ]; then
      echo "  ✗ Falha ao atualizar '$WF_NAME'"
      echo "    Resposta: $RESULT"
      FAILED=$((FAILED + 1))
      continue
    fi

    api POST "/workflows/$WF_ID/activate" -d '{}' >/dev/null 2>&1 || true
    echo "  ✓ '$WF_NAME' atualizado e ativado"
    UPDATED=$((UPDATED + 1))
  else
    echo "  → Criando '$WF_NAME'..."

    RESULT=$(echo "$WF_DATA" | api POST "/workflows" -d @-)
    WF_ID=$(echo "$RESULT" | python3 -c \
      "import json,sys; d=json.load(sys.stdin); print(d.get('id',''))" 2>/dev/null || true)

    if [ -z "$WF_ID" ]; then
      echo "  ✗ Falha ao criar '$WF_NAME'"
      echo "    Resposta: $RESULT"
      FAILED=$((FAILED + 1))
      continue
    fi

    api POST "/workflows/$WF_ID/activate" -d '{}' >/dev/null 2>&1 || true
    echo "  ✓ '$WF_NAME' criado e ativado (id=$WF_ID)"
    CREATED=$((CREATED + 1))
  fi
done

echo ""
echo "Concluído: $CREATED criado(s), $UPDATED atualizado(s), $FAILED falha(s)."
