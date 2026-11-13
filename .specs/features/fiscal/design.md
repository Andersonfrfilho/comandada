# Módulo Fiscal — Design (Revisão 2026-07)

> Este design é **aditivo**. O backend fiscal já existe e já consome a lib real
> `@adatechnology/fiscal-provider` (comunicação **direta com a SEFAZ**, não Focus NFe).
> Aqui desenhamos apenas o que falta: **worker/fila**, **resiliência offline**,
> **criptografia do certificado**, **toggle por-pedido**, **envio ao cliente**
> (WhatsApp/e-mail/página) e **impressão/cupom**.

---

## 1. Estado atual (não reimplementar)

| Componente | Arquivo | Estado |
|---|---|---|
| Schema `fiscal_configurations` | `apps/api/src/infra/database/schema/fiscal-configurations.ts` | ✅ existe |
| Schema `fiscal_documents` | `.../schema/fiscal-documents.ts` | ✅ existe |
| NCM/CFOP/CST por categoria | `.../schema/categories.ts` + `EmitFiscalDocumentUseCase.buildFiscalItems` | ✅ existe |
| Emissão (ligada à lib real) | `EmitFiscalDocumentUseCase.ts` | ⚠️ existe, mas **fire-and-forget in-process** — migrar p/ worker |
| Cancel / Get / Retry / RetryPending / TestConnection / UpsertConfig | `application/use-cases/*` | ✅ existem |
| FiscalController + Routes | `infra/http/FiscalController.ts`, `FiscalRoutes.ts` | ✅ existem |
| Eventos WS `fiscal:*` | `infra/websocket/WebSocketEvents.ts` | ✅ existem |

### Gaps confirmados
1. **Sem worker/fila** — emissão bloqueia/roda solta no processo da API (`processEmission` fire-and-forget).
2. **Certificado em texto plano** — `UpsertFiscalConfigUseCase` **não** criptografa `providerConfig`.
3. **Sem toggle por-pedido** — não há coluna em `orders` para "emitir NF ou não".
4. **Sem envio ao cliente** — nada de WhatsApp/e-mail/página pública.
5. **Sem resiliência offline** — sem varredura/reenfileiramento quando a internet volta.
6. **Sem impressão ESC/POS / cupom / download PDF-XML no front**.

---

## 2. Decisões de arquitetura

| Decisão | Alternativas | Razão |
|---|---|---|
| **BullMQ sobre o Redis existente** | RabbitMQ; fire-and-forget atual | Redis + `ioredis` já estão no stack; volume baixo/médio; topologia simples → regra `queue-bullmq.md` manda BullMQ. RabbitMQ não existe no projeto. |
| **Worker no mesmo processo da API (start opt-in por env)** | App `apps/worker-*` separado | Deploy único (Railway). `FISCAL_WORKER_ENABLED=true` liga o processor. Extrair p/ app próprio depois é só mover o registro do Worker. |
| **Certificado AES-256-GCM no banco** | Bucket/S3 | Sem infra nova; APP_SECRET já disponível. `iv:authTag:ciphertext` no JSONB. |
| **Resiliência offline = fila + varredura** | Contingência NFC-e offline (DPEC/FS-DA) | Cobrir o caso "internet caiu": documento fica `pending`, job re-tenta com backoff, e um **repeatable job** varre `pending`/`rejected(transitório)` e reenfileira quando a SEFAZ volta. Contingência fiscal formal fica como evolução futura (anotado em STATE). |
| **Toggle por-pedido** | Sempre emitir | Coluna `orders.fiscal_enabled boolean default true` + default vindo da config do establishment. |
| **Envio: provider abstrato multi-canal** | Chamar direto no use-case | `FiscalDeliveryProvider` com implementações WhatsApp (n8n/Meta), Resend, SMTP. Canal escolhido por config. |

---

## 3. Fluxo alvo (com worker + offline)

```
Gatilho (configurável): pagamento registrado no caixa  E/OU  order.status=completed  E/OU  manual
        │  (só se order.fiscal_enabled = true  E  fiscal_config.active)
        ▼
EmitFiscalDocumentUseCase
  - cria fiscal_document status=pending  (NÃO chama a lib aqui)
  - enfileira job em BullMQ  fiscalQueue.add('emit', { fiscalDocumentId })
  - WS fiscal:emitting  →  retorna 202
        ▼
[ BullMQ worker: FiscalEmissionProcessor ]  (opt-in por env)
  - status=emitting  →  createFiscalProvider(config).emit(...)
  - sucesso  → authorized (chave, protocolo, xml, qrCode, danfce) + WS fiscal:authorized
             → enfileira job 'deliver' (WhatsApp/e-mail conforme config)
  - erro transitório (timeout/rede/cStat retryável) → throw → BullMQ retenta (backoff expo)
  - erro fatal (rejeição SEFAZ) → rejected + WS fiscal:rejected  (fica p/ retry manual)
        ▼
[ repeatable job: FiscalSweeper ]  a cada N min
  - reenfileira documents 'pending'/'emitting' presos + 'rejected' por causa transitória
  - efeito: "voltou a internet → reprocessa tudo que precisa emitir"
```

**Idempotência (regra `queue-bullmq.md`):** o processor sempre relê o `fiscal_document`;
se já está `authorized`/`cancelled`, retorna sem reemitir. `chaveAcesso` é `unique` no banco.

---

## 4. Componentes novos

```
apps/api/src/
├── infra/
│   ├── queue/
│   │   ├── redisConnection.ts          # ioredis dedicado (maxRetriesPerRequest:null)
│   │   ├── QueueNames.constant.ts       # FISCAL_QUEUE, jobs EMIT/DELIVER, repeatable SWEEP
│   │   ├── fiscalQueue.ts               # Queue + defaultJobOptions (retenção limitada!)
│   │   └── bullBoard.ts                 # Bull Board protegido por basic auth (env)
│   └── crypto/
│       └── SecretCipher.ts             # AES-256-GCM encrypt/decrypt(APP_SECRET)
├── modules/fiscal/
│   ├── application/
│   │   ├── workers/
│   │   │   ├── FiscalEmissionProcessor.ts   # processa job 'emit' (move lógica de processEmission p/ cá)
│   │   │   └── FiscalSweeper.ts              # varredura/reenfileiramento offline
│   │   ├── use-cases/
│   │   │   ├── EnqueueFiscalEmissionUseCase.ts   # (refactor do Emit: só cria pending + enfileira)
│   │   │   └── DeliverFiscalDocumentUseCase.ts   # envia ao cliente pelos canais configurados
│   │   └── providers/
│   │       ├── FiscalDeliveryProvider.interface.ts
│   │       ├── WhatsappN8nDeliveryProvider.ts
│   │       ├── ResendDeliveryProvider.ts
│   │       └── SmtpDeliveryProvider.ts
│   └── infra/http/  (estender controller/rotas existentes: cupom, público)

apps/web/src/pages/fiscal/
├── FiscalDocumentsPage.tsx             # menu "Notas Fiscais" — lista vinculada a pedidos
└── components/*                        # status, ações (PDF/XML/cupom/reprocessar/cancelar)

apps/web/src/pages/public/
└── CustomerInvoicePage.tsx            # /nota/:token — cliente vê/baixa suas notas
```

---

## 5. Criptografia do certificado (SecretCipher)

- `encrypt(plain): string` → `base64(iv).base64(authTag).base64(ciphertext)` (AES-256-GCM).
- Chave = `scryptSync(APP_SECRET, 'fiscal-cert', 32)`.
- `UpsertFiscalConfigUseCase`: cifrar `certificadoBase64` e `certificadoSenha` antes de gravar.
- Leitura (GET config): **nunca** retornar os campos cifrados — devolver só `hasCertificate: boolean`.
- No worker, `buildProviderConfig` decifra imediatamente antes de `createFiscalProvider`.
- `APP_SECRET` obrigatório no boot (validar no schema de env; falhar cedo se ausente).

---

## 6. Toggle por-pedido + gatilho configurável

- Schema: `orders.fiscal_enabled boolean not null default true` (migration).
- `fiscal_configurations.emit_trigger varchar` ∈ `{ 'on_payment', 'on_completed', 'manual' }` (default `on_payment`).
- `CreateOrderModal`: checkbox "Emitir nota fiscal" (default = config do establishment).
- Ponto de gatilho automático: no use-case que registra pagamento (caixa) e/ou no `UpdateOrderStatus`→completed, chamar `EnqueueFiscalEmissionUseCase` somente se `fiscal_enabled && trigger casa`.

---

## 7. Envio ao cliente (FiscalDeliveryProvider)

Contrato:
```ts
type DeliverParams = {
  readonly document: FiscalDocument
  readonly customer: { phone?: string; email?: string; name?: string }
  readonly config: FiscalConfiguration
}
export type FiscalDeliveryProvider = {
  readonly channel: 'whatsapp' | 'email'
  deliver(params: DeliverParams): Promise<{ ok: boolean; error?: string }>
}
```
- **WhatsApp**: POST no webhook n8n interno (reusa Meta Cloud API já configurada) com link da página pública + cupom DANFCe ASCII.
- **Resend / SMTP**: e-mail com PDF/XML anexos (ou link) — escolha via `fiscal_config.emailProvider`.
- Falha de envio **não** invalida a nota: registra `deliveryStatus`/`deliveryError` no documento e é retentável.

## 8. Página pública do cliente

- Rota API pública `GET /public/fiscal/:token` (token assinado HMAC, sem auth de usuário).
- Retorna metadados + links `/public/fiscal/:token/pdf` e `/xml`.
- `CustomerInvoicePage.tsx`: PWA-first (regra do projeto), mostra QR code, chave, botões download.

---

## 9. Observabilidade e retenção (regra queue-bullmq.md — obrigatório)

- **Bull Board** em porta própria, basic auth por env — nunca no domínio público.
- `defaultJobOptions` com limites explícitos (falhas vivem mais que sucessos):
  ```ts
  removeOnComplete: { age: 7*24*3600, count: 2000 }   // nota fiscal = auditoria
  removeOnFail:     { age: 30*24*3600, count: 2000 }
  ```
- Conexão `ioredis` dedicada ao BullMQ com `maxRetriesPerRequest: null`.
- Graceful shutdown: `worker.close()` no SIGTERM antes de derrubar.

---

## 10. Env novas (validar no schema de env, falhar cedo)

```
APP_SECRET                     # AES-256 do certificado (obrigatório)
FISCAL_WORKER_ENABLED=true     # liga o processor no processo
REDIS_URL                      # já deve existir p/ ioredis
FISCAL_SWEEP_INTERVAL_MS=120000
BULLBOARD_USER / BULLBOARD_PASS
FISCAL_PUBLIC_TOKEN_SECRET     # HMAC dos links públicos
RESEND_API_KEY                 # se emailProvider=resend
SMTP_URL                       # se emailProvider=smtp
N8N_FISCAL_WEBHOOK_URL         # envio WhatsApp via n8n
```
