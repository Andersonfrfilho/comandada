# T11.3 — Business Event Contract (Append-Only)

## Purpose

This document defines the canonical business event schema for all domain events
emitted by the platform. It serves as the contract between producers (API
workers, WebSocket hub, use cases) and consumers (Order Hub Web, audit logs,
future datalake).

## Event Structure

Every business event follows this envelope:

```typescript
interface BusinessEvent {
  eventId: string           // UUID v7 (temporal ordering without DB sort)
  eventType: EventType      // Domain event type (see §2)
  timestamp: string         // ISO 8601 with millis, producer clock
  establishmentId: string   // UUID of the establishment
  payload: Record<string, unknown>   // Event-specific data (see §3)
  metadata: {
    source: 'api' | 'bot' | 'worker' | 'websocket' | 'manual'
    correlationId?: string  // Links related events (e.g. order → payment chain)
    actor?: {               // Who triggered the event
      userId?: string
      customerId?: string
      systemProcess?: string // e.g., 'bullmq:finance-due-alerts'
    }
    version: 1              // Schema version for consumers
  }
}
```

**Design principles:**
- **Append-only** — events are immutable. No UPDATE or DELETE on event store.
- **Temporal ordering** — `eventId` is UUID v7 (timestamp-ordered) for natural
  sort without depending on DB `SERIAL`.
- **Schema versioned** — `metadata.version` allows consumers to handle migrations.
- **Correlation** — `metadata.correlationId` chains causal events (order placed
  → payment received → stock consumed → delivery dispatched).

## Event Types

### Core Order Lifecycle

| eventType | Trigger | Payload Keys |
|-----------|---------|-------------|
| `order.created` | Order placed via WhatsApp, manual, or channel API | `orderId`, `channel`, `type`, `customerId`, `itemsCount`, `totalAmount`, `sourceId?` |
| `order.status_changed` | Staff updates status | `orderId`, `fromStatus`, `toStatus`, `reason?` |
| `order.cancelled` | Staff or customer cancels | `orderId`, `reason`, `cancelledBy` |
| `order.notes_updated` | Staff adds/edits notes | `orderId`, `previousNotes?`, `newNotes` |

### Payment

| eventType | Trigger | Payload Keys |
|-----------|---------|-------------|
| `payment.received` | Cashier confirms payment | `orderId`, `paymentMethod`, `amount`, `cashMovementId` |
| `payment.refunded` | Refund processed | `orderId`, `amount`, `reason`, `cashMovementId` |

### Stock

| eventType | Trigger | Payload Keys |
|-----------|---------|-------------|
| `stock.consumed` | Order moves to preparation (FIFO batch deduction) | `orderId`, `productId`, `batchIds[]`, `quantities[]` |
| `stock.restocked` | Purchase entry received | `ingredientId`, `batchNumber`, `quantity`, `costPrice` |
| `stock.expiry_alert` | BullMQ daily job finds expiring batches | `batchId`, `ingredientId`, `expiresAt`, `remainingQuantity` |

### Tables (Dine-in)

| eventType | Trigger | Payload Keys |
|-----------|---------|-------------|
| `table.occupied` | Comanda opened | `tableId`, `comandaId`, `customerId?`, `guests` |
| `table.freed` | Comanda closed | `tableId`, `comandaId`, `totalAmount` |
| `table.merged` | Two tables joined | `primaryTableId`, `secondaryTableId`, `newLabel` |
| `table.split` | Group split into separate comandas | `originalTableId`, `newTableIds[]` |

### Kitchen

| eventType | Trigger | Payload Keys |
|-----------|---------|-------------|
| `kitchen.order_queued` | Order confirmed → kitchen display | `orderId`, `items[]`, `priority?` |
| `kitchen.order_started` | Chef starts preparation | `orderId`, `itemIds[]` |
| `kitchen.order_ready` | All items prepared | `orderId`, `itemIds[]` |

### Delivery

| eventType | Trigger | Payload Keys |
|-----------|---------|-------------|
| `delivery.assigned` | Driver assigned to order | `orderId`, `deliveryId`, `driverUserId` |
| `delivery.dispatched` | Driver leaves restaurant | `orderId`, `deliveryId` |
| `delivery.completed` | Delivered to customer | `orderId`, `deliveryId` |

### Finance

| eventType | Trigger | Payload Keys |
|-----------|---------|-------------|
| `finance.account_due_alert` | BullMQ daily job finds accounts due within 5 days | `accountId`, `description`, `dueDay`, `amount`, `daysUntilDue` |
| `finance.account_paid` | Staff marks monthly account as paid | `accountId`, `description`, `amount`, `paidAt` |
| `finance.account_unpaid` | Staff reverts to pending | `accountId`, `description` |
| `finance.expense_created` | Avulso expense registered | `expenseId`, `category`, `amount`, `hasReceipt` |

### Cashier

| eventType | Trigger | Payload Keys |
|-----------|---------|-------------|
| `cashier.register_opened` | Staff opens register | `registerId`, `openingBalance` |
| `cashier.register_closed` | Staff closes register | `registerId`, `expectedBalance`, `actualBalance`, `discrepancy` |
| `cashier.movement_added` | Cash in/out recorded | `registerId`, `type`, `amount`, `paymentMethod?`, `orderId?` |

### Fiscal

| eventType | Trigger | Payload Keys |
|-----------|---------|-------------|
| `fiscal.document_emitted` | Fiscal doc sent to SEFAZ | `fiscalDocumentId`, `orderId`, `model`, `chaveAcesso` |
| `fiscal.document_authorized` | SEFAZ authorizes | `fiscalDocumentId`, `orderId`, `chaveAcesso`, `numeroDocumento` |
| `fiscal.document_cancelled` | Cancelamento emitido | `fiscalDocumentId`, `orderId`, `chaveAcesso`, `reason` |

## Where Events Are Emitted Today

### 1. WebSocket Hub

All events with a real-time consumer are broadcast via `WebSocketHub` to
connected clients (Order Hub Web app). The `WS_EVENTS` constant
(`apps/api/src/infra/websocket/WebSocketEvents.ts`) already maps most order/kitchen/
delivery/cashier lifecycle events.

**Coverage:**

| Category | WebSocket Events | Gap |
|----------|-----------------|-----|
| Orders | `order:created`, `order:updated`, `order:status_changed`, `order:cancelled` | No `order.notes_updated` event |
| Kitchen | `kitchen:order_queued`, `kitchen:order_started`, `kitchen:order_ready` | Complete |
| Delivery | `delivery:assigned`, `delivery:dispatched`, `delivery:completed` | Complete |
| Cashier | `cashier:register_opened`, `cashier:register_closed`, `cashier:payment_received` | No `cashier.movement_added` |
| Fiscal | `fiscal:emitting`, `fiscal:authorized`, `fiscal:rejected`, `fiscal:cancelled` | Complete |
| Stock | None | No stock events at all |
| Finance | None | No finance events at all |
| Tables | None | No table events at all |

### 2. Audit Logs

`audit_logs` table (`apps/api/src/infra/database/schema/audit-logs.ts`) stores
immutable records for compliance and traceability. Every event type listed above
SHOULD produce an audit_log entry with matching `action` and `metadata`.

Current audit_log actions used:
- `stock_expiry_alert` (T6.6 StockExpiryAlerter)
- `account_due_alert` (T10.4 AccountDueAlerter)
- Fiscal document events (via CreateAuditLogUseCase)
- Order status changes (via order_status_logs + triggers)

## How a Future Datalake Would Consume

### Option A: PostgreSQL CDC (Change Data Capture)

Use logical replication (pgoutput plugin) with Debezium or a lightweight
connector to stream `INSERT` events from the append-only `audit_logs` table
into a datalake (S3/Parquet, ClickHouse, or Apache Iceberg).

```
PostgreSQL (audit_logs)
    ↓ CDC (Debezium → Kafka Connect or direct pg_recvlogical)
Kafka / Redis Stream
    ↓
datalake (Parquet on S3 + DuckDB/Athena for queries)
```

**Pros:**
- Zero code changes to producers — everything already writes to audit_logs
- Battle-tested (Debezium/Kafka)
- Catch-up from any WAL position

**Cons:**
- Requires PostgreSQL superuser or REPLICATION privilege (not available on Railway PG)
- Kafka infrastructure cost/complexity
- WAL retention must be configurable

### Option B: Event Stream via Redis

Producers push events to Redis Streams (or Redis Pub/Sub with persistence).
A consumer (Node.js worker or Fluentd/Fluent Bit) reads and batches to S3.

```
Producer → Redis XADD "events:order" (JSON event)
    ↓
Redis Stream Consumer (Node.js or Fluent Bit)
    ↓ batched every 5min
S3 (Parquet partitioned by establishment/date)
```

**Pros:**
- App-level, no PG superuser needed
- Redis already in use (BullMQ + cache)
- Simple Node.js consumer

**Cons:**
- Must add Redis Stream push to every event producer (code change)
- Redis Stream maxlen limits (must configure)
- At-least-once delivery needs dedup logic

### Option C: Direct S3 Append (Event Bus Pattern)

A centralized `EventBus` service in the API that publishes to both WebSocket
and structured log. The bus writes to S3 directly via presigned URL or
Railway's S3-compatible storage.

```
UseCase → EventBus.publish(event)
    ├→ WebSocketHub.broadcast(eventType, payload)
    ├→ CreateAuditLogUseCase.execute(event)  → audit_logs table
    └→ S3Storage.append(event)               → s3://datalake/events/{date}/{eventType}.jsonl
```

**Pros:**
- Single producer, all consumers registered in one place
- JSONL files ready for Athena/DuckDB
- No Kafka/Debezium complexity

**Cons:**
- New EventBus abstraction needed
- S3 small-file write costs (batch writes recommended)
- Must implement retry and dedup

### Recommendation

**Phase 1 (immediate):** Expand audit_logs to cover all event types above.
audit_logs is already append-only and immutable. Add `event_id` column
(UUID v7) and `correlation_id` for linking. This gives us a complete event
firehose with zero new infrastructure.

**Phase 2 (datalake ingestion):** Implement Option C (EventBus → S3 JSONL)
using Railway's S3-compatible buckets. The batched writer runs every 5 minutes.
Query with DuckDB WASM in Metabase or standalone reports.

**Phase 3 (real-time streaming, if needed):** Layer Option B (Redis Streams)
for sub-second BI (real-time dashboards) while keeping S3 for historical.

## Append-Only Event Log Recommendations

1. **Single writer, multiple readers** — one `EventBus.publish()` entry point
   per bounded context. Never allow direct INSERT to audit_logs outside the bus.

2. **Idempotency keys** — use `eventId` (UUID v7) as the dedup key. Consumers
   track last-seen `eventId` per stream to skip replays.

3. **Partition strategy** — partition S3 data by `establishmentId/YYYY/MM/DD/`
   for query efficiency and GDPR compliance (drop single establishment data).

4. **Schema enforcement** — validate event payloads with Zod against the
   contract defined in this document. Reject malformed events at the bus level.

5. **Replay capability** — audit_logs as source of truth for full replay.
   No truncated queues, no TTL on critical events.

6. **Retention policy**:
   - `audit_logs`: 7 years (fiscal compliance)
   - S3 events: permanent (compressed Parquet)
   - WebSocket: live only, no persistence

7. **Monitoring** — alert on event bus failures. Track lag: `MAX(event_timestamp)
   vs NOW()` in audit_logs. If > 60s, producers are stalled.
