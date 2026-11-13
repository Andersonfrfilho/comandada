#!/usr/bin/env bash
# Seed database with cardapio.csv, faq.csv into Drizzle schema tables
# Usage: ./scripts/seed-db.sh

set -euo pipefail

DB_USER="${POSTGRES_USER:-botuser}"
DB_NAME="${POSTGRES_DB:-botdb}"
DATA_DIR="$(dirname "$0")/../dados"

ENV_FILE="$(dirname "$0")/../infra/.env"
if [ -f "$ENV_FILE" ]; then
  DB_USER=$(grep -s ^POSTGRES_USER "$ENV_FILE" | cut -d= -f2 || echo "$DB_USER")
  DB_NAME=$(grep -s ^POSTGRES_DB "$ENV_FILE" | cut -d= -f2 || echo "$DB_NAME")
fi

echo "🌱 Populando banco $DB_NAME com dados iniciais..."

for i in $(seq 1 20); do
  if docker exec postgres pg_isready -U "$DB_USER" -d "$DB_NAME" >/dev/null 2>&1; then
    break
  fi
  echo "  Aguardando PostgreSQL... ($i/20)"
  sleep 3
done

COUNT=$(docker exec postgres psql -U "$DB_USER" -d "$DB_NAME" -tAc \
  "SELECT COUNT(*) FROM products;" 2>/dev/null || echo "0")

if [ "$COUNT" -gt 0 ]; then
  echo "  ✅ Produtos já tem $COUNT itens — pulando seed"
  exit 0
fi

PSQL="docker exec -i postgres psql -U $DB_USER -d $DB_NAME"
TMP_DIR="/tmp/sakura-seed"
mkdir -p "$TMP_DIR"

# ─── 1. Default establishment ─────────────────────────────────────
echo "  🏢 Criando estabelecimento padrão..."
ESTAB_ID=$($PSQL -tAc "INSERT INTO establishments (name, whatsapp_number) VALUES ('Sakura Restaurante', '5511999999999') ON CONFLICT (whatsapp_number) DO UPDATE SET name = EXCLUDED.name RETURNING id;" | head -1)
echo "  Estabelecimento: $ESTAB_ID"

# ─── 2. Seed categories ───────────────────────────────────────────
if [ -f "$DATA_DIR/categorias.csv" ]; then
  echo "  📂 Importando categorias.csv..."
  $PSQL -c "TRUNCATE categories CASCADE;" >/dev/null

  cat > "$TMP_DIR/seed_categories.py" << 'PYEOF'
import csv, uuid, sys

csv_path = sys.argv[1]
estab_id = sys.argv[2]

rows = []
with open(csv_path) as f:
    for row in csv.DictReader(f):
        rows.append(row)

vals = []
for r in rows:
    uid = str(uuid.uuid4())
    name = r["nome"].replace("'", "''")
    slug = r["nome"].lower().strip()
    for a, b in [(" ","-"),("ã","a"),("é","e"),("ê","e"),("í","i"),("ó","o"),("ô","o"),("ú","u"),("ç","c"),("á","a"),("â","a")]:
        slug = slug.replace(a, b)
    active = r["ativa"].lower() == "true"
    so = r.get("ordem", "0")
    vals.append("('%s', '%s', '%s', '%s', %s, %s)" % (uid, estab_id, name, slug, str(active).lower(), so))

print("INSERT INTO categories (id, establishment_id, name, slug, active, sort_order) VALUES")
print(",\n".join(vals) + ";")
PYEOF

  python3 "$TMP_DIR/seed_categories.py" "$DATA_DIR/categorias.csv" "$ESTAB_ID" | $PSQL >/dev/null
  echo "  ✅ Categorias importadas."
fi

# ─── 3. Seed products ─────────────────────────────────────────────
if [ -f "$DATA_DIR/produtos.csv" ]; then
  echo "  🍱 Importando produtos.csv..."
  $PSQL -c "TRUNCATE products CASCADE;" >/dev/null

  CAT_UUIDS=$($PSQL -tAc "SELECT id FROM categories ORDER BY sort_order;" | tr '\n' '|')

  cat > "$TMP_DIR/seed_products.py" << 'PYEOF'
import csv, uuid, sys

csv_path = sys.argv[1]
estab_id = sys.argv[2]
cat_uuids_str = sys.argv[3]

cat_uuids = cat_uuids_str.strip("|").split("|")

rows = []
with open(csv_path) as f:
    for row in csv.DictReader(f):
        rows.append(row)

vals = []
for i, r in enumerate(rows):
    uid = str(uuid.uuid4())
    name = r["nome"].replace("'", "''")
    slug = r["nome"].lower().strip()
    for a, b in [(" ","-"),("ã","a"),("é","e"),("ê","e"),("í","i"),("ó","o"),("ô","o"),("ú","u"),("ç","c"),("á","a"),("â","a")]:
        slug = slug.replace(a, b)
    desc = r.get("descricao", "").replace("'", "''")
    price = r["preco"]
    active = r.get("disponivel", "true").lower() == "true"
    cat_idx = int(r.get("categoria_id", "1")) - 1
    cat_id = cat_uuids[cat_idx] if cat_idx < len(cat_uuids) else cat_uuids[0]
    vals.append("('%s', '%s', '%s', '%s', '%s', '%s', %s, %s, %s)" % (uid, estab_id, cat_id, name, slug, desc, price, str(active).lower(), i+1))

print("INSERT INTO products (id, establishment_id, category_id, name, slug, description, price, active, sort_order) VALUES")
print(",\n".join(vals) + ";")
PYEOF

  python3 "$TMP_DIR/seed_products.py" "$DATA_DIR/produtos.csv" "$ESTAB_ID" "$CAT_UUIDS" | $PSQL >/dev/null
  echo "  ✅ Produtos importados."
fi

# ─── 4. Seed faq ──────────────────────────────────────────────────
if [ -f "$DATA_DIR/faq.csv" ]; then
  echo "  ❓ Importando faq.csv..."
  $PSQL -c "TRUNCATE faq RESTART IDENTITY CASCADE;" >/dev/null
  $PSQL -c "\COPY faq (id,category,question,answer,keywords,active) FROM STDIN WITH (FORMAT csv, HEADER true, DELIMITER ',')" \
    < "$DATA_DIR/faq.csv"
  echo "  ✅ FAQ importado."
fi

echo "🚀 Seed concluído."
