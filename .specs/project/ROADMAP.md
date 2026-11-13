# Roadmap — Order Hub

## M1 — Foundation (Backend Core)
Infraestrutura, banco, auth e webhook receiver prontos.

- [ ] Monorepo Bun configurado (`apps/api/`, `apps/web/`)
- [ ] uWebSockets.js server com router thin-wrapper
- [ ] Schema Drizzle completo (todas as tabelas)
- [ ] Redis conectado (cache + pub/sub)
- [ ] Auth JWT (login, refresh, logout)
- [ ] RBAC: roles + permissions + middleware de guarda
- [ ] Webhook receiver `/webhooks/whatsapp` → cria Order

## M2 — Módulos Core (Backend)
CRUD completo dos módulos de negócio.

- [ ] Módulo users (CRUD + assign role)
- [ ] Módulo products + categories
- [ ] Módulo customers (criado/atualizado via webhook)
- [ ] Módulo tables
- [ ] Módulo orders (criação, status flow, histórico)
- [ ] Módulo delivery (atribuição, status, histórico)
- [ ] Módulo kitchen (fila, prioridade, status)
- [ ] Módulo cashier (abertura, fechamento, movimentos, pagamentos)

## M3 — Real-time (WebSocket)
Eventos em tempo real para todos os painéis.

- [ ] WebSocket hub (rooms por establishment + por módulo)
- [ ] Emissão automática em mutations de Order
- [ ] Emissão em mudança de status kitchen/delivery/cashier

## M4 — Frontend Foundation
Setup, auth e roteamento.

- [ ] Vite + React + TailwindCSS configurado
- [ ] Auth UI (login, logout, refresh silencioso)
- [ ] Router com guards por role
- [ ] Layout base + sidebar por perfil

## M5 — Painéis Operacionais (Frontend)
Todos os painéis com dados reais.

- [ ] Painel Admin (users, products, categories, customers, tables, settings)
- [ ] Painel Cozinha (fila touch-optimized, WebSocket, alertas de atraso)
- [ ] Painel Entrega (lista prontos, atribuição, status map)
- [ ] Painel Caixa (abertura/fechamento, registro de pagamentos)
- [ ] Dashboard gerencial (métricas, gráficos)

## M6 — Produção
Infraestrutura de deploy e observabilidade.

- [ ] Docker Compose integrado (api + web adicionados ao compose existente)
- [ ] CI/CD (GitHub Actions: lint + typecheck + tests)
- [ ] Health check endpoints
- [ ] Variáveis de ambiente documentadas

---

## Feature Backlog (pós-v1)
- Canal iFood / Rappi (adapter pattern já previsto)
- App mobile (React Native) para entregadores
- Impressão de comandas (driver ESC/POS)
- Geolocalização de entrega em tempo real
- Módulo de estoque
- Módulo de reservas
