#!/usr/bin/env bash
# Valida os workflows n8n antes de subir:
#   1. JSON sintaxe válida
#   2. JS de cada Code node compila sem erro (node --check)
#   3. Anti-padrões conhecidos que causam bugs em produção

set -euo pipefail

WORKFLOWS_DIR="$(dirname "$0")/../n8n/workflows"
ERRORS=0
WARNINGS=0
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

red()    { printf '\033[31m%s\033[0m\n' "$*"; }
green()  { printf '\033[32m%s\033[0m\n' "$*"; }
yellow() { printf '\033[33m%s\033[0m\n' "$*"; }
bold()   { printf '\033[1m%s\033[0m\n' "$*"; }

# Script Python para extrair jsCode de cada Code node
cat > "$TMP/extract_nodes.py" << 'PYEOF'
import json, sys
wf = json.load(open(sys.argv[1]))
for node in wf.get('nodes', []):
    if node.get('type') == 'n8n-nodes-base.code':
        code = node.get('parameters', {}).get('jsCode', '')
        if code:
            print(json.dumps({'name': node.get('name', '?'), 'code': code}))
PYEOF

# Script Python para detectar anti-padrões
cat > "$TMP/check_patterns.py" << 'PYEOF'
import json, sys, re

wf = json.load(open(sys.argv[1]))

ANTIPATTERNS = [
    (r'body: String\(msg\)\s*\}',
     "buildPayload usa String(msg) diretamente como body — causa [object Object] em novos tipos (sem type check antes)",
     True),
    (r'\.toFixed\(2\)(?!\.replace)',
     "toFixed(2) sem .replace('.', ',') — exibe formato americano ex: 134.90",
     True),
    (r'parseFloat\w+fmtBRL',
     "parseFloat concatenado com fmtBRL — nome de função corrompido",
     True),
    (r'console\.log',
     "console.log em produção (remover antes de subir)",
     False),
]

for node in wf.get('nodes', []):
    if node.get('type') != 'n8n-nodes-base.code':
        continue
    code = node.get('parameters', {}).get('jsCode', '')
    name = node.get('name', '?')
    for pattern, msg, is_error in ANTIPATTERNS:
        if re.search(pattern, code):
            level = 'ERROR' if is_error else 'WARN'
            print(f'{level}:[{name}] {msg}')
PYEOF

bold "=== Testes de Fluxo ==="
FLOW_TEST="$(dirname "$0")/../tests/flow.test.js"
if [ -f "$FLOW_TEST" ]; then
  if node "$FLOW_TEST"; then
    echo ""
  else
    echo ""
    red "✗ Testes de fluxo falharam — corrija antes de subir"
    exit 1
  fi
else
  yellow "⚠ tests/flow.test.js não encontrado — pulando testes de fluxo"
fi

bold "=== Gravar antes de responder ==="
if ! node "$(dirname "$0")/../tests/save-before-reply.test.js"; then
  red "✗ Nó Gravar Pedido e Reserva falhou — corrija antes de subir"
  exit 1
fi
echo ""

bold "=== Webhook da Meta (assinatura e repetição) ==="
if ! node "$(dirname "$0")/../tests/webhook-guard.test.js"; then
  red "✗ Nó Extrair Mensagem falhou — corrija antes de subir"
  exit 1
fi
echo ""

bold "=== Validando workflows n8n ==="
echo ""

for wf_file in "$WORKFLOWS_DIR"/*.json; do
  [ -f "$wf_file" ] || continue
  WF_NAME=$(basename "$wf_file")
  bold "── $WF_NAME"

  # ── 1. JSON válido ───────────────────────────────────────────────────────
  if ! python3 -c "import json,sys; json.load(open(sys.argv[1]))" "$wf_file" 2>/dev/null; then
    red "  ✗ JSON inválido"
    ERRORS=$((ERRORS + 1))
    echo ""
    continue
  fi
  green "  ✓ JSON válido"

  # ── 2. JS syntax de cada Code node ──────────────────────────────────────
  JS_OK=0
  JS_FAIL=0
  python3 "$TMP/extract_nodes.py" "$wf_file" > "$TMP/nodes.jsonl" 2>/dev/null || true

  while IFS= read -r line; do
    [ -z "$line" ] && continue
    node_name=$(python3 -c "import json,sys; print(json.loads(sys.argv[1])['name'])" "$line" 2>/dev/null || echo "?")
    python3 -c "import json,sys; print(json.loads(sys.argv[1])['code'])" "$line" > "$TMP/raw.js" 2>/dev/null || continue

    # Wrap em async para permitir await no nível raiz (padrão n8n)
    printf 'const __wrap = async () => {\n' > "$TMP/check.mjs"
    cat "$TMP/raw.js" >> "$TMP/check.mjs"
    printf '\n};\n' >> "$TMP/check.mjs"

    if node --check "$TMP/check.mjs" 2>"$TMP/node_err.txt"; then
      JS_OK=$((JS_OK + 1))
    else
      red "  ✗ JS syntax error em '$node_name':"
      sed 's|.*/check.mjs|  |' "$TMP/node_err.txt" | head -5 | sed 's/^/      /'
      JS_FAIL=$((JS_FAIL + 1))
      ERRORS=$((ERRORS + 1))
    fi
  done < "$TMP/nodes.jsonl"

  if [ "$JS_FAIL" -eq 0 ] && [ "$JS_OK" -gt 0 ]; then
    green "  ✓ JS syntax OK ($JS_OK node(s))"
  elif [ "$JS_OK" -eq 0 ] && [ "$JS_FAIL" -eq 0 ]; then
    yellow "  – Nenhum Code node encontrado"
  fi

  # ── 3. Anti-padrões ──────────────────────────────────────────────────────
  python3 "$TMP/check_patterns.py" "$wf_file" > "$TMP/patterns.txt" 2>/dev/null || true

  if [ -s "$TMP/patterns.txt" ]; then
    while IFS= read -r entry; do
      [ -z "$entry" ] && continue
      if [[ "$entry" == ERROR:* ]]; then
        red "  ✗ ${entry#ERROR:}"
        ERRORS=$((ERRORS + 1))
      elif [[ "$entry" == WARN:* ]]; then
        yellow "  ⚠ ${entry#WARN:}"
        WARNINGS=$((WARNINGS + 1))
      fi
    done < "$TMP/patterns.txt"
  else
    green "  ✓ Sem anti-padrões detectados"
  fi

  echo ""
done

# ── Resultado final ──────────────────────────────────────────────────────────
bold "=== Resultado ==="
if [ "$ERRORS" -gt 0 ]; then
  red "✗ $ERRORS erro(s) — corrija antes de subir"
  [ "$WARNINGS" -gt 0 ] && yellow "⚠ $WARNINGS aviso(s)"
  exit 1
elif [ "$WARNINGS" -gt 0 ]; then
  yellow "⚠ $WARNINGS aviso(s) — recomendado revisar"
  green "✓ Sem erros críticos — pode subir"
  exit 0
else
  green "✓ Tudo OK — pode subir"
  exit 0
fi
