# STATE — Order Hub

## Decisions

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-06-19 | uWebSockets.js como framework HTTP + WS | Stack obrigatória do PROJECTO.md — ultra-performance, compatível com Bun |
| 2026-06-19 | Thin router wrapper sobre uWS | uWS não tem router nativo; wrapper mínimo mantém clean arch sem adicionar framework pesado |
| 2026-06-19 | Compartilhar PostgreSQL do docker-compose existente | Evita duplicar infra; sakura-bot-oficial já tem PG configurado |
| 2026-06-19 | Redis pub/sub para broadcast WebSocket | uWS não tem broadcast nativo multi-instância; Redis desacopla emissão de recepção |
| 2026-06-19 | Monorepo em `apps/api/` + `apps/web/` | Mantém o repo sakura-bot-oficial como monorepo — bot + painel no mesmo lugar |
| 2026-06-19 | Webhook WhatsApp via n8n → Order Hub API | n8n recebe da Meta Cloud API, faz HTTP POST para `/webhooks/whatsapp` no Order Hub |
| 2026-06-19 | Sem Keycloak — JWT customizado | RBAC resource:action granular + multi-tenant por establishment_id é mais simples em código do que nos modelos do Keycloak; Keycloak seria overkill para 6 roles em 1 app |
| 2026-06-19 | Railway: serviços individuais, não docker-compose como unidade | Railway não executa compose como unidade — cada serviço tem seu próprio railway.toml e Dockerfile; compose fica apenas para dev local |
| 2026-06-19 | PG e Redis no Railway via plugins gerenciados | Plugins Railway têm backup automático, connection pooling e URLs injetadas automaticamente — melhor que containers próprios |
| 2026-06-19 | Web como static site separado no Railway | URL própria, sem CORS entre front e back (configurado em ALLOWED_ORIGINS); mais limpo que servir static do Bun |
| 2026-06-19 | PORT dinâmica via `process.env.PORT` | Railway injeta PORT diferente por deploy — hardcoded quebraria o deploy silenciosamente |
| 2026-06-19 | WebSocket auth por mensagem (não query param) | Token em URL aparece em logs do Railway, proxies e histórico do browser — SEC-03 |

## Blockers

_Nenhum no momento._

## Todos

- [x] Confirmar porta da API → `process.env.PORT ?? 3333` (Railway injeta, 3333 como fallback local)
- [x] Confirmar deploy frontend → static site separado no Railway (porta 4000 local, URL própria em prod)
- [x] JWT com blacklist no Redis → decidido: refresh token rotation + família invalidada em reuse (SEC-10)
- [x] T07 middlewares: authenticate, authorize, validateBody, tenantIsolation, rateLimiter
- [x] T08 WebSocketHub: Redis pub/sub, message-based auth (5s timeout), rooms por establishment
- [x] T09-T12 Auth: LoginUseCase (brute force + argon2id), RefreshToken (rotation+family), Logout, AuthController, AuthRoutes
- [x] T13-T17 Core: FindOrCreateCustomer, CreateCategory (auto-slug), ListProducts (Redis cache)
- [x] T21-T25 Orders: CreateOrder (idempotency), UpdateStatus (transitions+timestamps+WS broadcast), GetOrder, ListOrders (pagination)
- [x] T22-T23 Kitchen: GetKitchenQueue (SLA 15/25min), KitchenController
- [x] T24 Delivery: GetDeliveryQueue, UpdateDeliveryStatus, DeliveryController
- [x] T25 Cashier: OpenCashRegister, CloseCashRegister, AddCashMovement, CashierController
- [x] T26-T29 Dashboard/Reports/Settings/Audit: GetDashboardMetrics (Redis cache 30s), ExportOrdersCSV (formula injection prevention), UpsertSetting (upsert+unique), CreateAuditLog
- [x] T31-T32 Webhook: ReceiveWhatsAppWebhook (HMAC+nonce), IoC container, full server bootstrap
- [x] T33-T41 Frontend: Vite+React+Tailwind, authStore (Zustand+persist+refresh), useWebSocket (auth by message+reconnect), RoleGuard, KitchenPage (touch UI+SLA), DeliveryPage, CashierPage, DashboardPage
- [x] T43-T45 Docker: API Dockerfile (Bun multi-stage), Web Dockerfile (Nginx SPA), railway.toml (api+web), CI (typecheck+docker build)
- [x] docker-compose com order-hub-api (bun --watch) + order-hub-web (Vite HMR + usePolling) — `make all` sobe tudo e faz seed
- [x] Triggers do audit_log inlinados em `runMigrations()` (idempotente, sem arquivo .sql externo)
- [x] `.gitignore` corrigido — drizzle/migrations não é mais ignorado (estava quebrando build de produção)
- [x] `OrdersPage` criada + rota `/orders` em App.tsx
- [x] `AuthGuard` com auto-refresh — `accessToken` null após reload dispara refresh silencioso
- [x] `ListOrdersUseCase` retorna `total` e `customer: { name, phone }` (mapeado de whatsappNumber)
- [x] `VITE_API_WS_URL` corrigido para incluir `/ws` (estava sem o path do endpoint)
- [x] `authStore.refresh()` usa `RefreshResponse` correto (sem `user` no payload)
- [x] Dockerfiles: removido `--frozen-lockfile` / `npm ci` (lockfiles não commitados ainda)
- [ ] No Railway dashboard: criar projeto, adicionar plugins PG e Redis, criar 3 serviços (n8n, order-hub-api, order-hub-web)
- [ ] Definir `ALLOWED_ORIGINS` com a URL final do web no Railway após primeiro deploy
- [ ] Após `make all`: commitar `apps/api/drizzle/migrations/` + `apps/api/bun.lockb` gerados pelo container

## Deferred Ideas

- Adapter de canal genérico (`ChannelProvider` interface) para iFood/Rappi — arquitetura preparada mas não implementada no v1
- Módulo de notificações push (PWA) para cozinha quando chega novo pedido
- Rate limiting por establishment no webhook receiver

## Lessons

- **Drizzle `relations()` circular import**: Mover toda `relations()` para `schema/relations.ts` separado — definições de tabela ficam em arquivos individuais sem qualquer import cross-table das relations
- **NodePgDatabase vs PostgresJsDatabase**: usamos `drizzle-orm/node-postgres` (driver `pg`), nunca `drizzle-orm/postgres-js` (driver `postgres`)
- **Drizzle `.set()` type**: usar `Partial<NewEntity>` ao invés de `Record<string, unknown>` para manter type-safety
- **Seed com UUIDs fixos**: facilita migrations e referências cruzadas em seed data; usar padrão `00000000-0000-0000-000N-000000000NNN`
- **uWS + CORS**: pre-flight OPTIONS usa `app.options('/*', ...)` com acesso direto `req.getHeader()` síncrono, não passa pelo Router wrapper (que assume body reading)

## Preferences

_A preencher durante implementação._
