# T11.1 — Spike: iFood Partner API Integration

## Research Summary

### iFood Partner API (Merchant & Orders)

The iFood Partner API provides programmatic access to restaurant merchant operations
through two main endpoints:

| API | Base URL | Purpose |
|-----|----------|---------|
| **Merchant API** | `https://merchant-api.ifood.com.br` | Catalog sync, store hours, availability |
| **Orders API** | `https://merchant-api.ifood.com.br/order/v1.0` | Order events, acceptance, rejection, status updates |

**Authentication:** OAuth 2.0 with client credentials (`client_id` + `client_secret`)
issued during the credentialing process. Tokens expire after ~1 hour and must be
refreshed. Scopes include `merchant:orders:read`, `merchant:orders:write`,
`merchant:catalog:read`, `merchant:catalog:write`.

**Key capabilities:**
- **Order events polling:** `GET /events:polling` returns new events (order placed,
  cancelled, etc.) — polling interval recommended 30s to 60s.
- **Order acceptance:** `POST /events/acknowledgment` sends confirmation or rejection
  with reason codes.
- **Order details:** `GET /orders/{orderId}` returns full order with items,
  customer info (masked), delivery address, payment method, total.
- **Status updates:** PATCH order status (`CONFIRMED`, `PREPARATION_STARTED`,
  `READY_TO_DELIVER`, `DISPATCHED`, `CONCLUDED`).
- **Cancellation:** POST to request cancellation with reason code.
- **Catalog management:** full CRUD for categories, items, modifiers via
  `GET/POST v2.0/merchants/{merchantId}/menus`.

**Webhook alternative:** iFood supports webhook push (POST to configured URL)
instead of polling. Requires HTTPS endpoint, whitelisted IPs. Webhook events
carry HMAC signature for integrity verification.

## Requirements

### Credentialing Process

1. **iFood Partner registration** — register at `parceiros.ifood.com.br`
2. **Account verification** — provide CNPJ, legal documentation, restaurant license
3. **API key issuance** — after approval, access `Portal do Parceiro` to generate:
   - `client_id`
   - `client_secret`
   - `merchant_id`
4. **Webhook/URL registration** — register the callback URL for order events
5. **SSL certificate** — HTTPS with valid certificate (Let's Encrypt acceptable)
6. **Whitelisted IPs** — iFood publishes their outbound IP ranges for firewall rules

**Timeline estimate:** 2-4 weeks for manual approval. Sandbox access may be
faster via iFood's Developer Relations channel.

### Sandbox Access

iFood provides a staging environment at `https://merchant-api.ifood.com.br` with
separate credentials. Sandbox supports:
- Mock order creation with configurable payloads
- Simulated status transitions
- Test catalog sync
- No real restaurant activation required

**How to request:** Contact `integracoes@ifood.com.br` or open ticket through
Portal do Parceiro. Mention "API de Integração" and provide your CNPJ.

## Integration Architecture

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────┐
│  iFood API   │────▶│  IfoodProvider   │────▶│  Order Hub  │
│  (polling/   │     │  (apps/api/src/  │     │  (apps/web) │
│   webhook)   │◀────│   modules/       │◀────│             │
└─────────────┘     │   ifood/)        │     └─────────────┘
                    │                  │
                    │  ┌────────────┐  │
                    │  │ PostgreSQL │  │
                    │  │ (orders    │  │
                    │  │  channel=  │  │
                    │  │  'ifood')  │  │
                    │  └────────────┘  │
                    └──────────────────┘
```

### IfoodProvider Contract

```typescript
interface IfoodProvider {
  authenticate(): Promise<string>                             // OAuth2 → access token
  pollEvents(merchantId: string): Promise<IfoodEvent[]>       // Polling mode
  getOrder(orderId: string): Promise<IfoodOrder>              // Full order details
  acknowledgeEvent(eventId: string, decision: 'accept' | 'reject', reason?: string): Promise<void>
  updateOrderStatus(orderId: string, status: IfoodOrderStatus): Promise<void>
  requestCancellation(orderId: string, reason: string): Promise<void>
}
```

### Polling vs Webhook Decision

| Criteria | Polling (GET /events:polling) | Webhook (POST callback) |
|----------|-------------------------------|--------------------------|
| Latency | 30-60s delay | Near-real-time (< 2s) |
| Infrastructure | Simpler (no inbound endpoint) | Requires public HTTPS endpoint |
| Reliability | Must handle empty poll results gracefully | Must verify HMAC signature |
| DDoS risk | Low (outbound only) | Medium (public endpoint) |
| iFood recommendation | Fallback only | Primary method |

**Recommendation:** Implement webhook as primary with polling as fallback
(dual-mode with configurable toggle). Store events in `audit_logs` for replay.

### Data Flow (Happy Path)

```
1. iFood webhook POST → n8n/webhook endpoint (or direct API)
2. IfoodProvider.extractOrder() → parse iFood payload to internal format
3. CreateOrderUseCase → INSERT INTO orders (channel='ifood', source_id=<ifoodId>)
4. Order Hub shows ifood-sourced orders with channel badge
5. Staff accepts/rejects → IfoodProvider.acknowledgeEvent()
6. Status transitions → IfoodProvider.updateOrderStatus()
7. All events logged to audit_logs with action='ifood_*'
```

## Existing Infrastructure Compatibility

The `order_channel` enum already has `ifood` value:

```sql
CREATE TYPE order_channel AS ENUM ('whatsapp', 'ifood', 'manual');
```

Orders table (`apps/api/src/infra/database/schema/orders.ts:14`):
```typescript
channel: orderChannelEnum('channel').default('manual').notNull(),
```

**What's already in place:**
- `order_channel` enum with `ifood` (T0.4 translated)
- CreateOrderUseCase compatible with any channel
- audit_logs for event trail
- BullMQ infra for async processing

**What T11.2 must add:**
- `IfoodProvider` implementing the contract above
- `IfoodAuthProvider` (token caching in Redis, refresh on expiry)
- `IfoodPollingWorker` (BullMQ recurring job, 30s interval)
- `IfoodWebhookController` (POST endpoint with HMAC verification)
- UI: channel filter on OrdersPage showing `ifood`
- Migration: `orders.source_id` for idempotency (avoid duplicate ifood orders)
- Migration: `settings.ifood_config` (JSONB with merchantId, credentials)

## Estimated Effort for T11.2

| Task | Effort | Notes |
|------|:------:|-------|
| OAuth2 auth provider + token cache | 1d | Standard pattern, Redis |
| Polling worker (BullMQ repeatable) | 0.5d | Follow StockExpiryWorker pattern |
| Webhook endpoint + HMAC validation | 1d | Reuse existing webhook infrastructure |
| IfoodProvider implementation | 2d | Parse iFood JSON → internal format |
| Order lifecycle handlers (accept/reject/status) | 1d | Map to UpdateOrderStatusUseCase |
| UI: channel filter + badge | 0.5d | Minor frontend work |
| Migration: `source_id` + `ifood_config` | 0.5d | |
| Integration tests with sandbox | 1d | Requires sandbox credentials |
| **Total** | **7.5d** | ~1.5 weeks for 1 dev |

## Blockers & Risks

| # | Risk | Impact | Mitigation |
|:--|------|:------:|------------|
| R1 | **iFood credentialing approval delay** — manual review by iFood team may take 2-4 weeks | High | Start credentialing process early (before T11.2). Implement against sandbox without full approval. |
| R2 | **API breaking changes** — iFood v2.0 may deprecate v1.0 endpoints | Medium | Monitor iFood developer changelog. Design provider interface to support version negotiation. |
| R3 | **Idempotency** — duplicate webhook deliveries or poll results | Medium | `source_id` (iFood's `orderId`) with UNIQUE constraint. Dedup in IfoodProvider. |
| R4 | **Token expiry** — OAuth2 tokens expire hourly | Low | Redis cache with 50-minute TTL, auto-refresh in provider. |
| R5 | **iFood order format mismatch** — iFood items may not map 1:1 to internal products | Medium | Import flagged items (unmapped) for manual review. Build product mapping table (`ifood_product_map`). |
| R6 | **Rate limiting** — iFood may throttle aggressive polling | Low | 30-60s polling interval. Exponential backoff on 429. |
| R7 | **SSL requirement** — webhook requires HTTPS on production | Medium | Railway provides free SSL certs. Already in place for webhook. |

## Next Steps

1. Register at `parceiros.ifood.com.br` and submit CNPJ for approval
2. Request sandbox access via `integracoes@ifood.com.br`
3. While waiting: implement `IfoodProvider` against sandbox mock responses
4. Build webhook endpoint behind feature flag (`IFOOD_ENABLED`)
5. Once sandbox credentials arrive → integration tests
6. Once production approval → deploy `IFOOD_ENABLED=true`
