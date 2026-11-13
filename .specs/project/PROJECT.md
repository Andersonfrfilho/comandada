# Order Hub — Painel de Gestão de Pedidos

**Vision:** Hub de integração operacional que centraliza pedidos vindos do WhatsApp (sakura-bot Meta Cloud API) e outros canais em painéis especializados por perfil, com atualização em tempo real.

**For:** Operadores de restaurante/pesqueiro — cozinha, caixa, entrega, gerência e administração.

**Solves:** Pedidos chegam via WhatsApp no n8n mas não existia visibilidade operacional estruturada — sem painel de cozinha, sem controle de caixa, sem rastreamento de entrega. Este sistema fecha esse gap.

---

## Goals

- Receber e expor pedidos vindos do WhatsApp (webhook do n8n → API) com latência < 500ms
- Manter todos os painéis operacionais sincronizados em tempo real via WebSocket
- RBAC completo: cada perfil vê e age apenas no que é autorizado
- Suportar múltiplas unidades (multi-tenant por establishment)
- Pronto para integrar outros canais além do WhatsApp (iFood, Rappi, etc.)

---

## Tech Stack

**Backend:**
- Runtime: Bun
- HTTP + WebSocket: uWebSockets.js
- Language: TypeScript (strict, sem `any`)
- ORM: Drizzle ORM
- Database: PostgreSQL
- Cache / Pub-Sub: Redis
- Auth: JWT (access + refresh tokens)
- Architecture: Clean Architecture modular (Domain → Application → Infrastructure)

**Frontend:**
- Framework: React + TypeScript
- Build: Vite
- State: Zustand (local/global) + TanStack Query (server state)
- Styling: TailwindCSS
- Real-time: WebSocket nativo

---

## Scope

**v1 inclui:**
- Auth completo com RBAC (6 perfis)
- Webhook receiver para pedidos do WhatsApp via n8n
- Módulos: users, roles, customers, products, categories, orders, tables, delivery, kitchen, cashier
- Painel Admin (gestão completa)
- Painel Cozinha (touch-optimized, real-time)
- Painel Entrega (atribuição + status)
- Painel Caixa (abertura/fechamento, pagamentos, fluxo)
- Dashboard gerencial (métricas do dia/mês)
- Docker Compose integrado ao sakura-bot-oficial existente

**Explicitamente fora do v1:**
- App mobile nativo
- Integração iFood/Rappi/outros canais (arquitetura preparada, não implementada)
- Geolocalização de entregadores em tempo real
- Impressão de comandas (interface preparada, driver não incluído)
- Sistema de estoque/inventário
- Módulo de reservas (flag na CLAUDE.md do sakura-bot)

---

## Constraints

- **Stack obrigatória:** exatamente conforme PROJECTO.md — sem substituições de framework
- **Integração:** compartilha o PostgreSQL do docker-compose.yml existente (sakura-bot-oficial)
- **Sem `any` TypeScript** — conforme CLAUDE.md do projeto
- **Nomes descritivos** — sem diminutivos (conforme CLAUDE.md)
- **Strings de UI em constants** — MessagesConstants
- **Multi-tenant:** todas as queries filtradas por `establishment_id`
