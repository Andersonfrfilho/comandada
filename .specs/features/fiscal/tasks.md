# Módulo Fiscal — Tasks (Revisão 2026-07, orientado a execução via opencode)

Cada task é auto-contida: **contexto**, **arquivos**, **critério de aceite**, **verificação**.
Estado da lib: `@adatechnology/fiscal-provider` já integrada (direto SEFAZ). Ver `design.md`.

Legenda: ✅ feito · ⬜ a fazer · 🔗 depende de.

---

## ✅ Já implementado (não refazer — apenas revisar no diff)
- Schemas `fiscal_configurations`, `fiscal_documents`; enums `fiscal_model`, `fiscal_document_status`.
- NCM/CFOP/CST por categoria + `buildFiscalItems`.
- Use-cases: Emit (in-process), Cancel, Get, Retry, RetryPending, TestConnection, UpsertConfig.
- FiscalController + FiscalRoutes (emit, getByOrder, list, cancel, downloadXml, getPdfUrl, config, test, retry, retryPending).
- Eventos WS `fiscal:emitting|authorized|rejected|cancelled`.

---

## Sprint A — Infra de fila + criptografia (fundação)

### FISCAL-A1 ✅ SecretCipher (AES-256-GCM)
- **Arquivos**: `apps/api/src/infra/crypto/SecretCipher.ts`, `SecretCipher.test.ts`.
- **Aceite**: `encrypt(x)` → `iv.tag.ct` base64; `decrypt(encrypt(x))===x`; erro claro se `APP_SECRET` ausente. ✔
- **Verificação**: `bun test src/infra/crypto/SecretCipher.test.ts` → 6/6 pass; `tsc --noEmit` limpo. ✔
- **Review**: opencode(qwen3.7-max) implementou; 2 agentes revisaram; aplicado hardening (validação de tamanho de IV/authTag). Salt estático e scrypt default aceitos p/ segredo único.
- **Pendente env**: adicionar `APP_SECRET` ao schema de env acontece junto de FISCAL-A3 (consumo real).

### FISCAL-A2a ✅ Conexão Redis dedicada + Queue BullMQ
- 🔗 —
- **Arquivos**: `infra/queue/redisConnection.ts`, `QueueNames.constant.ts`, `fiscalQueue.ts`. Dep `bullmq@5.80.2`.
- **Aceite**: `ioredis` dedicado `maxRetriesPerRequest:null`; `Queue<FiscalJobData,unknown,FiscalJobName>` tipada; `defaultJobOptions` com retenção limitada (sucesso 7d/2000, falha 30d/2000), `attempts:5`, backoff expo 5s. ✔
- **Verificação**: `tsc --noEmit` limpo; smoke import → `fiscalQueue.name === 'fiscal'`. ✔
- **Review**: 1 agente (config-only) → typou a Queue genericamente (enforça nome/data do job), add `FiscalSweepJobData`, cast simplificado.

### FISCAL-A2b ⬜ Bull Board (observabilidade) — DEFERIDO
- 🔗 FISCAL-A2a
- **Motivo do split**: a API usa **uWebSockets.js**, sem adapter oficial de Bull Board. Solução: mini-Express em porta própria, basic auth por env. Não bloqueia B1/B2.
- **Arquivos**: `infra/queue/bullBoard.ts` (+ `express`, `@bull-board/api`, `@bull-board/express`).

### FISCAL-A3 ✅ Criptografar certificado no UpsertFiscalConfig
- 🔗 FISCAL-A1
- **Arquivos**: novo `application/FiscalConfigCrypto.ts` (+test); `UpsertFiscalConfigUseCase.ts`; decrypt em Emit/Retry/Cancel/TestConnection.
- **Aceite**: sensíveis (`certificadoBase64/Senha`, `cscToken`, `activationCode`, `signatureAC`) cifrados com sentinela `enc:v1:`; legado texto-plano passa direto; sem dupla-cifra; provider decifra no build. ✔
- **Verificação**: `bun test FiscalConfigCrypto.test.ts` → 6/6; typecheck sem erro novo. ✔
- **Review**: opencode implementou; 2 agentes acharam CRITICAL (reenvio de `***mascarado` sobrescrevia cert) → corrigido em `mergeProviderConfig` (pula `***`); rename `pc`→`providerConfigDecrypted`.
- **⚠️ Follow-up (DRY, rule 16)**: `buildProviderConfig` está duplicado em Emit/Retry/Cancel/Test. Extrair um `buildFiscalProviderConfig(config)` compartilhado — fica para **FISCAL-B2** (quando a lógica de emissão migra pro worker).
- **Pendente**: GET config retornar `hasCertificate` em vez de `***last4` fica para **FISCAL-E3** (UI de config).

---

## Sprint B — Worker + resiliência offline

### FISCAL-B1 ✅ Emit assíncrono (refactor + service)
- 🔗 FISCAL-A2a
- **Arquivos**: novo `FiscalEmissionService.ts` (lógica de emissão centralizada — resolve o DRY da A3); `EmitFiscalDocumentUseCase` agora só valida, cria `pending`, publica emitting e `fiscalQueue.add(EMIT)`.
- **Aceite**: Emit não chama SEFAZ no request; job enfileirado. ✔ (typecheck)
- **Verificação latência/Bull Board**: ⏳ pendente (precisa Redis via `make up`).

### FISCAL-B2 ✅ FiscalEmissionProcessor (worker) + Retry unificado
- 🔗 FISCAL-B1, FISCAL-A3
- **Arquivos**: `application/workers/FiscalEmissionProcessor.ts`; worker instanciado no container sob `FISCAL_WORKER_ENABLED`; SIGTERM/SIGINT no `server.ts` fecha o worker; `RetryFiscalDocumentUseCase` reescrito p/ reenfileirar (−200 linhas de duplicação).
- **Aceite (hardening pós-review de 2 agentes)**:
  - **claim atômico** `UPDATE ... WHERE status='pending'` → exclusão mútua real (sem double-emit em jobs duplicados/concorrência 2).
  - `attemptCount` incrementado com `sql` (atômico, sem lost-update).
  - erro transitório → reset p/ `pending` + throw (re-claima no próximo attempt; nunca fica preso em `emitting`); **sem** WS REJECTED enganoso.
  - esgotou tentativas → `failed`-listener marca `rejected` (RETRIES_EXHAUSTED) + WS.
  - rejeição fatal SEFAZ → `rejected` sem throw (não auto-retenta).
- **Verificação**: `tsc` limpo; lógica CAS revisada. ⏳ **teste ao vivo do worker pendente** (subir Redis: `make up`, então `FISCAL_WORKER_ENABLED=true`, emitir e observar pending→emitting→authorized).
- **⚠️ Follow-ups anotados**: (a) graceful shutdown amplo (uWS listen socket + pool pg + Redis) — hoje só o worker é drenado (antes não havia shutdown algum); (b) checagem `config inativa` triplicada — extrair helper.

### FISCAL-B3 ✅ FiscalSweeper (repeatable job offline) — versão SEGURA
- 🔗 FISCAL-B2
- **Arquivos**: `application/workers/FiscalSweeper.ts`; repeatable job (`FISCAL_SWEEP_INTERVAL_MS`, default 120s); processor trata `SWEEP`; serviço/listener preservam o código de erro real (`extractFiscalErrorCode`).
- **Aceite (revisado por agente — evita NOTA DUPLICADA)**:
  - reenfileira `pending` (nunca enviados) + `rejected` cujo erro é **de conexão** (pré-envio, `SAFE_TO_REEMIT_CODES`) → seguro, sem duplicar.
  - `emitting` preso (crash) → **não** reemite; marca `rejected/NEEDS_REVIEW` (revisão humana) pois pode ter chegado à SEFAZ.
  - **timeout** ambíguo e rejeição fatal SEFAZ → **não** varridos.
  - `orderBy createdAt asc` + `limit 100` (sem starvation); idempotência pelo claim atômico.
- **Verificação**: `tsc` limpo. ⏳ ao vivo pendente (Redis).
- **🚨 GATE DE PRODUÇÃO**: auto-recuperação de casos ambíguos (timeout após a SEFAZ receber) exige **consulta SEFAZ** (por chave/protocolo) antes de reemitir — precisa de suporte na lib. Documentado.

---

## Sprint C — Toggle por-pedido + gatilho configurável

### FISCAL-C1 ✅ Schema toggle + trigger
- **Arquivos**: `schema/orders.ts` (+`fiscal_enabled bool default true`); `schema/fiscal-configurations.ts` (+`emit_trigger` default 'on_payment', +`email_provider` default 'resend'); migration `0004_damp_nightshade.sql`.
- **Aceite**: `drizzle-kit generate` OK; migration = 3 ALTER TABLE ADD COLUMN. ✔ typecheck limpo.
- **Verificação push**: ⏳ pendente (Postgres via `make up`).

### FISCAL-C2 ✅ Gatilho automático no pagamento/conclusão
- 🔗 FISCAL-C1, FISCAL-B1
- **Arquivos**: novo `TriggerFiscalEmissionUseCase.ts` + `FiscalEmissionEnqueue.ts` (helper DRY compartilhado c/ Emit); wiring em `AddCashMovementUseCase` (pagamento) e `UpdateOrderStatusUseCase` (completed); container injeta o trigger; migration `0005` (UNIQUE order_id).
- **Aceite**: dispara só se `order.fiscalEnabled && config.active && config.emitTrigger === evento`; `manual` nunca auto-dispara; **fire-and-forget** (não bloqueia caixa/pedido); nunca duplica. ✔
- **Hardening pós-review**: **UNIQUE(order_id)** em fiscal_documents (mata race SELECT-then-INSERT → nota duplicada); `on_payment` só dispara quando **pago integralmente** (soma dos movimentos ≥ total), não no 1º pagamento parcial.
- **Verificação**: `tsc` — arquivos tocados zero erros (erro em CashierController é pré-existente). ⏳ ao vivo pendente.
- **Follow-up**: manual `EmitFiscalDocumentUseCase` hoje NÃO checa `fiscalEnabled` (override explícito do operador — decisão de design); logging estruturado no lugar de console.error.

---

## Sprint D — Envio ao cliente

### FISCAL-D1 ✅ FiscalDeliveryProvider (interface) + Resend + SMTP
- **Arquivos**: `delivery/FiscalDeliveryProvider.interface.ts` (+`buildFiscalDeliveryMessage/Subject`), `ResendDeliveryProvider.ts`, `SmtpDeliveryProvider.ts`. Deps `resend`, `nodemailer`.
- **Aceite**: envia link `/nota/:token`; escolha por `config.email_provider`; provider não configurado ou falha → `{ok:false,error}` sem lançar. ✔

### FISCAL-D2 ✅ WhatsappN8nDeliveryProvider + DeliverFiscalDocumentUseCase + job 'deliver'
- 🔗 FISCAL-D1, FISCAL-B2
- **Arquivos**: `WhatsappN8nDeliveryProvider.ts` (POST n8n c/ timeout+abort), `DeliverFiscalDocumentUseCase.ts`; schema `delivery_status/delivered_at/delivery_error` (migration 0007); serviço enfileira 'deliver' após authorized (tolerante a falha); processor trata DELIVER.
- **Aceite**: phone→WhatsApp, email→Resend/SMTP conforme config; grava `sent|partial|failed`+`deliveryError`; nunca lança (erro inesperado → grava `failed`).
- **Verificação ao vivo (DB real, 6 asserts)**: seleção de canal, respeito ao emailProvider, partial/failed, no-contact→failed, pending→no-op, erro inesperado→failed sem throw. ✔
- **Review**: 1 agente → blindado enqueue do deliver (não derruba emissão), `execute` try/catch grava failed, status tipado union, DRY do subject. **Follow-up**: re-envio automático é manual (endpoint futuro); n8n deve ser interno/HTTPS.

### FISCAL-D3 ✅ Página pública do cliente (token HMAC) — backend ✅ / frontend ✅
- **Frontend ✅**: `apps/web/src/pages/public/CustomerInvoicePage.tsx` (rota pública `/nota/:token` fora do AuthGuard); mostra nº/série, modelo, valor, chave formatada, link QR SEFAZ, download PDF + XML (via endpoint público). `tsc` limpo.
- 🔗 FISCAL-B2
- **Backend ✅**: `FiscalPublicToken.ts` (HMAC-SHA256 create/verify, constant-time, `FISCAL_PUBLIC_TOKEN_SECRET`) + `GET /public/fiscal/:token` (metadata) e `/xml` (download), sem auth. `findByIdPublic` (sem escopo). 5 testes do token. ✔
- **Hardening pós-review**: só expõe docs `authorized`; **metadata sem o XML** (XML só no endpoint explícito — evita vazar CNPJ/IE/CPF em toda carga); guarda UUID (evita 500). Não vaza establishmentId/erros.
- **Falta**: `apps/web/src/pages/public/CustomerInvoicePage.tsx` (rota pública, PWA-first, QR/chave/downloads) + geração do link (usado no envio D2).
- **Verificação**: `tsc` limpo, token 5/5. ⏳ E2E ao vivo pendente.

---

## Sprint E — Dashboard fiscal + impressão

### FISCAL-E1 ✅ Menu "Notas Fiscais" (dashboard) — listagem com status
- **Arquivos**: `apps/web/src/pages/fiscal/FiscalDocumentsPage.tsx`; rota `/fiscal` em `App.tsx` (RoleGuard admin/manager/cashier); item em `constants/navigation.ts`.
- **Aceite**: tabela responsiva (zebra) de notas vinculadas a pedidos; badge de status colorido (pending/emitting/authorized/rejected/cancelled); **tempo real via WS** (`fiscal:*` invalida a query); filtro multi-status + busca por chave/nº + limpar; ações por status: PDF, XML (download autenticado), Cancelar (justificativa ≥15), Reprocessar. ✔
- **Verificação**: `tsc --noEmit` limpo. ⏳ render ao vivo pendente (precisa stack `make up`).
- **Review**: 1 agente → corrigido **bug real** (download XML sem header de auth → agora fetch+blob autenticado), `disabled` no cancelar, `aria-label`, `onError` nas mutations.
- **⚠️ Follow-up (enhancement web.md §7)**: data-table rico — headers ordenáveis, seleção múltipla/ações em lote, estado na URL. Hoje é lista funcional com filtro local.
- **Nota**: opencode travou 2× nesta task (multi-arquivo e single-file) → página escrita diretamente; wiring à mão.

### FISCAL-E2 ✅ Cupom fiscal + impressão ESC/POS
- 🔗 FISCAL-B2
- **Arquivos**: `printing/PrinterProvider.interface.ts` (+`buildFiscalCupomText` puro/testável), `ThermalPrinterProvider.ts` (`node-thermal-printer`, EPSON, QR, `FISCAL_PRINTER_INTERFACE`), `PrintFiscalCupomUseCase.ts`; endpoint `POST /orders/:orderId/fiscal-document/print` (RBAC orders:write); container.
- **Aceite**: monta cupom (razão social, CNPJ, itens, total, chave, QR) do doc autorizado; só imprime `authorized`; sem impressora configurada → `{ok:false}` (não quebra).
- **Verificação ao vivo (DB real + printer mock)**: builder correto; use-case monta emitente/itens/total do doc+config+pedido; não-autorizado lança. ✔ Provider ESC/POS real precisa de hardware.
- **Falta (UI, menor)**: botão "Imprimir" no dashboard de notas (E1) chamando o endpoint.

### FISCAL-E3 ✅ Toggle "Emitir NF" no CreateOrderModal + config Settings
- 🔗 FISCAL-C1
- **Backend**: UpsertFiscalConfig + zod schema aceitam `emitTrigger`/`emailProvider` (update preserva existente); CreateOrder aceita `fiscalEnabled` (default true).
- **Frontend**: `CreateOrderModal` toggle "Nota Fiscal" agora manda `fiscalEnabled` (removido o hack de notes); `FiscalSettingsPage` ganhou selects de gatilho + provedor de e-mail (upload de certificado **já existia**).
- **Verificação ao vivo (DB real)**: emitTrigger/emailProvider persistem + preservam; order.fiscalEnabled false/true default. ✔ `tsc` web+api limpo.

---

## Ordem de execução (dependências)
```
A1 ─┬─ A3 ─┐
A2 ─┴─ B1 ─┴─ B2 ─┬─ B3
                  ├─ D2 ── (D1)
                  ├─ D3
                  └─ E2
C1 ─ C2 (após B1)
C1 ─ E3
E1 (após B-series p/ dados reais)
```

## Protocolo por task (Claude + opencode + review)
1. Claude passa a task ao opencode: `opencode run "<task>" --dangerously-skip-permissions -c`.
2. 2 agentes de review analisam o diff (correção + aderência às regras Ada).
3. Claude roda `bun run check` + testes e valida o critério; corrige/reprocessa se falhar.
4. Marca ✅ e segue a próxima respeitando dependências.
