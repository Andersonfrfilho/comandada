# Módulo Fiscal — Especificação Completa

> ## ⚠️ Revisão 2026-07 (leia primeiro — corrige premissas desatualizadas)
>
> **Provedor mudou.** O texto original abaixo assume **Focus NFe** (provedor terceiro).
> A realidade é a lib própria **`@adatechnology/fiscal-provider`**, que fala **direto com a
> SEFAZ** (NFC-e/NF-e/SAT/NFS-e). Onde o texto disser "Focus NFe", leia "lib direto-SEFAZ".
> O backend já está integrado a ela. Detalhes de arquitetura nova em `design.md`; execução em `tasks.md`.
>
> **Novos requisitos desta revisão (com IDs):**
> - **FISCAL-05 — Worker/fila (BullMQ):** emissão assíncrona via BullMQ sobre o Redis existente
>   (regra `queue-bullmq.md`), não fire-and-forget in-process.
> - **FISCAL-06 — Resiliência offline:** sem internet, o documento fica `pending` e é
>   **reprocessado automaticamente** quando a conexão volta (job com backoff + varredura periódica).
> - **FISCAL-07 — Certificado cifrado (AES-256-GCM):** `.pfx` + senha gravados **criptografados**
>   no banco; GET nunca vaza o certificado (só `hasCertificate`).
> - **FISCAL-08 — Toggle por-pedido + gatilho configurável:** `orders.fiscal_enabled`; gatilho
>   ∈ {pagamento, conclusão, manual} por establishment. NF só quando **pago/confirmado** e toggle on.
> - **FISCAL-09 — Envio ao cliente multi-canal:** WhatsApp (n8n/Meta), e-mail (Resend **ou** SMTP),
>   e **página pública** `/nota/:token` (link assinado HMAC, sem login).
> - **FISCAL-10 — Dashboard fiscal:** menu "Notas Fiscais" com notas vinculadas a pedidos,
>   status em tempo real, e ações PDF/XML/cupom/reprocessar/cancelar (padrão data-table `web.md §7`).
> - **FISCAL-11 — Impressão/cupom:** cupom fiscal ESC/POS + download PDF/XML no front (DANFCe já vem da lib).
> - **FISCAL-12 — Reprocessamento:** notas rejeitadas por causa transitória são reprocessáveis
>   (manual no dashboard + automático pela varredura).

## Problem Statement

O sistema emite pedidos e processa pagamentos mas não tem integração fiscal.
Restaurantes brasileiros são obrigados por lei a emitir documento fiscal a cada venda.
Cada estado usa um modelo diferente: **SAT-CF-e** (SP obrigatório desde 2015),
**NFC-e** (demais estados, maioria via SEFAZ estadual).

O sistema é multi-tenant — cada establishment pode estar em um estado diferente
e ter suas próprias credenciais fiscais. A arquitetura deve suportar ambos os
modelos sem alteração de código, apenas de configuração.

---

## Decisões Arquiteturais

| Decisão | Alternativas descartadas | Razão |
|---|---|---|
| Strategy pattern para SAT vs NFC-e | Switch/case em use case | Novos modelos (MFe, CF-e) são apenas novos providers |
| Emissão via provedor terceiro (Focus NFe) | Integrar direto SEFAZ | SEFAZ tem 27 endpoints diferentes, certificados, contingência — provedor já resolve tudo |
| SAT-CF-e chamado via HTTP local | Biblioteca nativa | SAT expõe API HTTP padrão; funciona sem driver proprietário |
| `fiscal_configurations` separada de `establishments` | JSONB em establishments.settings | Credenciais sensíveis merecem tabela própria com controle de acesso |
| Emissão assíncrona (queue) | Síncrona no request | SEFAZ pode demorar 3-8s — não pode bloquear o operador |

---

## Modelos Fiscais Suportados

### SAT-CF-e (São Paulo + MG, PE parcial)
- Equipamento físico SAT conectado ao servidor local (USB ou rede)
- Expõe API HTTP local: `POST http://localhost:59590/SAT/ComunicarUnsignedSaleData`
- Retorna XML assinado pelo equipamento — sem necessidade de certificado digital próprio
- Fabricantes suportados: Gertec, Elgin, Bematech/Totvs, VeriFone
- **Custo**: equipamento R$800–1.500 (compra única) + taxa SEFAZ ~R$3/mês

### NFC-e (demais estados — SP também aceita)
- Emitida diretamente na SEFAZ estadual via provedor terceiro (Focus NFe, NFe.io, Plugnotas)
- Requer certificado digital A1 (.pfx) do CNPJ do estabelecimento
- Retorna XML + DANFE (PDF) + QR Code
- **Custo**: certificado A1 ~R$150/ano + mensalidade provedor R$50–150/mês

### Provider Recomendado para NFC-e: Focus NFe
- REST API simples, bem documentada, sandbox gratuito
- Suporte a todos os 27 estados
- Homologação rápida (~1-2 dias após cadastro)
- Endpoint: `POST https://api.focusnfe.com.br/v2/nfce`

---

## Schema do Banco de Dados

### fiscal_configurations (por establishment)

```ts
// apps/api/src/infra/database/schema/fiscal-configurations.ts
import { pgTable, uuid, varchar, text, jsonb, boolean, timestamp } from 'drizzle-orm/pg-core'
import { fiscalModelEnum } from './enums'
import { establishments } from './establishments'

export const fiscalConfigurations = pgTable('fiscal_configurations', {
  id: uuid('id').primaryKey().defaultRandom(),
  establishmentId: uuid('establishment_id')
    .notNull()
    .unique()
    .references(() => establishments.id, { onDelete: 'cascade' }),

  // Modelo: 'sat' | 'nfce' | 'none'
  model: fiscalModelEnum('model').notNull().default('none'),

  // Dados do estabelecimento (CNPJ, IE, endereço fiscal)
  cnpj: varchar('cnpj', { length: 18 }),
  inscricaoEstadual: varchar('inscricao_estadual', { length: 50 }),
  razaoSocial: varchar('razao_social', { length: 255 }),
  uf: varchar('uf', { length: 2 }),
  municipio: varchar('municipio', { length: 100 }),
  cep: varchar('cep', { length: 9 }),
  logradouro: text('logradouro'),
  numero: varchar('numero', { length: 20 }),
  complemento: varchar('complemento', { length: 100 }),
  bairro: varchar('bairro', { length: 100 }),
  crt: varchar('crt', { length: 1 }).default('1'), // 1=Simples, 2=Lucro Presumido, 3=Normal

  // Configuração específica por modelo (credenciais criptografadas)
  // SAT: { satUrl, activationCode, signatureAC }
  // NFC-e: { focusNfeToken, ambiente, serie, numeroInicial, certificadoBase64, certificadoSenha }
  providerConfig: jsonb('provider_config').default({}),

  // Ambiente: 'homologacao' | 'producao'
  environment: varchar('environment', { length: 20 }).notNull().default('homologacao'),

  active: boolean('active').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export type FiscalConfiguration = typeof fiscalConfigurations.$inferSelect
export type NewFiscalConfiguration = typeof fiscalConfigurations.$inferInsert
```

### fiscal_documents (um por pedido emitido)

```ts
// apps/api/src/infra/database/schema/fiscal-documents.ts
import { pgTable, uuid, varchar, text, numeric, integer, timestamp, jsonb } from 'drizzle-orm/pg-core'
import { fiscalDocumentStatusEnum, fiscalModelEnum } from './enums'
import { establishments } from './establishments'
import { orders } from './orders'

export const fiscalDocuments = pgTable('fiscal_documents', {
  id: uuid('id').primaryKey().defaultRandom(),
  establishmentId: uuid('establishment_id')
    .notNull()
    .references(() => establishments.id, { onDelete: 'cascade' }),
  orderId: uuid('order_id')
    .notNull()
    .references(() => orders.id, { onDelete: 'restrict' }),

  model: fiscalModelEnum('model').notNull(), // sat | nfce

  // Status do ciclo de vida
  status: fiscalDocumentStatusEnum('status').notNull().default('pending'),
  // pending → emitting → authorized | rejected | cancelled

  // Dados do documento fiscal
  numeroDocumento: integer('numero_documento'),
  serie: varchar('serie', { length: 5 }),
  chaveAcesso: varchar('chave_acesso', { length: 44 }).unique(),
  protocolo: varchar('protocolo', { length: 50 }),

  // Valores
  totalBruto: numeric('total_bruto', { precision: 10, scale: 2 }),
  totalDesconto: numeric('total_desconto', { precision: 10, scale: 2 }).default('0'),
  totalLiquido: numeric('total_liquido', { precision: 10, scale: 2 }),

  // Artefatos
  xmlAutorizado: text('xml_autorizado'),
  qrCodeUrl: text('qr_code_url'),
  danfePdfUrl: text('danfe_pdf_url'),  // apenas NFC-e

  // Cancelamento
  cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
  cancellationReason: text('cancellation_reason'),
  cancellationProtocol: varchar('cancellation_protocol', { length: 50 }),

  // Resposta bruta do provider (para debug/reprocessamento)
  providerResponse: jsonb('provider_response').default({}),

  // Erro em caso de rejeição
  errorCode: varchar('error_code', { length: 10 }),
  errorMessage: text('error_message'),

  // Tentativas de emissão (para retry)
  attemptCount: integer('attempt_count').notNull().default(0),
  lastAttemptAt: timestamp('last_attempt_at', { withTimezone: true }),

  authorizedAt: timestamp('authorized_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export type FiscalDocument = typeof fiscalDocuments.$inferSelect
export type NewFiscalDocument = typeof fiscalDocuments.$inferInsert
```

### Novos enums a adicionar em `enums.ts`

```ts
export const fiscalModelEnum = pgEnum('fiscal_model', ['sat', 'nfce', 'none'])

export const fiscalDocumentStatusEnum = pgEnum('fiscal_document_status', [
  'pending',
  'emitting',
  'authorized',
  'rejected',
  'cancelled',
])
```

---

## Arquitetura do Módulo

```
modules/fiscal/
├── application/
│   ├── use-cases/
│   │   ├── EmitFiscalDocumentUseCase.ts       ← dispara emissão (cria doc pending → emitting)
│   │   ├── ProcessFiscalCallbackUseCase.ts    ← atualiza status quando provider responde
│   │   ├── CancelFiscalDocumentUseCase.ts     ← cancela NF dentro do prazo (30min NFC-e)
│   │   ├── GetFiscalDocumentUseCase.ts        ← busca doc por orderId
│   │   └── UpsertFiscalConfigUseCase.ts       ← salva config do establishment
│   └── providers/
│       ├── FiscalProvider.interface.ts        ← contrato comum
│       ├── sat/
│       │   ├── SatProvider.ts                 ← chama API HTTP local do SAT
│       │   └── sat.types.ts
│       └── nfce/
│           ├── FocusNfeProvider.ts            ← chama Focus NFe REST API
│           └── nfce.types.ts
├── domain/
│   ├── entities/
│   │   ├── FiscalDocument.ts
│   │   └── FiscalConfiguration.ts
│   └── repositories/
│       ├── FiscalDocumentRepository.ts
│       └── FiscalConfigurationRepository.ts
└── infra/
    ├── http/
    │   ├── FiscalController.ts
    │   └── FiscalRoutes.ts
    └── repositories/
        ├── DrizzleFiscalDocumentRepository.ts
        └── DrizzleFiscalConfigurationRepository.ts
```

---

## Interface do Provider Fiscal

```ts
// application/providers/FiscalProvider.interface.ts

type FiscalItem = {
  readonly codigo: string
  readonly descricao: string
  readonly ncm: string           // código NCM do produto (ex: '21069090' para alimentos)
  readonly cfop: string          // código CFOP (ex: '5102' venda dentro do estado)
  readonly cst: string           // tributação (ex: '40' — isento; '60' — subst. trib.)
  readonly quantidade: number
  readonly valorUnitario: number
  readonly valorTotal: number
}

type FiscalPayment = {
  readonly method: 'pix' | 'card_credit' | 'card_debit' | 'cash' | 'voucher'
  readonly amount: number
}

type EmitFiscalParams = {
  readonly orderId: string
  readonly items: FiscalItem[]
  readonly payments: FiscalPayment[]
  readonly totalAmount: number
  readonly discountAmount: number
  readonly customerCpf?: string   // opcional — identificar consumidor na NF
  readonly config: FiscalConfiguration
}

type FiscalResult = {
  readonly success: boolean
  readonly chaveAcesso?: string
  readonly protocolo?: string
  readonly numeroDocumento?: number
  readonly serie?: string
  readonly xmlAutorizado?: string
  readonly qrCodeUrl?: string
  readonly danfePdfUrl?: string
  readonly errorCode?: string
  readonly errorMessage?: string
  readonly rawResponse: unknown
}

type CancelFiscalParams = {
  readonly chaveAcesso: string
  readonly justificativa: string  // min 15 chars
  readonly config: FiscalConfiguration
}

export type FiscalProvider = {
  emit(params: EmitFiscalParams): Promise<FiscalResult>
  cancel(params: CancelFiscalParams): Promise<FiscalResult>
}
```

---

## Fluxo de Emissão

```
Operador clica "Emitir NF" no painel (OrdersPage ou CashierPage)
    ↓
POST /orders/:orderId/fiscal-document
    ↓
EmitFiscalDocumentUseCase
  1. Valida: order existe, é deste establishment, status = completed
  2. Valida: fiscal_document não existe ainda para este order
  3. Carrega fiscal_configuration do establishment
  4. Valida: model != 'none', active = true
  5. Busca order_items do pedido (produto, qtd, preço)
  6. Mapeia itens para FiscalItem[] (NCM, CFOP, CST por categoria)
  7. Cria fiscal_document com status = 'pending'
  8. Publica evento WS: fiscal:emitting para o painel
  9. Chama provider.emit() de forma ASSÍNCRONA (não bloqueia resposta HTTP)
 10. Retorna 202 Accepted com { fiscalDocumentId }

Callback do provider (ou polling interno):
 11. Atualiza fiscal_document: status = authorized | rejected
 12. Salva chaveAcesso, xml, qrCodeUrl, danfePdfUrl
 13. Publica evento WS: fiscal:authorized ou fiscal:rejected
 14. Painel atualiza automaticamente via WebSocket
```

---

## Endpoints da API

```
POST   /orders/:orderId/fiscal-document          → emite NF do pedido
GET    /orders/:orderId/fiscal-document          → busca NF do pedido
POST   /fiscal-documents/:id/cancel              → cancela NF (prazo 30min)
GET    /fiscal-documents/:id/pdf                 → redireciona para DANFE PDF
GET    /fiscal-documents/:id/xml                 → download XML assinado

GET    /fiscal-config                            → busca config do establishment
PUT    /fiscal-config                            → salva/atualiza config
POST   /fiscal-config/test                       → testa conexão com SAT ou Focus NFe
```

**RBAC:**
- Emitir NF: roles `admin`, `cashier`
- Cancelar NF: role `admin` apenas
- Configurar: role `admin` apenas

---

## Integração SAT-CF-e (São Paulo)

### Requisito de infraestrutura
O equipamento SAT fica fisicamente no estabelecimento, conectado via USB ou rede local.
O servidor (Railway/VPS) não consegue alcançar o SAT diretamente se estiver em nuvem.

**Solução:** Agent local (lightweight Bun process rodando no Windows/Linux da loja):
```
SAT device ←USB→ Windows da loja ←→ sat-agent (Bun) ←HTTPS→ Order Hub API (Railway)
```

O sat-agent faz polling de `GET /sat-queue/:establishmentId` e responde com resultado.

### Alternativa mais simples
Se a loja tem um servidor local (Raspberry Pi, mini-PC), rodar a API do Order Hub localmente
e o SAT se conecta direto. Neste cenário, `satUrl = http://localhost:59590`.

### Payload SAT (CF-e XML resumido)
```xml
<CFe>
  <infCFe versaoDadosEnt="0.08">
    <ide>
      <CNPJ><!-- CNPJ do emissor --></CNPJ>
      <signAC><!-- Assinatura AC do fabricante --></signAC>
      <numeroCaixa>001</numeroCaixa>
    </ide>
    <emit>
      <CNPJ><!-- CNPJ do estabelecimento --></CNPJ>
      <IE><!-- Inscrição Estadual --></IE>
    </emit>
    <det itemNot="1">
      <prod>
        <cProd>001</cProd>
        <xProd>Combo Temaki Salmão</xProd>
        <NCM>21069090</NCM>
        <CFOP>5102</CFOP>
        <uCom>UN</uCom>
        <qCom>1.0000</qCom>
        <vUnCom>45.00</vUnCom>
      </prod>
    </det>
    <total/>
    <pgto>
      <MP>
        <cMP>03</cMP><!-- 01=dinheiro, 03=cartão, 17=pix -->
        <vMP>45.00</vMP>
      </MP>
    </pgto>
  </infCFe>
</CFe>
```

### Mapeamento de pagamento SAT (cMP)
| Sistema | cMP SAT |
|---|---|
| `cash` | `01` |
| `card_credit` | `03` |
| `card_debit` | `04` |
| `pix` | `17` |
| `voucher` | `05` |

---

## Integração NFC-e via Focus NFe

### Autenticação
```
Authorization: Basic base64(token:)
```
Usar o token do ambiente homologação primeiro. Nunca commitar token.

### Payload de emissão
```json
{
  "natureza_operacao": "Venda ao consumidor",
  "forma_pagamento": 0,
  "serie": "001",
  "tipo_documento": 1,
  "local_destino": 1,
  "consumidor_final": 1,
  "presenca_comprador": 2,
  "emitente": {
    "cnpj": "XX.XXX.XXX/0001-XX",
    "nome_razao_social": "Sakura Restaurante LTDA",
    "inscricao_estadual": "XXXXXXXX",
    "regime_tributario": 1
  },
  "items": [
    {
      "numero_item": 1,
      "codigo_produto": "001",
      "descricao": "Combo Temaki Salmão",
      "codigo_ncm": "21069090",
      "cfop": "5102",
      "unidade_comercial": "UN",
      "quantidade_comercial": 1.0,
      "valor_unitario_comercial": 45.00,
      "valor_bruto": 45.00,
      "icms_situacao_tributaria": "40",
      "pis_situacao_tributaria": "07",
      "cofins_situacao_tributaria": "07"
    }
  ],
  "formas_pagamento": [
    {
      "forma_pagamento": "17",
      "valor_pagamento": 45.00
    }
  ]
}
```

### Mapeamento de pagamento NFC-e (forma_pagamento)
| Sistema | Focus NFe |
|---|---|
| `cash` | `"01"` |
| `card_credit` | `"03"` |
| `card_debit` | `"04"` |
| `pix` | `"17"` |
| `voucher` | `"05"` |

### Resposta de sucesso
```json
{
  "status": "autorizado",
  "chave_nfe": "35240112345678000100650010000000011000000014",
  "numero": 1,
  "serie": "001",
  "caminho_xml_nota_fiscal": "/notas/xml/chave.xml",
  "caminho_danfe": "/notas/pdf/chave.pdf",
  "qrcode_url": "https://www.sefaz.sp.gov.br/nfce/..."
}
```

---

## Configuração de NCM e CFOP por Categoria

O NCM (Nomenclatura Comum do Mercosul) e CFOP variam por tipo de produto.
Para restaurantes, os mais comuns:

| Tipo de produto | NCM | CFOP (dentro estado) | CST ICMS (Simples) |
|---|---|---|---|
| Alimentos preparados | 21069090 | 5102 | 400 |
| Bebidas não alcoólicas | 22021000 | 5102 | 400 |
| Bebidas alcoólicas | 22030000 | 5102 | 010 |
| Delivery (serviço) | 21069090 | 5102 | 400 |

**Regra prática:** Simples Nacional com alimentação → CST 40/400 (isento) é o mais comum.
**Atenção:** NCM/CFOP são responsabilidade do contador do estabelecimento — o sistema
deve permitir configurar por categoria de produto, não hardcodar.

### Schema para configurar NCM por categoria

Adicionar campos na tabela `categories` (já existe no Drizzle):
```ts
ncmCode: varchar('ncm_code', { length: 8 }).default('21069090'),
cfopCode: varchar('cfop_code', { length: 4 }).default('5102'),
cstIcms: varchar('cst_icms', { length: 3 }).default('400'),
```

---

## Nota por Venda (campo `notes`)

O campo `notes` já existe em `orders` (schema e banco).
Falta apenas o UI — não requer migração.

### O que falta (frontend):
1. **`CreateOrderModal.tsx`**: adicionar `<textarea>` para `notes` na criação
2. **`OrdersPage.tsx`**: exibir `notes` no card do pedido (já renderiza mas não edita)
3. **`OrdersPage.tsx`**: botão "Editar nota" → PATCH `/orders/:id` com `{ notes }`

### O que falta (backend):
- `PATCH /orders/:id` já existe em `UpdateOrderStatusUseCase` — verificar se aceita `notes`
- Se não aceitar, adicionar `UpdateOrderNotesUseCase` ou estender o existente

---

## WebSocket Events

Novos eventos a adicionar em `WebSocketEvents.ts`:

```ts
'fiscal:emitting'    // emissão iniciada — UI mostra spinner
'fiscal:authorized'  // NF autorizada — UI mostra chave + botão PDF
'fiscal:rejected'    // NF rejeitada — UI mostra erro + código SEFAZ
'fiscal:cancelled'   // NF cancelada
```

---

## Impressão (ESC/POS)

Impressora térmica comum (não fiscal) para imprimir o cupom da NFC-e/SAT.
Bibliotecas recomendadas para Bun/Node:

| Biblioteca | Stars | Bun compat |
|---|---|---|
| `node-thermal-printer` | 1.2k | Sim |
| `escpos` | 1.8k | Parcial (polyfills) |
| `@point-of-sale/escpos-printer` | 300 | Sim |

**Recomendada: `node-thermal-printer`**

### O que imprimir:
1. **Cupom interno da cozinha**: pedido sem dados fiscais (já previsto no backlog)
2. **Cupom fiscal para o cliente**: CNPJ do emitente, itens, total, QR Code da NF, chave de acesso

### Integração com sistema
```
POST /orders/:orderId/fiscal-document/print
→ Busca XML/PDF da NF autorizada
→ Gera ESC/POS com QR Code
→ Envia para impressora via TCP ou USB
```

---

## User Stories

### FISCAL-01: Configurar modelo fiscal do estabelecimento

**User Story**: Como admin, quero configurar qual modelo fiscal meu estabelecimento usa (SAT ou NFC-e) e inserir as credenciais.

**Acceptance Criteria**:
1. WHEN admin acessa Configurações → Fiscal THEN sistema SHALL exibir formulário com campos: modelo, CNPJ, Razão Social, UF, IE, CRT, e campos específicos do modelo (token Focus NFe OU URL do SAT)
2. WHEN admin clica "Testar conexão" THEN sistema SHALL tentar se comunicar com o provider e retornar status OK/ERRO em ≤ 5s
3. WHEN admin salva config com ambiente = homologacao THEN sistema SHALL emitir NF apenas contra SEFAZ de homologação
4. WHEN admin muda ambiente de homologacao para producao THEN sistema SHALL exigir confirmação explícita

---

### FISCAL-02: Emitir NF de um pedido concluído

**User Story**: Como caixa ou admin, quero emitir a nota fiscal de um pedido após o pagamento.

**Acceptance Criteria**:
1. WHEN pedido está com status `completed` THEN painel de pedidos SHALL exibir botão "Emitir NF"
2. WHEN caixa clica "Emitir NF" THEN sistema SHALL criar fiscal_document com status `pending` e responder 202 em ≤ 500ms
3. WHEN emissão é processada pelo provider THEN painel SHALL atualizar status via WebSocket sem reload
4. WHEN NF é autorizada THEN sistema SHALL exibir: chave de acesso (44 dígitos), QR Code, link para PDF (NFC-e) ou botão "Imprimir"
5. WHEN NF é rejeitada THEN sistema SHALL exibir código do erro SEFAZ e mensagem legível
6. WHEN pedido já tem NF emitida THEN sistema SHALL NÃO permitir segunda emissão (retornar 409)

---

### FISCAL-03: Cancelar NF dentro do prazo

**User Story**: Como admin, quero cancelar uma NF emitida por engano.

**Acceptance Criteria**:
1. WHEN NF está autorizada há menos de 30 minutos THEN admin SHALL ver botão "Cancelar NF"
2. WHEN admin confirma cancelamento THEN sistema SHALL exigir justificativa (mínimo 15 caracteres)
3. WHEN cancelamento é autorizado pela SEFAZ THEN sistema SHALL atualizar status para `cancelled` e registrar protocolo
4. WHEN NF foi emitida há mais de 30 minutos THEN botão SHALL não ser exibido e texto SHALL explicar que prazo expirou

---

### FISCAL-04: Adicionar nota/observação a um pedido

**User Story**: Como operador, quero registrar uma observação interna ou preferência do cliente no pedido.

**Acceptance Criteria**:
1. WHEN operador cria pedido THEN formulário SHALL incluir campo "Observação" (textarea, opcional, max 500 chars)
2. WHEN pedido tem nota THEN todos os painéis (Pedidos, Cozinha, Entrega) SHALL exibir a nota em destaque
3. WHEN operador clica "Editar nota" em pedido existente THEN sistema SHALL permitir atualização via PATCH e confirmar com 200

---

## Estimativa de Esforço

| Task | Backend | Frontend | Total |
|---|---|---|---|
| F01: Schema fiscal_configurations + fiscal_documents | 2h | — | 2h |
| F02: FiscalProvider interface + FocusNfeProvider | 4h | — | 4h |
| F03: EmitFiscalDocumentUseCase | 3h | — | 3h |
| F04: ProcessFiscalCallbackUseCase + WS events | 2h | — | 2h |
| F05: CancelFiscalDocumentUseCase | 2h | — | 2h |
| F06: FiscalController + Routes | 2h | — | 2h |
| F07: UpsertFiscalConfigUseCase | 1h | — | 1h |
| F08: SatProvider (para SP) | 4h | — | 4h |
| F09: UI SettingsPage → aba Fiscal | — | 3h | 3h |
| F10: UI OrdersPage → botão Emitir NF + status | — | 3h | 3h |
| F11: UI CashierPage → histórico de NFs | — | 2h | 2h |
| F12: Campo notes no CreateOrderModal | — | 1h | 1h |
| F13: Campo notes editável no OrdersPage | — | 1h | 1h |
| F14: Impressão ESC/POS (cupom fiscal) | 3h | 1h | 4h |
| F15: NCM/CFOP por categoria (CatalogPage) | 1h | 2h | 3h |
| **TOTAL** | **24h** | **13h** | **37h** |

### Ordem de implementação sugerida (MVP fiscal)

**Sprint 1 (backend + NFC-e):**
F01 → F02 → F03 → F04 → F05 → F06 → F07

**Sprint 2 (frontend NFC-e):**
F09 → F10 → F11 → F12 → F13

**Sprint 3 (SAT + impressão):**
F08 → F14 → F15

---

## Pré-requisitos para iniciar

- [ ] Definir estado/UF do(s) estabelecimento(s)
- [ ] Cadastrar conta no Focus NFe (sandbox gratuito: app.focusnfe.com.br)
- [ ] Ter certificado digital A1 do CNPJ do estabelecimento (para NFC-e produção)
- [ ] Confirmar com contador: NCM dos produtos principais, regime tributário (Simples/Lucro Presumido), CFOP aplicável
- [ ] Para SAT: ter equipamento SAT homologado e número de série para ativação
