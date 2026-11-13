# Order Hub — Design de Arquitetura

**Spec**: `.specs/features/order-hub/spec.md`
**Status**: Draft

---

## Architecture Overview

```
WhatsApp → Meta Cloud API → n8n [:5678]
                                 │
                          POST /webhooks/whatsapp
                                 │
                         ┌───────▼────────┐
                         │  uWebSockets.js │  apps/api [:3333]
                         │  (HTTP + WS)    │
                         └───────┬────────┘
                                 │
                    ┌────────────┼────────────┐
                    │            │            │
              ┌─────▼──┐  ┌─────▼──┐  ┌──────▼──────┐
              │ Router  │  │  Auth  │  │  WS Hub      │
              │ (thin)  │  │  JWT   │  │  (Redis P/S) │
              └─────┬──┘  └────────┘  └─────────────┘
                    │
          ┌─────────┼──────────┐
          │         │          │
     ┌────▼──┐ ┌────▼──┐ ┌────▼──┐
     │ Orders│ │Kitchen│ │Cashier│ ... (módulos)
     └────┬──┘ └───────┘ └───────┘
          │
   ┌──────┴──────┐
   │             │
PostgreSQL     Redis
(Drizzle)    (cache + pub/sub)
```

**Fluxo de pedido WhatsApp:**
```
n8n POST /webhooks/whatsapp
  → WebhookController.receiveWhatsapp()
  → CreateOrderFromWebhookUseCase
      → CustomerRepository.findOrCreate(whatsapp_number)
      → OrderRepository.create(order)
      → OrderEventEmitter.emit('order:new', order)
          → Redis PUBLISH establishment:{id}:orders
              → WebSocket Hub BROADCAST para clientes do establishment
```

---

## Estrutura de Diretórios

```
apps/
├── api/                          ← Bun + uWebSockets.js
│   ├── src/
│   │   ├── shared/
│   │   │   ├── types/            ← interfaces e tipos globais
│   │   │   ├── constants/        ← MessagesConstants, StatusConstants
│   │   │   ├── errors/           ← AppError, ValidationError, NotFoundError
│   │   │   ├── providers/        ← interfaces de provider (ex: CacheProvider)
│   │   │   └── utils/            ← helpers puros
│   │   ├── infra/
│   │   │   ├── http/
│   │   │   │   ├── server.ts     ← uWS.App() bootstrap
│   │   │   │   ├── router.ts     ← thin router wrapper sobre uWS
│   │   │   │   └── middlewares/  ← auth, rbac, validation
│   │   │   ├── websocket/
│   │   │   │   ├── WebSocketHub.ts   ← gerencia conexões + rooms
│   │   │   │   └── WebSocketEvents.ts ← enum de eventos
│   │   │   ├── database/
│   │   │   │   ├── connection.ts ← pool Drizzle
│   │   │   │   └── schema/       ← todos os schemas Drizzle
│   │   │   ├── redis/
│   │   │   │   ├── connection.ts
│   │   │   │   └── RedisProvider.ts
│   │   │   └── container.ts      ← IoC manual (bind use-cases → repos)
│   │   ├── modules/
│   │   │   ├── auth/
│   │   │   ├── users/
│   │   │   ├── roles/
│   │   │   ├── customers/
│   │   │   ├── products/
│   │   │   ├── categories/
│   │   │   ├── orders/
│   │   │   ├── tables/
│   │   │   ├── delivery/
│   │   │   ├── kitchen/
│   │   │   ├── cashier/
│   │   │   ├── reports/
│   │   │   ├── dashboard/
│   │   │   ├── settings/
│   │   │   └── webhooks/         ← receiver WhatsApp + futuros canais
│   │   └── index.ts              ← bootstrap + bind routes
│   ├── drizzle.config.ts
│   ├── package.json
│   └── tsconfig.json
│
└── web/                          ← React + Vite
    ├── src/
    │   ├── shared/
    │   │   ├── components/       ← UI atoms/molecules reutilizáveis
    │   │   ├── hooks/            ← useWebSocket, useAuth, usePermission
    │   │   ├── constants/        ← rotas, eventos WS, labels
    │   │   └── types/            ← tipos compartilhados (espelham api/shared/types)
    │   ├── modules/
    │   │   ├── auth/             ← LoginPage, authStore, authService
    │   │   ├── kitchen/          ← KitchenPanel, OrderCard
    │   │   ├── cashier/          ← CashierPanel, OpenCashDrawer
    │   │   ├── delivery/         ← DeliveryPanel, DeliveryCard
    │   │   ├── admin/            ← AdminLayout + sub-páginas
    │   │   └── dashboard/        ← DashboardPage, métricas
    │   ├── router/               ← React Router + RoleGuard
    │   └── main.tsx
    ├── package.json
    └── vite.config.ts
```

---

## Estrutura de Módulo (padrão Clean Architecture)

```
modules/orders/
├── domain/
│   ├── entities/
│   │   └── Order.ts              ← classe ou interface pura, sem deps
│   └── repositories/
│       └── OrderRepository.ts    ← interface (contrato)
├── application/
│   ├── use-cases/
│   │   ├── CreateOrder.ts
│   │   ├── UpdateOrderStatus.ts
│   │   ├── GetOrdersByEstablishment.ts
│   │   └── CancelOrder.ts
│   └── dtos/
│       ├── CreateOrderDto.ts
│       └── UpdateOrderStatusDto.ts
├── infrastructure/
│   ├── repositories/
│   │   └── DrizzleOrderRepository.ts  ← implementa OrderRepository
│   └── http/
│       ├── OrderController.ts
│       └── OrderRoutes.ts
└── index.ts                      ← exporta factory/bindings
```

---

## uWebSockets.js — Thin Router Wrapper

uWS não tem router nativo. Wrapper mínimo que implementa:

```typescript
// infra/http/router.ts
interface RouteHandler {
  (request: ParsedRequest, response: ResponseHelper): Promise<void>
}

class Router {
  get(path: string, ...middlewares: Middleware[], handler: RouteHandler): void
  post(path: string, ...middlewares: Middleware[], handler: RouteHandler): void
  put(path: string, ...middlewares: Middleware[], handler: RouteHandler): void
  delete(path: string, ...middlewares: Middleware[], handler: RouteHandler): void
  patch(path: string, ...middlewares: Middleware[], handler: RouteHandler): void
}
```

`ParsedRequest` encapsula `uWS.HttpRequest` + body parsed (JSON).
`ResponseHelper` encapsula `uWS.HttpResponse` com helpers `json()`, `status()`, `error()`.

**Por que não usar Hono/Elysia?** Stack obrigatória é uWS direto — wrapper mínimo honra a restrição sem cerimonial.

---

## WebSocket Hub

```typescript
// infra/websocket/WebSocketHub.ts
class WebSocketHub {
  // rooms: Map<establishmentId, Set<uWS.WebSocket>>
  join(socket: uWS.WebSocket, establishmentId: string): void
  leave(socket: uWS.WebSocket, establishmentId: string): void
  broadcast(establishmentId: string, event: WebSocketEvent): void
  broadcastToRole(establishmentId: string, role: Role, event: WebSocketEvent): void
}
```

Redis pub/sub: quando API tem múltiplas instâncias, o broadcast passa pelo Redis:
- PUBLISH `ws:establishment:{id}` → todas as instâncias recebem e broadcastam para seus sockets conectados.

---

## Schema do Banco (Drizzle)

### Tabelas principais

```typescript
// establishments (já existe no sakura-bot, reusar)
establishments: { id, name, whatsapp_number, settings, created_at }

users: { id, establishment_id, name, email, password_hash, role_id, active, created_at }
roles: { id, name, description }
permissions: { id, role_id, resource, action }  // resource: 'orders', action: 'read'|'write'|'delete'

customers: { id, establishment_id, name, whatsapp_number, address_default, created_at }
addresses: { id, customer_id, street, number, complement, neighborhood, city, zip }

categories: { id, establishment_id, name, slug, active, sort_order }
products: {
  id, establishment_id, category_id, name, slug,
  description, price, active, sort_order, created_at
}

tables: { id, establishment_id, number, capacity, status: 'available'|'occupied'|'reserved' }

orders: {
  id, establishment_id, customer_id, table_id?,
  channel: 'whatsapp'|'ifood'|'manual',  // extensível
  status: 'received'|'in_production'|'ready'|'in_delivery'|'picked_up'|'completed'|'cancelled',
  type: 'delivery'|'pickup'|'table',
  total_amount, notes,
  received_at, production_started_at, ready_at, completed_at, cancelled_at,
  whatsapp_message_id?,  // idempotência
  created_at
}

order_items: {
  id, order_id, product_id,
  product_name, unit_price, quantity, total_price,
  notes, created_at
}

deliveries: {
  id, order_id, establishment_id,
  deliverer_id (user_id),
  status: 'pending'|'dispatched'|'delivered'|'failed',
  address_snapshot (jsonb),
  dispatched_at, delivered_at, failed_at,
  notes, created_at
}

cash_registers: {
  id, establishment_id, user_id,
  status: 'open'|'closed',
  opening_amount, closing_amount,
  opened_at, closed_at
}

cash_movements: {
  id, cash_register_id,
  type: 'payment'|'withdrawal'|'supply',
  payment_method?: 'pix'|'card_credit'|'card_debit'|'cash'|'voucher',
  amount, order_id?, notes, created_at
}

settings: { id, establishment_id, key, value (jsonb), updated_at }
// ex: key='kitchen_sla_minutes', value=15
```

---

## Auth — JWT Strategy

- `accessToken`: HS256, 15 minutos, payload: `{ sub: userId, role: roleName, establishmentId }`
- `refreshToken`: HS256, 7 dias, armazenado **hash** (SHA-256) no Redis com TTL — nunca o token em texto claro
- **Rotação obrigatória**: cada uso do refreshToken gera novo par e invalida o anterior; reuso do token antigo invalida TODA a família (SEC-10)
- Revogação: DELETE Redis key → refresh inválido imediatamente
- Middleware: extrai Bearer token, verifica assinatura, **rejeita explicitamente `alg: none`**, injeta `request.user`
- RefreshToken armazenado como **httpOnly cookie** (não body) — inacessível a JS/XSS

---

## RBAC — Role Guards

```typescript
// shared/types/Permission.ts
type Resource = 'orders' | 'kitchen' | 'cashier' | 'delivery' | 'users' | 'products' | 'reports' | 'settings'
type Action = 'read' | 'write' | 'delete' | 'manage'

// Middleware usage na rota:
router.get('/orders', authenticate, authorize('orders', 'read'), OrderController.list)
```

Permissions por role (defaults):

| Resource | admin | manager | cashier | kitchen | deliverer | attendant |
|----------|-------|---------|---------|---------|-----------|-----------|
| orders | manage | manage | read | read | read | write |
| kitchen | manage | manage | - | write | - | - |
| cashier | manage | manage | manage | - | - | - |
| delivery | manage | manage | - | - | write | - |
| users | manage | read | - | - | - | - |
| products | manage | manage | read | read | - | read |
| reports | manage | manage | read | - | - | - |
| settings | manage | read | - | - | - | - |

---

## Segurança — Decisões de Design

### Rate Limiting (SEC-01, SEC-08)
Middleware Redis-based no router, aplicado antes de qualquer handler:
```
/auth/login        → 10 req / 5min por IP + 5 falhas por email → lockout 15min
/webhooks/*        → 10 req / min por IP
/* (autenticado)   → 100 req / min por IP
```
Chaves Redis: `rl:ip:{ip}:{route}` e `rl:email:{hash}` com TTL automático.

### Isolamento Multi-tenant (SEC-02)
Middleware `tenantIsolation` aplicado em TODAS as rotas autenticadas:
- Injeta `WHERE establishment_id = request.user.establishmentId` em todas as queries
- Para `GET /:id`: busca com `AND establishment_id = ?` — retorna 404 se não pertence ao tenant (não 403, para não confirmar existência)
- Drizzle repositories recebem `establishmentId` como parâmetro obrigatório — nunca buscam sem ele

### WebSocket Auth por Mensagem (SEC-03)
```
1. Cliente conecta em ws://api/ws (sem token na URL)
2. Servidor aguarda até 5s por: { type: "auth", token: "Bearer ..." }
3. Se timeout → fecha com código 4001 "auth_timeout"
4. Se token inválido → fecha com código 4002 "auth_failed"
5. Se token válido → { type: "auth:ok" }, socket entra no room do establishment
```

### HMAC Webhook + Replay Protection (SEC-07)
```typescript
// n8n assina o payload:
// X-Webhook-Signature: sha256=HMAC_SHA256(WEBHOOK_SECRET, rawBody)

// API verifica:
const expected = createHmac('sha256', secret).update(rawBody).digest('hex')
const received = header.replace('sha256=', '')
if (!timingSafeEqual(Buffer.from(expected), Buffer.from(received))) → 401

// Replay protection: nonce no header X-Webhook-Nonce
// Redis SET nonce TTL=5min — se já existe, reject (409)
```

### Audit Log (SEC-06)
Nova tabela `audit_logs` — somente INSERT, sem UPDATE/DELETE:
```typescript
audit_logs: {
  id, establishment_id, user_id, action,
  resource_type, resource_id,
  ip_address, user_agent,
  metadata (jsonb),  // diff do estado anterior
  created_at
}
```
Ações auditadas: `cash_register.open/close`, `cash_movement.create`, `order.cancel`, `user.role_change`, `user.deactivate`, `auth.login_failed`.

### Security Headers (SEC-09)
Middleware global adicionado ao router antes de qualquer handler:
```
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Strict-Transport-Security: max-age=31536000; includeSubDomains (produção)
Content-Security-Policy: default-src 'none'
X-Request-Id: {uuid}  ← para correlação de logs
```

### CORS (SEC-04)
`ALLOWED_ORIGINS` obrigatório em `.env` — se ausente, servidor não inicia.
Preflight OPTIONS tratado pelo router antes do middleware de auth.

### Logging seguro (SEC-16)
```typescript
// LoggerProvider sanitiza antes de persistir:
const SENSITIVE_FIELDS = ['password', 'token', 'authorization', 'x-webhook-signature', 'amount']
// Payloads de webhook: loga apenas { establishment_id, message_id, timestamp }
// Erros: loga stack trace + requestId internamente, retorna só requestId ao cliente
```

---

## Tech Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| IoC Container | Manual factory em `container.ts` | Sem inversify/tsyringe — stack não prevê, manual é suficiente para escala atual |
| Validação de DTO | Zod | TypeScript-first, composable, funciona com Bun sem compilação |
| Hash de senha | Bun.password (argon2id) | Nativo do Bun, mais rápido que bcrypt |
| UUID | `crypto.randomUUID()` | Nativo Bun/Node, sem dep |
| Migrations | `drizzle-kit` | Já na stack Drizzle |
| Frontend state | Zustand (auth/ui) + TanStack Query (server) | Query gerencia cache/refetch; Zustand para estado local não-server |
| RefreshToken storage | httpOnly cookie | Inacessível a JS — impede roubo via XSS |
| Rate limiting | Redis sliding window | Sobrevive a restart do servidor; compartilhado entre instâncias |

---

## Error Handling Strategy

| Cenário | HTTP | Resposta |
|---------|------|----------|
| Token expirado | 401 | `{ error: 'token_expired' }` |
| Token inválido | 401 | `{ error: 'invalid_token' }` |
| Permissão negada | 403 | `{ error: 'forbidden', required: 'orders:write' }` |
| Recurso não encontrado | 404 | `{ error: 'not_found', resource: 'order' }` |
| Conflito (caixa já aberto) | 409 | `{ error: 'conflict', detail: '...' }` |
| Validação de DTO | 400 | `{ error: 'validation', fields: [...] }` |
| Duplicata (idempotência) | 200 | retorna order existente |
| Servidor indisponível | 503 | `{ error: 'service_unavailable', retry_after: 30 }` |
