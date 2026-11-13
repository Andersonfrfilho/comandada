# Order Hub — Tasks

**Design**: `.specs/features/order-hub/design.md`
**Status**: Draft

---

## Execution Plan

```
Phase 1 — Monorepo + Infra (Sequential)
  T01 → T02 → T03 → T04 → T05

Phase 2 — Shared Layer (Sequential, deps no T01-T05)
  T05 → T06 → T07 → T08

Phase 3 — Auth Module (Sequential)
  T08 → T09 → T10 → T11 → T12

Phase 4 — Core Modules Backend (Parallel após T12)
       ┌→ T13 (customers) ─┐
       ├→ T14 (products)   ┤
T12 ───┼→ T15 (categories) ┤──→ T21 (orders domain)
       ├→ T16 (users)      ┤
       └→ T17 (tables)    ─┘

Phase 5 — Orders + WebSocket (Sequential)
  T21 → T22 → T23 → T24 → T25

Phase 6 — Operational Modules Backend (Parallel após T25)
       ┌→ T26 (kitchen)  ─┐
T25 ───┼→ T27 (delivery)  ┼──→ T30 (dashboard)
       ├→ T28 (cashier)  ─┘
       └→ T29 (reports)

Phase 7 — Webhook Receiver (Sequential após T21)
  T21 → T31 → T32

Phase 8 — Frontend Foundation (Parallel com Phase 4+)
  T33 → T34 → T35 → T36

Phase 9 — Frontend Painéis (Parallel após T36)
       ┌→ T37 (kitchen panel)   ─┐
T36 ───┼→ T38 (delivery panel)   ┼──→ T42 (testes e2e)
       ├→ T39 (cashier panel)   ─┘
       ├→ T40 (admin panel)
       └→ T41 (dashboard panel)

Phase 10 — Infra Deploy (Sequential)
  T43 → T44 → T45
```

---

## PHASE 1 — Monorepo + Infraestrutura

### T01: Inicializar monorepo Bun com apps/api e apps/web

**What**: Criar estrutura de monorepo com `package.json` root (workspaces Bun), `apps/api/` e `apps/web/`.
**Where**: `/` (raiz do repo), `apps/api/package.json`, `apps/web/package.json`
**Depends on**: None
**Requirement**: —

**Done when**:
- [ ] `bun install` na raiz resolve dependências de ambos os apps
- [ ] `apps/api/package.json` com Bun como runtime, uWebSockets.js, Drizzle, Zod, Redis
- [ ] `apps/web/package.json` com Vite, React, TailwindCSS, TanStack Query, Zustand
- [ ] `tsconfig.json` em cada app com strict mode, path aliases `@/` → `src/`

**Commit**: `chore: initialize Bun monorepo with apps/api and apps/web`

---

### T02: Configurar uWebSockets.js server + thin router

**What**: Criar `apps/api/src/infra/http/server.ts` e `router.ts` — bootstrap do servidor uWS com wrapper de rotas.
**Where**: `apps/api/src/infra/http/`
**Depends on**: T01
**Requirement**: —

**Done when**:
- [ ] `server.ts` lê porta via `parseInt(process.env.PORT ?? '3333')` — **nunca porta hardcoded** (Railway injeta `PORT` dinamicamente)
- [ ] `router.ts` implementa `Router` com métodos `get/post/put/patch/delete`
- [ ] `ParsedRequest` lê body async, headers e query params
- [ ] `ResponseHelper` tem métodos `json(data, status)`, `error(code, message, status)`
- [ ] Rota `GET /health` retorna `{ status: 'ok', timestamp, version }` com 200
- [ ] `bun run dev` sobe servidor e rota health responde
- [ ] Log de startup exibe: `API listening on port ${port} [env: ${NODE_ENV}]`

**Commit**: `feat(api): uWebSockets.js server with thin router wrapper`

---

### T03: Configurar Drizzle ORM + conexão PostgreSQL

**What**: Criar `apps/api/src/infra/database/connection.ts` e `drizzle.config.ts`.
**Where**: `apps/api/src/infra/database/`
**Depends on**: T01
**Requirement**: —

**Done when**:
- [ ] Drizzle configurado com pool `pg` apontando para `DATABASE_URL` (reusa PG do compose existente)
- [ ] `drizzle.config.ts` aponta para `src/infra/database/schema/`
- [ ] `bun run db:generate` gera SQL de migrations sem erros
- [ ] `bun run db:migrate` aplica migrations no banco local

**Commit**: `feat(api): Drizzle ORM with PostgreSQL connection`

---

### T04: Configurar Redis + RedisProvider

**What**: Criar `apps/api/src/infra/redis/connection.ts` e `RedisProvider.ts`.
**Where**: `apps/api/src/infra/redis/`
**Depends on**: T01
**Requirement**: —

**Done when**:
- [ ] Conexão Redis usando `ioredis` com `REDIS_URL` do env
- [ ] `RedisProvider` implementa interface `CacheProvider` com `get/set/del/publish/subscribe`
- [ ] Health check do Redis incluído em `GET /health`
- [ ] Reconexão automática configurada

**Commit**: `feat(api): Redis connection with CacheProvider`

---

### T05: Schema Drizzle completo (todas as tabelas)

**What**: Criar todos os schemas Drizzle em `apps/api/src/infra/database/schema/`.
**Where**: `apps/api/src/infra/database/schema/`
**Depends on**: T03
**Requirement**: —

**Done when**:
- [ ] Tabelas criadas: `establishments`, `users`, `roles`, `permissions`, `customers`, `addresses`
- [ ] Tabelas criadas: `categories`, `products`, `tables`, `orders`, `order_items`
- [ ] Tabelas criadas: `deliveries`, `cash_registers`, `cash_movements`, `settings`
- [ ] Todos os enums definidos: `OrderStatus`, `OrderType`, `OrderChannel`, `DeliveryStatus`, `CashMovementType`, `PaymentMethod`
- [ ] Relacionamentos (foreign keys) corretos
- [ ] `bun run db:generate` e `bun run db:migrate` executam sem erros
- [ ] Schema SQL exportado em `database/schema.sql` (atualiza arquivo existente)

**Commit**: `feat(api): complete Drizzle schema for all tables`

---

## PHASE 2 — Shared Layer

### T06: Shared types, errors e constants

**What**: Criar `apps/api/src/shared/` com tipos base, classes de erro e constants.
**Where**: `apps/api/src/shared/`
**Depends on**: T01
**Requirement**: —

**Done when**:
- [ ] `errors/AppError.ts` — base error com `statusCode`, `code`, `message`
- [ ] `errors/ValidationError.ts`, `NotFoundError.ts`, `ForbiddenError.ts`, `ConflictError.ts`
- [ ] `constants/MessagesConstants.ts` — todas strings de resposta/erro da API
- [ ] `types/index.ts` — `PaginatedResult<T>`, `AuthenticatedUser`, `EstablishmentContext`
- [ ] Sem `any` — todos os tipos explícitos

**Commit**: `feat(api): shared types, errors, and constants`

---

### T07: Middlewares HTTP (auth, rbac, validation, segurança)

**What**: Criar middlewares reutilizáveis para o router, incluindo todos os middlewares de segurança.
**Where**: `apps/api/src/infra/http/middlewares/`
**Depends on**: T02, T06
**Requirement**: AUTH-01, AUTH-03, SEC-01, SEC-02, SEC-04, SEC-08, SEC-09

**Done when**:
- [ ] `authenticate.ts` — extrai Bearer JWT, **rejeita `alg: none` explicitamente**, injeta `request.user`
- [ ] `authorize.ts` — recebe `(resource, action)`, verifica permissions do role
- [ ] `validateBody.ts` — recebe schema Zod, valida body, retorna 400 em falha
- [ ] `tenantIsolation.ts` — garante que toda query usa `establishment_id = request.user.establishmentId`; retorna 404 (não 403) em violação
- [ ] `rateLimiter.ts` — Redis sliding window; configurável por rota (`limit`, `windowMs`); retorna 429 + `Retry-After`
- [ ] `securityHeaders.ts` — injeta `X-Content-Type-Options`, `X-Frame-Options`, `X-Request-Id` em toda response
- [ ] `cors.ts` — valida origem contra `ALLOWED_ORIGINS`; falha ao iniciar se env ausente
- [ ] `errorSanitizer.ts` — captura erros não tratados, loga stack+requestId, retorna apenas `{ error, requestId }` ao cliente
- [ ] Todos testados com unidade (mock de request/response)

**Commit**: `feat(api): security middlewares — auth, rbac, rate-limit, tenant isolation, CORS, headers`

---

### T08: WebSocket Hub com autenticação por mensagem

**What**: Criar `apps/api/src/infra/websocket/WebSocketHub.ts` com protocolo de auth seguro.
**Where**: `apps/api/src/infra/websocket/`
**Depends on**: T02, T04
**Requirement**: ORDER-02, SEC-03

**Done when**:
- [ ] `WebSocketHub` gerencia rooms por `establishmentId`
- [ ] `join(socket, establishmentId)` / `leave(socket, establishmentId)` / `broadcast(establishmentId, event)`
- [ ] `WebSocketEvents.ts` enum com todos os eventos: `order:new`, `order:status_changed`, `kitchen:alert`, `cashier:payment`
- [ ] Redis pub/sub: `broadcast` publica no Redis, subscriber recebe e envia para sockets locais
- [ ] Endpoint WS `/ws` **sem token na URL** — aceita conexão, aguarda mensagem `{ type: "auth", token }` em 5s
- [ ] Timeout sem auth → fecha com código 4001; token inválido → código 4002; establishment errado → código 4003
- [ ] Auth OK → envia `{ type: "auth:ok" }` e adiciona ao room correto
- [ ] Reconexão do cliente: ao conectar e autenticar, recebe estado atual do establishment

**Commit**: `feat(api): WebSocket hub with message-based auth and Redis pub/sub`

---

## PHASE 3 — Auth Module

### T09: Auth domain — entidades e repositório

**What**: Criar domínio do módulo auth (User entity, Role entity, interfaces de repositório).
**Where**: `apps/api/src/modules/auth/domain/`
**Depends on**: T06
**Requirement**: AUTH-01

**Done when**:
- [ ] `User.ts` — interface com todos os campos (sem senha em texto)
- [ ] `Role.ts` — interface com permissions associadas
- [ ] `UserRepository.ts` — interface: `findByEmail`, `findById`, `create`, `updateRole`, `deactivate`
- [ ] `RoleRepository.ts` — interface: `findByName`, `findById`, `list`
- [ ] Sem dependências de infra (puro domínio)

**Commit**: `feat(auth): domain entities and repository interfaces`

---

### T10: Auth infrastructure — Drizzle repositories

**What**: Implementar `DrizzleUserRepository` e `DrizzleRoleRepository`.
**Where**: `apps/api/src/modules/auth/infrastructure/repositories/`
**Depends on**: T05, T09
**Requirement**: AUTH-01

**Done when**:
- [ ] `DrizzleUserRepository` implementa `UserRepository` usando schema do T05
- [ ] `DrizzleRoleRepository` implementa `RoleRepository`
- [ ] `findByEmail` case-insensitive
- [ ] `create` usa `Bun.password.hash()` para `password_hash`
- [ ] Sem `any` — tipos Drizzle explícitos com `InferSelectModel`

**Commit**: `feat(auth): Drizzle repository implementations`

---

### T11: Auth use-cases — Login, RefreshToken, Logout

**What**: Implementar os 3 use-cases de auth com brute force protection e token rotation.
**Where**: `apps/api/src/modules/auth/application/use-cases/`
**Depends on**: T09, T10, T07
**Requirement**: AUTH-01, AUTH-02, SEC-01, SEC-10, SEC-13

**Done when**:
- [ ] `LoginUseCase` — verifica contador de falhas no Redis antes de validar senha; incrementa em falha; zera em sucesso; salva hash SHA-256 do refreshToken no Redis (não o token em texto claro)
- [ ] `LoginUseCase` — após 5 falhas consecutivas para o email, define lockout de 15min no Redis
- [ ] `LoginUseCase` — retorna 423 se account bloqueado, com `retry_after` calculado
- [ ] `RefreshTokenUseCase` — **rotação obrigatória**: invalida token atual, emite novo par; se token já foi usado anteriormente, invalida TODA a família e loga evento de segurança
- [ ] `LogoutUseCase` — deleta família inteira de refresh do Redis
- [ ] `LoginUseCase` — força troca de senha se `password_must_change = true`
- [ ] Tokens gerados com `jose` (compatível Bun, suporte a rejeição de `alg: none`)
- [ ] Testes unitários para os 3 use-cases + cenários de brute force e reuse attack

**Commit**: `feat(auth): login with brute-force protection, refresh-token rotation`

---

### T12: Auth HTTP — controller + rotas + seed de roles

**What**: Criar controller, rotas e seed inicial de roles/permissions.
**Where**: `apps/api/src/modules/auth/infrastructure/http/`
**Depends on**: T11, T02
**Requirement**: AUTH-01, AUTH-02, AUTH-03

**Done when**:
- [ ] `POST /auth/login` → `LoginUseCase`
- [ ] `POST /auth/refresh` → `RefreshTokenUseCase`
- [ ] `POST /auth/logout` (autenticado) → `LogoutUseCase`
- [ ] `GET /auth/me` (autenticado) → retorna user atual com role e permissions
- [ ] Seed SQL em `database/seeds/roles.sql` com 6 roles e permissions padrão
- [ ] `bun run db:seed` executa seed sem erros

**Commit**: `feat(auth): HTTP routes and role seed`

---

## PHASE 4 — Core Modules Backend (Parallel)

### T13: Módulo customers [P]

**What**: CRUD de customers + findOrCreate por whatsapp_number.
**Where**: `apps/api/src/modules/customers/`
**Depends on**: T05, T12
**Requirement**: WEBHOOK-02

**Done when**:
- [ ] `CustomerRepository` interface + `DrizzleCustomerRepository`
- [ ] Use-cases: `CreateCustomer`, `FindOrCreateByWhatsapp`, `UpdateCustomer`, `ListCustomers`
- [ ] Rotas: `GET /customers`, `GET /customers/:id`, `POST /customers`, `PUT /customers/:id`
- [ ] `FindOrCreateByWhatsapp` é idempotente — não duplica por número

**Commit**: `feat(customers): CRUD and find-or-create use-cases`

---

### T14: Módulo categories [P]

**What**: CRUD de categorias com slug automático.
**Where**: `apps/api/src/modules/categories/`
**Depends on**: T05, T12
**Requirement**: PRODUCTS-01

**Done when**:
- [ ] Use-cases: `CreateCategory`, `UpdateCategory`, `ListCategories`, `DeleteCategory`
- [ ] Slug gerado automaticamente a partir do nome (normalizado, sem acento)
- [ ] Rotas CRUD em `/categories`
- [ ] Filtrado por `establishment_id` sempre

**Commit**: `feat(categories): CRUD with auto-slug`

---

### T15: Módulo products [P]

**What**: CRUD de produtos com cache Redis.
**Where**: `apps/api/src/modules/products/`
**Depends on**: T14
**Requirement**: PRODUCTS-01

**Done when**:
- [ ] Use-cases: `CreateProduct`, `UpdateProduct`, `ListProducts`, `ToggleProductActive`
- [ ] `ListProducts` usa cache Redis (TTL 5min), invalidado em create/update/toggle
- [ ] Rotas CRUD em `/products`
- [ ] Match por slug para webhook (normalização de nome → slug)

**Commit**: `feat(products): CRUD with Redis cache`

---

### T16: Módulo users [P]

**What**: CRUD de usuários (apenas admin/gerente).
**Where**: `apps/api/src/modules/users/`
**Depends on**: T12
**Requirement**: ADMIN-01

**Done when**:
- [ ] Use-cases: `CreateUser`, `UpdateUser`, `AssignRole`, `DeactivateUser`, `ListUsers`
- [ ] `CreateUser` gera senha temporária e armazena hash
- [ ] `AssignRole` invalida tokens ativos do usuário no Redis
- [ ] Rotas protegidas com `authorize('users', 'manage')`

**Commit**: `feat(users): CRUD with role assignment`

---

### T17: Módulo tables [P]

**What**: CRUD de mesas com status.
**Where**: `apps/api/src/modules/tables/`
**Depends on**: T05, T12
**Requirement**: —

**Done when**:
- [ ] Use-cases: `CreateTable`, `UpdateTable`, `UpdateTableStatus`, `ListTables`
- [ ] Status: `available`, `occupied`, `reserved`
- [ ] Rotas em `/tables`

**Commit**: `feat(tables): CRUD with status management`

---

## PHASE 5 — Orders + WebSocket

### T21: Módulo orders — domain + use-cases

**What**: Domínio completo de pedidos e use-cases de negócio.
**Where**: `apps/api/src/modules/orders/`
**Depends on**: T05, T13, T15, T08
**Requirement**: ORDER-01, ORDER-02, ORDER-03

**Done when**:
- [ ] `Order` entity com método `canTransitionTo(newStatus): boolean`
- [ ] `OrderRepository` interface: `create`, `findById`, `updateStatus`, `listByEstablishment`, `findByWhatsappMessageId`
- [ ] `DrizzleOrderRepository` implementa interface
- [ ] Use-cases: `CreateOrder`, `UpdateOrderStatus`, `CancelOrder`, `GetOrdersByEstablishment`, `GetOrderById`
- [ ] `UpdateOrderStatus` emite evento WebSocket via `WebSocketHub.broadcast`
- [ ] Timestamps setados automaticamente (ex: `production_started_at` quando → `in_production`)
- [ ] Transições inválidas lançam `ConflictError`

**Commit**: `feat(orders): domain, repository, and status-flow use-cases`

---

### T22: Módulo orders — HTTP routes

**What**: Rotas REST do módulo orders.
**Where**: `apps/api/src/modules/orders/infrastructure/http/`
**Depends on**: T21, T07
**Requirement**: ORDER-01

**Done when**:
- [ ] `GET /orders` — lista com filtros: status, date, channel (paginado)
- [ ] `GET /orders/:id` — detalhe com items
- [ ] `PATCH /orders/:id/status` — atualiza status
- [ ] `DELETE /orders/:id` — cancela (soft, registra motivo)
- [ ] Todas as rotas com `authenticate` + `authorize`

**Commit**: `feat(orders): REST HTTP routes`

---

### T23: Módulo kitchen — use-cases e rotas

**What**: Módulo kitchen com fila, SLA alert e mudança de status.
**Where**: `apps/api/src/modules/kitchen/`
**Depends on**: T21
**Requirement**: KITCHEN-01, KITCHEN-02

**Done when**:
- [ ] `GetKitchenQueue` — retorna orders em `received` e `in_production`, ordenados por prioridade + tempo
- [ ] `MarkOrderInProduction` → `UpdateOrderStatus` + emite `kitchen:started`
- [ ] `MarkOrderReady` → `UpdateOrderStatus` + emite `kitchen:ready`
- [ ] SLA lido de `settings` (key `kitchen_sla_minutes`), `isOverdue` calculado no use-case
- [ ] `GET /kitchen/queue` e `PATCH /kitchen/orders/:id/start` e `.../ready`
- [ ] Rotas protegidas: `authorize('kitchen', 'write')`

**Commit**: `feat(kitchen): queue use-cases and HTTP routes`

---

### T24: Módulo delivery — use-cases e rotas

**What**: Módulo delivery com atribuição de entregador e status flow.
**Where**: `apps/api/src/modules/delivery/`
**Depends on**: T21
**Requirement**: DELIVERY-01, DELIVERY-02, DELIVERY-03

**Done when**:
- [ ] `GetDeliveryQueue` — orders em `ready` aguardando atribuição
- [ ] `AssignDelivery` — cria `Delivery`, muda order para `in_delivery`
- [ ] `UpdateDeliveryStatus` — `dispatched` → `delivered` / `failed`
- [ ] `GetDelivererHistory` — histórico por entregador
- [ ] Rotas em `/delivery` protegidas por `authorize('delivery', 'write')`

**Commit**: `feat(delivery): assignment and status-flow use-cases`

---

### T25: Módulo cashier — use-cases e rotas

**What**: Módulo caixa com abertura, fechamento, pagamentos e movimentos.
**Where**: `apps/api/src/modules/cashier/`
**Depends on**: T21
**Requirement**: CASHIER-01, CASHIER-02, CASHIER-03

**Done when**:
- [ ] `OpenCashRegister` — cria `CashRegister` com `opening_amount`, verifica não há outro aberto
- [ ] `CloseCashRegister` — calcula saldo, fecha registro
- [ ] `RecordPayment` — cria `CashMovement` type `payment`, vincula a `order_id`
- [ ] `RecordWithdrawal` / `RecordSupply` — movimentos sem order
- [ ] `GetCashFlowSummary` — totais por método de pagamento no período do caixa
- [ ] Rotas em `/cashier` protegidas por `authorize('cashier', 'manage')`
- [ ] `409` quando caixa já aberto / não há caixa aberto

**Commit**: `feat(cashier): cash register open/close, payments, and movements`

---

### T29B: Audit log — tabela imutável e middleware [P]

**What**: Criar tabela `audit_logs` e serviço de auditoria para operações financeiras e de segurança.
**Where**: `apps/api/src/infra/database/schema/audit.ts`, `apps/api/src/shared/providers/AuditProvider.ts`
**Depends on**: T05
**Requirement**: SEC-06

**Done when**:
- [ ] Tabela `audit_logs` no schema Drizzle — sem coluna `updated_at` (imutável por design)
- [ ] Migration garante que `UPDATE` e `DELETE` na tabela são bloqueados via trigger PostgreSQL
- [ ] `AuditProvider` interface: `log(event: AuditEvent): Promise<void>`
- [ ] `DrizzleAuditProvider` implementa a interface
- [ ] Integrado nos use-cases: `OpenCashRegister`, `CloseCashRegister`, `RecordPayment`, `CancelOrder`, `AssignRole`, `DeactivateUser`
- [ ] `GET /audit/cash/:registerId` — protegido por `authorize('reports', 'read')`
- [ ] Testes: criar cash movement, verificar entrada em audit_log; tentar UPDATE em audit_log → erro

**Commit**: `feat(audit): immutable audit trail for financial and security events`

---

## PHASE 6 — Operational Modules (Parallel)

### T26: Módulo dashboard — métricas agregadas [P]

**What**: Queries de agregação para o dashboard gerencial.
**Where**: `apps/api/src/modules/dashboard/`
**Depends on**: T21, T25
**Requirement**: DASHBOARD-01

**Done when**:
- [ ] `GET /dashboard/summary?date=YYYY-MM-DD` — vendas, pedidos, ticket médio, top produtos
- [ ] `GET /dashboard/hourly?date=` — pedidos por hora do dia
- [ ] Resultados cacheados no Redis (TTL 2min, invalidado em novo pedido/pagamento)
- [ ] Protegido: `authorize('reports', 'read')`

**Commit**: `feat(dashboard): aggregate metrics with Redis cache`

---

### T27: Módulo reports — exportação CSV [P]

**What**: Geração de relatório CSV para o período selecionado.
**Where**: `apps/api/src/modules/reports/`
**Depends on**: T21, T25
**Requirement**: REPORTS-01

**Done when**:
- [ ] `GET /reports/sales?from=&to=` — gera CSV com pedidos, itens, pagamentos
- [ ] CSV gerado em memória, retornado como stream com `Content-Type: text/csv`
- [ ] Protegido: `authorize('reports', 'read')`

**Commit**: `feat(reports): CSV export endpoint`

---

### T28: Módulo settings [P]

**What**: CRUD de settings por establishment (key/value).
**Where**: `apps/api/src/modules/settings/`
**Depends on**: T05, T12
**Requirement**: —

**Done when**:
- [ ] `GET /settings` — lista todas as settings do establishment
- [ ] `PUT /settings/:key` — atualiza valor (jsonb), invalida cache
- [ ] Settings cacheadas no Redis por establishment
- [ ] Seed de settings padrão: `kitchen_sla_minutes: 20`

**Commit**: `feat(settings): key-value settings with Redis cache`

---

## PHASE 7 — Webhook Receiver

### T31: Webhook receiver WhatsApp com HMAC e replay protection

**What**: Endpoint `/webhooks/whatsapp` com verificação HMAC e proteção contra replay.
**Where**: `apps/api/src/modules/webhooks/`
**Depends on**: T21, T13, T15
**Requirement**: WEBHOOK-01, WEBHOOK-02, WEBHOOK-03, SEC-07

**Done when**:
- [ ] `POST /webhooks/whatsapp` verifica `X-Webhook-Signature: sha256=HMAC(secret, rawBody)` com `crypto.timingSafeEqual()` — sem isso, retorna 401 imediatamente (antes de parsear body)
- [ ] Header `X-Webhook-Nonce` obrigatório — verificado no Redis com TTL 5min para prevenir replay; se já visto, retorna 409
- [ ] Payload validado com Zod (schema do n8n) após verificação da assinatura
- [ ] `CreateOrderFromWebhookUseCase` orquestra: `FindOrCreateByWhatsapp` + `CreateOrder`
- [ ] Items matchados por nome → slug de produto (exact match normalizado)
- [ ] `whatsapp_message_id` verificado — se duplicado retorna order existente (idempotente, 200)
- [ ] Loga apenas `{ establishment_id, message_id, timestamp }` — não o payload completo
- [ ] Emite `order:new` via WebSocket após criar
- [ ] Testes: assinatura válida, assinatura inválida (401), replay (409), payload duplicado (200), establishment não encontrado (404)

**Commit**: `feat(webhooks): WhatsApp receiver with HMAC verification and replay protection`

---

### T32: Container IoC + bootstrap final da API

**What**: Montar `container.ts` ligando todos os módulos e registrar rotas no server.
**Where**: `apps/api/src/infra/container.ts`, `apps/api/src/index.ts`
**Depends on**: T12, T13-T17, T21-T25, T26-T28, T31
**Requirement**: —

**Done when**:
- [ ] `container.ts` instancia todos os repositórios e use-cases na ordem correta
- [ ] `index.ts` registra todas as rotas no router, inicia servidor
- [ ] `GET /health` retorna status de PG + Redis
- [ ] `bun run start` sobe API completa sem erros
- [ ] Todos os endpoints documentados em `apps/api/API.md` (lista de rotas)

**Commit**: `feat(api): IoC container and full server bootstrap`

---

## PHASE 8 — Frontend Foundation

### T33: Setup Vite + React + TailwindCSS + path aliases

**What**: Configurar projeto web do zero.
**Where**: `apps/web/`
**Depends on**: T01
**Requirement**: —

**Done when**:
- [ ] Vite + React + TypeScript configurados
- [ ] TailwindCSS com config base (cores, fonte, breakpoints)
- [ ] Path alias `@/` → `src/`
- [ ] `bun run dev` abre em localhost:4000 sem erros
- [ ] ESLint + TypeScript strict

**Commit**: `feat(web): Vite + React + TailwindCSS setup`

---

### T34: Auth store + AuthService + hooks

**What**: Estado de autenticação com Zustand + chamadas ao backend.
**Where**: `apps/web/src/modules/auth/`
**Depends on**: T33
**Requirement**: AUTH-01, AUTH-02

**Done when**:
- [ ] `authStore.ts` (Zustand): `user`, `accessToken`, `isAuthenticated`, `login`, `logout`
- [ ] `authService.ts`: funções `login(email, password)`, `refreshToken()`, `logout()`
- [ ] `useAuth` hook expõe o store
- [ ] Interceptor de request: adiciona `Authorization: Bearer ...` em todas as chamadas
- [ ] Interceptor de response: em 401 com `token_expired`, chama refresh automaticamente
- [ ] Token salvo em memória (não localStorage) — refreshToken em httpOnly cookie

**Commit**: `feat(web): auth store with silent token refresh`

---

### T35: Router com RoleGuard + layouts por perfil

**What**: Configurar React Router com proteção por role.
**Where**: `apps/web/src/router/`
**Depends on**: T34
**Requirement**: AUTH-03

**Done when**:
- [ ] Rotas públicas: `/login`
- [ ] Rotas protegidas por role: `/kitchen`, `/delivery`, `/cashier`, `/admin/*`, `/dashboard`
- [ ] `RoleGuard` redireciona para `/login` se não autenticado, para `/forbidden` se role insuficiente
- [ ] Sidebar adapta itens visíveis conforme role do usuário logado
- [ ] Redirect pós-login vai para painel padrão do role (kitchen → `/kitchen`, etc.)

**Commit**: `feat(web): role-based routing and sidebar`

---

### T36: WebSocket hook + conexão global

**What**: Hook `useWebSocket` que conecta ao backend e dispatcha eventos para stores.
**Where**: `apps/web/src/shared/hooks/useWebSocket.ts`
**Depends on**: T34, T08
**Requirement**: ORDER-02, SEC-03

**Done when**:
- [ ] `useWebSocket` conecta em `wss://API_URL/ws` **sem token na URL** (SEC-03 — token em URL aparece em logs de proxy/Railway)
- [ ] Após conectar, envia imediatamente `{ type: "auth", token: accessToken }` como primeira mensagem
- [ ] Aguarda `{ type: "auth:ok" }` do servidor antes de considerar conexão pronta
- [ ] Em `{ type: "auth:error" }` ou timeout de 5s → encerra e tenta reconexão com novo token
- [ ] Reconexão automática com backoff exponencial (1s, 2s, 4s, 8s, máx 30s)
- [ ] Eventos recebidos redirecionados para handlers registrados por tipo
- [ ] `onOrderNew`, `onOrderStatusChanged`, `onKitchenAlert` como callbacks registráveis
- [ ] Estado de conexão: `connecting`, `authenticating`, `connected`, `disconnected`, `reconnecting`
- [ ] URL do WS lida de `VITE_API_WS_URL` (env) — usa `wss://` em prod, `ws://` em dev

**Commit**: `feat(web): WebSocket hook with message-based auth and auto-reconnect`

---

## PHASE 9 — Frontend Painéis

### T37: Painel da Cozinha [P]

**What**: Interface touch-optimized para a cozinha com fila em tempo real.
**Where**: `apps/web/src/modules/kitchen/`
**Depends on**: T36
**Requirement**: KITCHEN-01, KITCHEN-02

**Done when**:
- [ ] Colunas: `Recebido` | `Em Preparo` | `Prontos`
- [ ] `OrderCard` exibe: número do pedido, cliente, itens, tempo decorrido
- [ ] Cards em atraso (>SLA) ficam com borda vermelha + ícone de alerta
- [ ] Botões touch grandes: "Iniciar Preparo" / "Marcar Pronto"
- [ ] Novos pedidos entram via WebSocket sem reload
- [ ] TanStack Query para estado inicial, WebSocket para updates

**Commit**: `feat(web): kitchen panel with real-time queue`

---

### T38: Painel de Entrega [P]

**What**: Interface de atribuição e rastreamento de entregas.
**Where**: `apps/web/src/modules/delivery/`
**Depends on**: T36
**Requirement**: DELIVERY-01, DELIVERY-02, DELIVERY-03

**Done when**:
- [ ] Lista "Aguardando Entrega" aparece automaticamente quando order vai para `ready`
- [ ] Seletor de entregador (dropdown com usuários role `deliverer`)
- [ ] Status flow visual: Aguardando → Em Rota → Entregue / Não Entregue
- [ ] Histórico de entregas do dia

**Commit**: `feat(web): delivery panel with assignment flow`

---

### T39: Painel do Caixa [P]

**What**: Interface de caixa com abertura, pagamentos e fechamento.
**Where**: `apps/web/src/modules/cashier/`
**Depends on**: T36
**Requirement**: CASHIER-01, CASHIER-02, CASHIER-03

**Done when**:
- [ ] Tela de abertura de caixa (valor inicial)
- [ ] Dashboard do caixa aberto: total por método de pagamento, saldo atual
- [ ] Registrar pagamento: seleciona order, método, valor
- [ ] Sangria e suprimento com campo de motivo
- [ ] Fechamento de caixa com resumo e confirmação
- [ ] Impede ações quando caixa fechado (UI desabilitada)

**Commit**: `feat(web): cashier panel with full cash flow`

---

### T40: Painel Admin [P]

**What**: CRUD completo para administradores e gerentes.
**Where**: `apps/web/src/modules/admin/`
**Depends on**: T36
**Requirement**: ADMIN-01, PRODUCTS-01

**Done when**:
- [ ] Páginas: Usuários, Produtos, Categorias, Clientes, Mesas, Configurações
- [ ] Tabelas com paginação, busca e ações (editar/excluir)
- [ ] Formulários com validação Zod no client
- [ ] TanStack Query: `useQuery` para listagens, `useMutation` para CRUDs

**Commit**: `feat(web): admin panel with full CRUD pages`

---

### T41: Dashboard gerencial [P]

**What**: Página de métricas com gráficos.
**Where**: `apps/web/src/modules/dashboard/`
**Depends on**: T36
**Requirement**: DASHBOARD-01

**Done when**:
- [ ] Cards: Vendas do dia, Pedidos, Ticket médio, Entregas realizadas
- [ ] Gráfico de barras: pedidos por hora (usando Recharts ou similar)
- [ ] Top 5 produtos mais vendidos
- [ ] Seletor de data para histórico
- [ ] Atualização em tempo real de contadores via WebSocket

**Commit**: `feat(web): dashboard with metrics and charts`

---

## PHASE 10 — Infra Deploy

### T43: Dockerfiles + Compose local + Railway config

**What**: Criar Dockerfiles de produção, atualizar compose local e criar configurações Railway por serviço.
**Where**: `apps/api/Dockerfile`, `apps/web/Dockerfile`, `docker-compose.yml`, `apps/api/railway.toml`, `apps/web/railway.toml`
**Depends on**: T32, T33
**Requirement**: SEC-05

**Contexto Railway:**
Railway NÃO executa docker-compose como unidade. Cada serviço é deployado individualmente.
PostgreSQL e Redis são provisionados como **plugins gerenciados** do Railway (não containers nossos).
O `docker-compose.yml` da raiz serve apenas para **desenvolvimento local**.

**Done when — Dockerfile da API** (`apps/api/Dockerfile`):
- [ ] Multi-stage: `FROM oven/bun:1-alpine AS builder` → instala deps + build
- [ ] Stage final: `FROM oven/bun:1-distroless` → copia apenas artefatos
- [ ] Expõe `$PORT` (não porta hardcoded) via `ENV PORT=3333` como fallback
- [ ] `CMD ["bun", "run", "src/index.ts"]`
- [ ] `.dockerignore` exclui `node_modules`, `.env`, `*.test.ts`

**Done when — Dockerfile do Web** (`apps/web/Dockerfile`):
- [ ] Stage build: `FROM oven/bun:1-alpine AS builder` → `bun run build`
- [ ] Stage final: `FROM nginx:alpine` → copia `dist/` para `/usr/share/nginx/html`
- [ ] `nginx.conf` configurado para SPA (fallback para `index.html` em qualquer rota)
- [ ] `VITE_API_URL` e `VITE_API_WS_URL` injetados em build-time via `--build-arg`

**Done when — Compose local** (`docker-compose.yml`):
- [ ] Adiciona service `order-hub-api`: build de `apps/api/`, porta `3333:3333`, depends on postgres + redis
- [ ] Adiciona service `order-hub-web`: build de `apps/web/`, porta `4000:80`, depends on order-hub-api
- [ ] Ambos na rede interna do compose (se comunicam com postgres/redis por hostname de serviço)
- [ ] `make up` sobe o stack completo incluindo os dois novos serviços
- [ ] Healthchecks em ambos (`GET /health` na API, `GET /` no web)

**Done when — Railway (API)** (`apps/api/railway.toml`):
```toml
[build]
builder = "dockerfile"
dockerfilePath = "apps/api/Dockerfile"

[deploy]
startCommand = "bun run src/index.ts"
healthcheckPath = "/health"
healthcheckTimeout = 300
restartPolicyType = "ON_FAILURE"
restartPolicyMaxRetries = 3
```
- [ ] Arquivo criado e validado

**Done when — Railway (Web)** (`apps/web/railway.toml`):
```toml
[build]
builder = "dockerfile"
dockerfilePath = "apps/web/Dockerfile"

[deploy]
healthcheckPath = "/"
restartPolicyType = "ON_FAILURE"
```
- [ ] Arquivo criado e validado

**Done when — Rede Railway:**
- [ ] `DATABASE_URL` referencia o plugin Postgres do Railway (não hostname fixo)
- [ ] `REDIS_URL` referencia o plugin Redis do Railway
- [ ] Comunicação interna entre serviços Railway usa `$RAILWAY_PRIVATE_DOMAIN` (Railway injeta automaticamente via variáveis de referência no dashboard)
- [ ] Documentado em `SETUP.md`: como linkar o plugin PG/Redis aos serviços no dashboard Railway

**Commit**: `feat(infra): Dockerfiles, local compose, and Railway service configs`

---

### T44: CI/CD — GitHub Actions

**What**: Pipeline de validação no push/PR com cache de dependências Bun.
**Where**: `.github/workflows/ci.yml`
**Depends on**: T32, T33
**Requirement**: —

**Done when**:
- [ ] Job `api`: typecheck (`bun run typecheck`) + lint + unit tests (`bun test`)
- [ ] Job `web`: typecheck + lint + build (`bun run build`) — falha se build quebrar
- [ ] Ambos rodam em paralelo
- [ ] Cache de `~/.bun/install/cache` por hash do `bun.lockb`
- [ ] Falha em qualquer job bloqueia merge no branch `main`
- [ ] Badge de status do CI no `README.md`

**Commit**: `ci: GitHub Actions pipeline for api and web`

---

### T45: Variáveis de ambiente + documentação Railway

**What**: Documentar todas as variáveis de ambiente separadas por contexto (local vs Railway).
**Where**: `infra/.env.example`, `apps/api/.env.example`, `apps/web/.env.example`, `SETUP.md`
**Depends on**: T43
**Requirement**: —

**Done when — `apps/api/.env.example`**:
```bash
# Servidor
PORT=3333                          # Railway injeta automaticamente — não setar no dashboard
NODE_ENV=development

# Banco (local: hostname do compose | Railway: referência ao plugin)
DATABASE_URL=postgres://botuser:senha@postgres:5432/botdb

# Redis (local: hostname do compose | Railway: referência ao plugin)
REDIS_URL=redis://redis:6379

# Auth
JWT_SECRET=troque_para_string_aleatoria_32chars
JWT_REFRESH_SECRET=troque_para_outra_string_aleatoria_32chars
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# Webhook
WEBHOOK_SECRET=hmac_secret_compartilhado_com_n8n

# CORS
ALLOWED_ORIGINS=http://localhost:4000,https://seu-web.railway.app

# Ambiente
LOG_LEVEL=info
```

**Done when — `apps/web/.env.example`**:
```bash
VITE_API_URL=http://localhost:3333
VITE_API_WS_URL=ws://localhost:3333
```

**Done when — `SETUP.md` seção Railway**:
- [ ] Passo a passo: criar projeto Railway, adicionar plugins PG e Redis
- [ ] Como criar os 3 serviços: `n8n` (já existente), `order-hub-api`, `order-hub-web`
- [ ] Como configurar variáveis de referência no dashboard: `DATABASE_URL` → plugin PG, `REDIS_URL` → plugin Redis
- [ ] Como linkar `VITE_API_URL` do web ao URL gerado pela API no Railway
- [ ] Aviso: `PORT` é injetado pelo Railway — não setar manualmente

**Commit**: `docs: env examples and Railway setup guide`

---

## Parallel Execution Map

```
T01
├── T02 → T07 → T08
│         └──────────────────────────────────┐
├── T03 → T05 → T09 → T10 → T11 → T12       │
│         └──────────────────────────────────┤
├── T04                                       │
└── T06                                       │
                                              │
After T12:                                    │
├── T13 [P]                                   │
├── T14 → T15 [P]              After T08+T12: │
├── T16 [P]                    └──────────────┘
└── T17 [P]                    T21 → T22
                               T21 → T23
After T21-T25:                 T21 → T24
├── T26 [P]                    T21 → T25
├── T27 [P]                    T21 → T31
└── T28 [P]                    T31 → T32

Frontend (parallel with Phase 4+):
T33 → T34 → T35 → T36
                   ├── T37 [P]
                   ├── T38 [P]
                   ├── T39 [P]
                   ├── T40 [P]
                   └── T41 [P]

After all: T43 → T44 → T45
```

**Total: 45 tasks | P1: 32 tasks | P2/P3: 13 tasks**
