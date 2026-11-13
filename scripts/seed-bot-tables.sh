#!/usr/bin/env bash
# Seed das tabelas exclusivas do bot que dependem de dados criados pelo Order Hub
# (customers, tables, orders — populados por `make hub-seed`).
#
# Roda DEPOIS de `make hub-seed` no pipeline do `make init`. Rodar `scripts/seed-db.sh`
# antes disso não adiantaria: customers/tables/orders ainda não existiriam para as
# foreign keys de reservations/order_status_logs.
#
# Tabelas cobertas: order_status_logs, reservations, reservation_status_logs,
# question_logs, promotions.
# Fora de escopo (por design): sessions (ephemeral), changelogs (populado por trigger),
# payment_types/order_types/bot_settings/order_status_notifications (já seedados
# via INSERT...ON CONFLICT DO NOTHING em database/schema.sql).
#
# Usage: ./scripts/seed-bot-tables.sh
set -euo pipefail

DB_USER="${POSTGRES_USER:-botuser}"
DB_NAME="${POSTGRES_DB:-botdb}"

ENV_FILE="$(dirname "$0")/../infra/.env"
if [ -f "$ENV_FILE" ]; then
  DB_USER=$(grep -s ^POSTGRES_USER "$ENV_FILE" | cut -d= -f2 || echo "$DB_USER")
  DB_NAME=$(grep -s ^POSTGRES_DB "$ENV_FILE" | cut -d= -f2 || echo "$DB_NAME")
fi
FEATURE_RESERVAS=$(grep -s ^FEATURE_RESERVAS "$ENV_FILE" | cut -d= -f2 || echo "false")

echo "🌱 Populando tabelas exclusivas do bot em $DB_NAME..."

for i in $(seq 1 20); do
  if docker exec postgres pg_isready -U "$DB_USER" -d "$DB_NAME" >/dev/null 2>&1; then
    break
  fi
  echo "  Aguardando PostgreSQL... ($i/20)"
  sleep 3
done

PSQL="docker exec -i postgres psql -U $DB_USER -d $DB_NAME"

ESTAB_ID=$($PSQL -tAc "SELECT id FROM establishments ORDER BY created_at LIMIT 1;" | head -1)
if [ -z "$ESTAB_ID" ]; then
  echo "  ⚠️  Nenhum establishment encontrado — rode 'make db-seed' primeiro. Abortando."
  exit 0
fi

# ─── 1. order_status_logs (histórico derivado dos timestamps de orders) ──
ORDERS_COUNT=$($PSQL -tAc "SELECT COUNT(*) FROM orders;")
LOGS_COUNT=$($PSQL -tAc "SELECT COUNT(*) FROM order_status_logs;")

if [ "$ORDERS_COUNT" -eq 0 ]; then
  echo "  ⏭  Nenhum pedido encontrado — pulando order_status_logs (rode 'make hub-seed' primeiro)."
elif [ "$LOGS_COUNT" -gt 0 ]; then
  echo "  ✅ order_status_logs já tem $LOGS_COUNT itens — pulando."
else
  echo "  📦 Gerando order_status_logs a partir dos pedidos existentes..."
  $PSQL -c "
    INSERT INTO order_status_logs (order_id, status, note, created_at)
    SELECT id, 'received', 'Pedido recebido', received_at FROM orders
    UNION ALL
    SELECT id, 'in_production', 'Pedido em preparo', production_started_at FROM orders WHERE production_started_at IS NOT NULL
    UNION ALL
    SELECT id, 'ready', 'Pedido pronto', ready_at FROM orders WHERE ready_at IS NOT NULL
    UNION ALL
    SELECT id, 'completed', 'Pedido concluído', completed_at FROM orders WHERE completed_at IS NOT NULL
    UNION ALL
    SELECT id, 'cancelled', 'Pedido cancelado', cancelled_at FROM orders WHERE cancelled_at IS NOT NULL;
  " >/dev/null
  echo "  ✅ order_status_logs populado."
fi

# ─── 2. reservations + reservation_status_logs (só se FEATURE_RESERVAS=true) ──
CUSTOMERS_COUNT=$($PSQL -tAc "SELECT COUNT(*) FROM customers;")
TABLES_COUNT=$($PSQL -tAc "SELECT COUNT(*) FROM tables;")
RESERVATIONS_COUNT=$($PSQL -tAc "SELECT COUNT(*) FROM reservations;")

if [ "$FEATURE_RESERVAS" != "true" ]; then
  echo "  ⏭  FEATURE_RESERVAS=false — pulando reservations."
elif [ "$CUSTOMERS_COUNT" -eq 0 ] || [ "$TABLES_COUNT" -eq 0 ]; then
  echo "  ⏭  Sem customers/tables ainda — pulando reservations (rode 'make hub-seed' primeiro)."
elif [ "$RESERVATIONS_COUNT" -gt 0 ]; then
  echo "  ✅ reservations já tem $RESERVATIONS_COUNT itens — pulando."
else
  echo "  📅 Gerando reservations de demonstração..."
  $PSQL -c "
    WITH demo_customers AS (
      SELECT id, row_number() OVER (ORDER BY created_at) AS rn FROM customers
    ), demo_tables AS (
      SELECT id, row_number() OVER (ORDER BY number) AS rn FROM tables
    ), inserted AS (
      INSERT INTO reservations (code, customer_id, table_id, date, time, party_size, status, notes)
      SELECT 'RES-001', c.id, t.id, CURRENT_DATE + 1, '19:30'::time, 2, 'confirmed', NULL
      FROM demo_customers c, demo_tables t WHERE c.rn = 1 AND t.rn = 1
      UNION ALL
      SELECT 'RES-002', c.id, t.id, CURRENT_DATE + 2, '20:00'::time, 4, 'pending', 'Aniversário'
      FROM demo_customers c, demo_tables t WHERE c.rn = 2 AND t.rn = 2
      UNION ALL
      SELECT 'RES-003', c.id, t.id, CURRENT_DATE - 3, '19:00'::time, 2, 'completed', NULL
      FROM demo_customers c, demo_tables t WHERE c.rn = 3 AND t.rn = 3
      UNION ALL
      SELECT 'RES-004', c.id, t.id, CURRENT_DATE - 1, '21:00'::time, 6, 'no_show', NULL
      FROM demo_customers c, demo_tables t WHERE c.rn = 1 AND t.rn = 4
      ON CONFLICT (code) DO NOTHING
      RETURNING id, status
    )
    INSERT INTO reservation_status_logs (reservation_id, status, note)
    SELECT id, 'pending', 'Reserva criada' FROM inserted
    UNION ALL
    SELECT id, status, 'Status atualizado' FROM inserted WHERE status <> 'pending';
  " >/dev/null
  echo "  ✅ reservations e reservation_status_logs populados."
fi

# ─── 3. question_logs (perguntas de exemplo feitas à IA) ─────────────────
QUESTIONS_COUNT=$($PSQL -tAc "SELECT COUNT(*) FROM question_logs;")
if [ "$QUESTIONS_COUNT" -gt 0 ]; then
  echo "  ✅ question_logs já tem $QUESTIONS_COUNT itens — pulando."
else
  echo "  ❓ Gerando question_logs de demonstração..."
  $PSQL -c "
    INSERT INTO question_logs (customer_phone, question, ai_response, confidence, transferred_to_human, became_faq) VALUES
      ('5511988887777', 'Vocês têm opção sem glúten?', 'Sim! Temos algumas opções sem glúten no cardápio, é só perguntar ao atendente.', 'medium', false, false),
      ('5511988886666', 'Qual o tempo médio de entrega?', 'O tempo médio de preparo e entrega é de cerca de 40 a 50 minutos.', 'high', false, true),
      ('5511988885555', 'Aceita cartão internacional?', NULL, 'low', true, false),
      ('5511988884444', 'Tem estacionamento no local?', NULL, 'low', true, false),
      ('5511988883333', 'Qual o valor mínimo do pedido?', 'O valor mínimo para pedidos de entrega é R\$ 30,00.', 'high', false, true);
  " >/dev/null
  echo "  ✅ question_logs populado."
fi

# ─── 4. promotions (envios em massa agendados/enviados) ──────────────────
PROMOTIONS_COUNT=$($PSQL -tAc "SELECT COUNT(*) FROM promotions;")
if [ "$PROMOTIONS_COUNT" -gt 0 ]; then
  echo "  ✅ promotions já tem $PROMOTIONS_COUNT itens — pulando."
else
  echo "  📣 Gerando promotions de demonstração..."
  $PSQL -c "
    INSERT INTO promotions (title, message, scheduled_at, sent_at, target, status, sent_count) VALUES
      ('Combo de sexta', 'Sexta é dia de combo especial com 15% OFF! Peça já 🍣', now() - interval '5 days', now() - interval '5 days', 'all', 'sent', 128),
      ('Volta às aulas', 'Promoção volta às aulas: peça 2 combos e ganhe uma sobremesa!', now() + interval '3 days', NULL, 'opted_in', 'pending', 0),
      ('Promo cancelada', 'Campanha de teste cancelada antes do envio.', now() - interval '10 days', NULL, 'all', 'cancelled', 0);
  " >/dev/null
  echo "  ✅ promotions populado."
fi

echo "🚀 Seed de tabelas exclusivas do bot concluído."
