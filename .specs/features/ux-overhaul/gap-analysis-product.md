# T11.4 — Product Gap Analysis: Order Hub vs Reference Systems

Comparing **Order Hub** (sakura-bot-oficial) against established restaurant
management systems (iFood Manager, Otter, Yooga, Toast, Revel) to identify
missing features beyond what is already mapped in the UX overhaul spec.

## Methodology

Reference systems selected for their market relevance:
- **iFood Manager** — largest LATAM food delivery aggregator
- **Otter** — multi-channel order aggregation (Uber Eats, DoorDash, iFood)
- **Yooga** — table management + KDS + inventory
- **Toast** — full-stack POS + KDS + loyalty (US market leader)
- **Revel Systems** — enterprise POS with multi-establishment

Gaps scored 1 (nice-to-have) to 5 (critical competitive differentiator).

---

## Missing Features

### 1. KDS (Kitchen Display System) with Bump

| Current State | What It Is |
|---------------|-----------|
| `KitchenPage.tsx` lists orders on screen. No bump interaction, no audio alerts, no lane management. | Dedicated touchscreen for kitchen staff. Orders appear in lanes (by station: grill, fry, salad). Cook taps "bump" to mark done. Audio alerts on new orders. Color-codes for wait time (green → yellow → red). |

**Priority: 5** — Restaurants without KDS use printed tickets. Order Hub's
kitchen view is read-only; staff needs a separate device (tablet/phone) to
change order status. A proper KDS reduces ticket printers, paper waste, and
frees staff from walking between kitchen and front.

**Effort:** Large (new React component + WebSocket real-time sync + audio API)

**Dependencies:** T3.1 (floor management for kitchen layout)

---

### 2. Delivery Route Optimization

| Current State | What It Is |
|---------------|-----------|
| `DeliveryQueue` lists pending deliveries. No route planning, no Google Maps directions, no zone-based load balancing. | Optimization engine that calculates optimal delivery routes considering: distance, traffic, order preparation time, driver location. Integrates with Google Maps / Mapbox Directions API. Multi-stop routing (up to 25 stops). |

**Priority: 3** — Important for restaurants with own fleet (>5 drivers). The
current single-assignment model works for 1-2 drivers but doesn't scale.

**Effort:** Large (external API dependency + vehicle routing algorithm)

**Dependencies:** T8.2 (delivery fee zones), T4.3 (customer addresses with lat/lng)

---

### 3. Loyalty Program / Coupons / Discounts

| Current State | What It Is |
|---------------|-----------|
| No loyalty system, no promotional discounts, no coupon codes. Price at catalog level only. | Points-per-order system, redeemable rewards (free item, discount %). Campaign management: "buy X get Y", first-order discounts, birthday rewards. Coupon code generation with expiration and usage limits. |

**Priority: 4** — Direct impact on customer retention and repeat orders. The
WhatsApp bot can deliver loyalty status automatically (no app needed). This
is a differentiator vs competitors requiring app installation.

**Effort:** Large (new schema: `loyalty_points`, `coupons`, `campaigns`)

**Dependencies:** None (self-contained module)

---

### 4. Service Charge / Tip Management

| Current State | What It Is |
|---------------|-----------|
| No tip or service charge tracking. Staff comp not modeled. | Configurable auto-service (% of order) added to bill. Tip management: pool, individual, or hybrid distribution. Cash-out reports by staff member. |

**Priority: 3** — Legal requirement in Brazil (service charge is optional
but must be explicit). Toast-style pooled tips by shift is industry standard.

**Effort:** Medium (new schema: `service_charges`, `tip_pools`)

**Dependencies:** T6.11 (costing to compute margins net of service)

---

### 5. Multi-Establishment / Franchise

| Current State | What It Is |
|---------------|-----------|
| `establishmentId` is a foreign key in every table but the dashboard is single-establishment. No cross-location reporting, no shared catalog, no franchise hierarchy. | Operator managing 2+ restaurants from single dashboard. Shared product catalog (with location overrides), consolidated financial reports, inter-location stock transfers, staff can move between locations. Role hierarchy: franchise admin → location manager → staff. |

**Priority: 2** — Only relevant if the customer operates multiple locations.
The schema already supports it (all tables have `establishmentId`); the UI
and reporting don't.

**Effort:** X-Large (touches every screen and every query)

**Dependencies:** T5.1 (roles/permissions — already done)

---

### 6. Post-Order NPS via Bot

| Current State | What It Is |
|---------------|-----------|
| No automated post-order survey. Bot conversation ends after delivery completion. | 30-60 minutes after delivery, WhatsApp bot sends: "Como foi seu pedido? Nota 1-5." Low scores (<3) auto-escalate to human. High scores trigger Google Review link. NPS dashboard shows trends by product, delivery zone, driver. |

**Priority: 4** — Low-cost, high-impact. Leverages the existing WhatsApp bot
infrastructure. Competitors require SMS or email for NPS; WhatsApp has 98%
open rates in Brazil.

**Effort:** Medium (new n8n workflow + `customer_feedback` table + dashboard)

**Dependencies:** T10.1 (bot already functional for outbound messages)

---

### 7. Menu QR Code for Tables

| Current State | What It Is |
|---------------|-----------|
| `TablesPage` lists tables but no QR generation. Menu is only accessible via WhatsApp bot. | Each table generates a unique QR code (printed sticker). Customer scans → web app with digital menu → place order without staff → flows into Order Hub kitchen view. Optional: WhatsApp shortcut fallback. |

**Priority: 4** — Essential for dine-in 2.0. The infrastructure is partially
there (table CRUD + public menu endpoint). Missing: QR generation, table-scoped
ordering page, payment integration on the web app.

**Effort:** Medium (new public route + QR library + simple ordering UI)

**Dependencies:** T3.1 (physical table layout)

---

### 8. Ingredient-Level Inventory Forecasting

| Current State | What It Is |
|---------------|-----------|
| `StockBatches` tracks current inventory. No demand forecasting. | ML/statistical model predicting ingredient consumption based on: historical orders (7/30/90 days), day of week, weather API, local events. Auto-generated purchase orders with suggested quantities. |

**Priority: 1** — "Nice to have" for small operations. Becomes critical above
5+ locations (franchise territory).

**Effort:** X-Large (data pipeline + ML model + purchase order workflow)

**Dependencies:** T6.5 (stock batches), T6.10 (ingredient recipes), T9.3 (ingredient analytics)

---

### 9. Integrated Payment Terminal (TEF/POS)

| Current State | What It Is |
|---------------|-----------|
| Payments recorded manually. No integration with card machines (Cielo, Rede, Stone, PagSeguro). | API integration with Brazilian acquirers: payment link generation, QR code PIX, card machine trigger (TEF). Auto-confirms payment in Order Hub when terminal processes the transaction. |

**Priority: 2** — Highly valuable but requires commercial agreements with each
acquirer. Most restaurants manually input card payments (cultural inertia).

**Effort:** X-Large (per-acquirer SDK integration + PCI compliance)

**Dependencies:** None (independent module)

---

### 10. Offline Mode / PWA

| Current State | What It Is |
|---------------|-----------|
| Order Hub is a SPA requiring constant internet. No offline cache. | Progressive Web App with service worker. KDS caches pending orders locally. Cashier can record payments offline → sync when back online. Conflict resolution for concurrent offline edits. |

**Priority: 2** — Important for areas with unstable internet (rural restaurants,
food trucks). The web architecture (React SPA + REST API) makes this feasible.

**Effort:** Large (Service Worker + IndexedDB + conflict resolution logic)

**Dependencies:** PWA manifest already partially in `apps/web`

---

## Priority Summary

| # | Feature | Prio | Effort | Rationale |
|---|---------|:----:|:------:|-----------|
| 1 | **KDS with bump** | 5 | Large | Core kitchen ops. Replaces paper tickets. Most requested by restaurant staff. |
| 2 | **Loyalty + coupons** | 4 | Large | Retention metric. WhatsApp delivery is a unique differentiator. |
| 3 | **Post-order NPS via bot** | 4 | Medium | Low effort, high ROI. WhatsApp open rates in Brazil are 98%. |
| 4 | **Menu QR code for tables** | 4 | Medium | Essential for dine-in efficiency. Leverages existing table infra. |
| 5 | **Delivery route optimization** | 3 | Large | Scales own fleet. Not needed for <5 drivers. |
| 6 | **Service charge / tip management** | 3 | Medium | Legal compliance in Brazil. Staff comp tracking. |
| 7 | **Multi-establishment** | 2 | X-Large | Only for 2+ locations. Schema supports it already. |
| 8 | **Payment terminal TEF/POS** | 2 | X-Large | High value but commercial blocker. |
| 9 | **Offline PWA** | 2 | Large | Rural/food truck use case. Nice infrastructure upgrade. |
| 10 | **Inventory forecasting** | 1 | X-Large | Overkill for single restaurant. Revisit for franchise. |

## Recommended Roadmap (Post-UX-Overhaul)

```
Q1 2026:
  Feature #1   KDS with bump
  Feature #3   Post-order NPS via bot

Q2 2026:
  Feature #2   Loyalty + coupons
  Feature #4   Menu QR code for tables

Q3 2026:
  Feature #6   Service charge / tip management
  Feature #5   Delivery route optimization

Backlog (revisit in 6 months):
  Feature #7   Multi-establishment (customer-driven)
  Feature #8   Payment terminal integration (partner-driven)
  Feature #9   Offline PWA (infra upgrade)
  Feature #10  Inventory forecasting (ML project)
```

## Features Mapped Outside This Document

These are already tracked in the UX overhaul spec or tasks.md and intentionally
not re-evaluated here:

| Already Mapped | Where |
|----------------|-------|
| iFood integration (T11.1/T11.2) | ifood-spike.md / tasks.md §11 |
| Dark mode (UX-DSN-04) | gap-analysis-conversations.md |
| Rich message editor / emoji picker | gap-analysis-conversations.md |
| Media pipeline (uploads + S3 + workers) | gap-analysis-conversations.md |
| Fiscal document PDF generation (T8.5) | tasks.md §8 |
| Product cost/margin (T6.1/T6.11) | tasks.md §6 |
| Stock by batch / expiry alerts (T6.5/T6.6) | tasks.md §6 |
| Table floor map (T3.1) | tasks.md §3 |
| Financial reports (T10.3) | tasks.md §10 |
| Report analytics (T9.1-9.4) | tasks.md §9 |

## Reference Benchmarks

| System | KDS | Loyalty | NPS | QR Menu | Multi-Estab | Delivery Route | TEF |
|--------|:---:|:-------:|:---:|:-------:|:-----------:|:--------------:|:---:|
| iFood Manager | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ (owns fleet) | ❌ |
| Otter | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| Yooga | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Toast | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Revel | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | ✅ |
| **Order Hub (target)** | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
