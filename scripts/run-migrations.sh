#!/usr/bin/env bash
# Roda migrations pendentes em ordem numérica.
# Cada arquivo em database/migrations/*.sql é executado uma única vez.
# Rastreado pela tabela schema_migrations no próprio banco.
#
# Uso:
#   DATABASE_URL=postgresql://... bash scripts/run-migrations.sh
#   ou via make migrate / CI/CD

set -euo pipefail

DATABASE_URL="${DATABASE_URL:-}"

if [ -z "$DATABASE_URL" ]; then
  echo "ERRO: DATABASE_URL não definida."
  exit 1
fi

MIGRATIONS_DIR="$(dirname "$0")/../database/migrations"

psql() { command psql -v ON_ERROR_STOP=1 "$DATABASE_URL" "$@"; }

echo "Conectando ao banco..."
psql -c "SELECT 1" >/dev/null

# Cria tabela de controle se não existir
psql -c "
CREATE TABLE IF NOT EXISTS schema_migrations (
  version    TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ DEFAULT now()
);
" >/dev/null

echo "Verificando migrations pendentes em $MIGRATIONS_DIR..."

APPLIED=0
SKIPPED=0

for file in $(ls "$MIGRATIONS_DIR"/*.sql 2>/dev/null | sort); do
  version=$(basename "$file" .sql)

  already=$(psql -tAc "SELECT COUNT(*) FROM schema_migrations WHERE version = '$version'")

  if [ "$already" -gt 0 ]; then
    echo "  ↷ $version — já aplicada"
    SKIPPED=$((SKIPPED + 1))
    continue
  fi

  echo "  → Aplicando $version..."
  psql -f "$file"
  psql -c "INSERT INTO schema_migrations (version) VALUES ('$version')" >/dev/null
  echo "  ✓ $version aplicada"
  APPLIED=$((APPLIED + 1))
done

echo ""
echo "Concluído: $APPLIED aplicada(s), $SKIPPED ignorada(s)."
