# Order Hub — Especificação Completa

## Problem Statement

Pedidos chegam via WhatsApp no sakura-bot (Meta Cloud API → n8n) mas não existe
uma camada operacional estruturada. Cozinha não sabe o que preparar, caixa não controla
pagamentos, entrega não sabe o que sair — tudo no n8n como dados crus. Este sistema
transforma esses dados em painéis operacionais em tempo real.

## Goals

- [ ] Receber pedidos do WhatsApp com latência < 500ms end-to-end (webhook → painel cozinha)
- [ ] Todos os painéis sincronizados em tempo real via WebSocket
- [ ] RBAC: cada perfil age apenas no escopo autorizado
- [ ] Multi-tenant: dados isolados por establishment

## Out of Scope

| Feature | Reason |
|---------|--------|
| App mobile nativo | Pós-v1 |
| iFood / Rappi | Adapter preparado, não implementado no v1 |
| Geolocalização real-time de entregadores | Pós-v1 |
| Impressão de comandas (driver ESC/POS) | Interface preparada, driver não incluído |
| Estoque / inventário | Fora do escopo de pedidos |
| Reservas | Feature flag na CLAUDE.md, pós-v1 |

---

## User Stories

### P1 — AUTH-01: Login e RBAC ⭐ MVP

**User Story**: Como operador, quero fazer login com email/senha e ver apenas os painéis do meu perfil.

**Acceptance Criteria**:
1. WHEN usuário envia email+senha válidos THEN sistema SHALL retornar `accessToken` (15min) + `refreshToken` (7d)
2. WHEN `accessToken` expira THEN sistema SHALL renovar via `refreshToken` silenciosamente no cliente
3. WHEN usuário tenta acessar rota não autorizada pelo seu role THEN sistema SHALL retornar 403
4. WHEN usuário faz logout THEN sistema SHALL invalidar refreshToken no Redis

**Independent Test**: Criar usuário com role `kitchen`, fazer login, confirmar que rota `/admin/users` retorna 403.

---

### P1 — WEBOOK-01: Receber pedido do WhatsApp ⭐ MVP

**User Story**: Como sistema, quero receber POST do n8n com dados de pedido WhatsApp e criar o Order.

**Acceptance Criteria**:
1. WHEN n8n faz POST em `/webhooks/whatsapp` com payload válido THEN sistema SHALL criar Order com status `received` e retornar 200
2. WHEN payload tem `whatsapp_number` de customer desconhecido THEN sistema SHALL criar Customer automaticamente
3. WHEN Order é criado THEN sistema SHALL emitir evento WebSocket `order:new` para o establishment
4. WHEN payload é inválido/malformado THEN sistema SHALL retornar 400 com detalhes do erro
5. WHEN `establishment_id` não existe THEN sistema SHALL retornar 404

**Independent Test**: Simular POST do n8n, verificar Order criado no banco + evento WS recebido em cliente conectado.

---

### P1 — ORDER-01: Fluxo de status do pedido ⭐ MVP

**User Story**: Como operador, quero ver o pedido mudar de status em tempo real em qualquer painel.

**Acceptance Criteria**:
1. WHEN status muda THEN sistema SHALL emitir `order:status_changed` via WebSocket para todos os painéis do establishment
2. WHEN cozinha marca como `in_production` THEN sistema SHALL registrar timestamp de início de preparo
3. WHEN cozinha marca como `ready` THEN sistema SHALL notificar painel de entrega automaticamente
4. WHEN entrega marca como `delivered` THEN sistema SHALL mover Order para `completed`
5. WHEN Order é cancelado THEN sistema SHALL registrar motivo e manter histórico

**Fluxo de status válido:**
```
received → in_production → ready → in_delivery → completed
                                  ↘ picked_up (retirada)
Any state → cancelled
```

**Independent Test**: Criar order, mudar status via API, verificar evento WS e timestamps no banco.

---

### P1 — KITCHEN-01: Painel da Cozinha ⭐ MVP

**User Story**: Como cozinheiro, quero ver a fila de pedidos em tempo real numa interface touch.

**Acceptance Criteria**:
1. WHEN cozinheiro abre o painel THEN sistema SHALL exibir orders com status `received` e `in_production`
2. WHEN novo pedido chega via WebSocket THEN sistema SHALL adicionar card na fila sem reload
3. WHEN cozinheiro toca em "Iniciar" THEN sistema SHALL mover order para `in_production` e exibir timer
4. WHEN preparo ultrapassa SLA definido em settings THEN sistema SHALL destacar card em vermelho
5. WHEN cozinheiro toca em "Pronto" THEN sistema SHALL mover para `ready` e remover da fila da cozinha

**Independent Test**: Abrir painel cozinha, criar order via webhook, confirmar aparição imediata do card.

---

### P1 — CASHIER-01: Abertura e fechamento de caixa ⭐ MVP

**User Story**: Como caixeiro, quero abrir e fechar o caixa diário com controle de movimentos.

**Acceptance Criteria**:
1. WHEN caixeiro abre o caixa com valor inicial THEN sistema SHALL criar `CashRegister` com status `open`
2. WHEN há caixa aberto THEN sistema SHALL permitir registrar pagamentos (Pix, cartão, dinheiro, vale)
3. WHEN caixeiro registra sangria/suprimento THEN sistema SHALL criar `CashMovement` correspondente
4. WHEN caixeiro fecha o caixa THEN sistema SHALL calcular saldo final e criar relatório do período
5. WHEN já existe caixa aberto no mesmo turno THEN sistema SHALL impedir abertura duplicada

**Independent Test**: Abrir caixa, registrar 3 pagamentos, fazer sangria, fechar — verificar saldo calculado.

---

### P1 — DELIVERY-01: Painel de entrega ⭐ MVP

**User Story**: Como operador de entrega, quero atribuir entregadores e rastrear status das entregas.

**Acceptance Criteria**:
1. WHEN order muda para `ready` THEN sistema SHALL aparecer automaticamente na lista de "Aguardando Entrega"
2. WHEN operador atribui entregador THEN sistema SHALL criar `Delivery` e mover order para `in_delivery`
3. WHEN entregador marca como "Saiu para entrega" THEN sistema SHALL registrar timestamp de saída
4. WHEN entregador marca como "Entregue" THEN sistema SHALL mover order para `completed`
5. WHEN entregador marca como "Não entregue" THEN sistema SHALL criar nova tentativa ou devolver para fila

**Independent Test**: Order em `ready`, atribuir entregador, seguir fluxo até `completed`.

---

### P2 — DASHBOARD-01: Dashboard gerencial

**User Story**: Como gerente, quero ver as métricas do dia e do mês em um dashboard.

**Acceptance Criteria**:
1. WHEN gerente abre dashboard THEN sistema SHALL exibir: vendas do dia, ticket médio, pedidos por hora
2. WHEN período é alterado THEN sistema SHALL recalcular todas as métricas
3. WHEN dashboard está aberto THEN sistema SHALL atualizar contadores em tempo real via WebSocket

---

### P2 — ADMIN-01: Gestão de usuários e permissões

**User Story**: Como administrador, quero criar usuários e atribuir roles.

**Acceptance Criteria**:
1. WHEN admin cria usuário THEN sistema SHALL enviar email com senha temporária
2. WHEN admin altera role de usuário THEN sistema SHALL invalidar tokens ativos do usuário
3. WHEN admin desativa usuário THEN sistema SHALL revogar todos os tokens

---

### P2 — PRODUCTS-01: Gestão de produtos e categorias

**User Story**: Como administrador/gerente, quero gerenciar o cardápio.

**Acceptance Criteria**:
1. WHEN produto é criado/editado THEN sistema SHALL atualizar cache Redis
2. WHEN produto é desativado THEN sistema SHALL não aparecer em novos pedidos
3. WHEN webhook WhatsApp referencia produto por nome THEN sistema SHALL fazer match por slug normalizado

---

### P3 — REPORTS-01: Relatórios por período

**User Story**: Como gerente, quero exportar relatórios de vendas e entregas.

**Acceptance Criteria**:
1. WHEN gerente solicita relatório THEN sistema SHALL gerar CSV com vendas, pagamentos e entregas do período
2. WHEN período tem dados THEN sistema SHALL incluir breakdown por produto, categoria e canal

---

---

### P1 — SEC-01: Proteção contra brute force no login ⭐ MVP

**User Story**: Como sistema, quero limitar tentativas de login para evitar ataques de força bruta.

**Acceptance Criteria**:
1. WHEN mesmo IP tenta login mais de 10 vezes em 5 minutos THEN sistema SHALL retornar 429 com `retry_after`
2. WHEN mesmo email falha login 5 vezes consecutivas THEN sistema SHALL bloquear o account por 15 minutos
3. WHEN account está bloqueado e usuário tenta login THEN sistema SHALL retornar 423 com tempo restante
4. WHEN bloqueio expira THEN sistema SHALL resetar contador automaticamente

**Independent Test**: Simular 6 logins falhos para mesmo email, verificar 423 na 7ª tentativa.

---

### P1 — SEC-02: Isolamento de dados entre establishments (anti-IDOR) ⭐ MVP

**User Story**: Como sistema, quero garantir que nenhum usuário acesse dados de outro establishment.

**Acceptance Criteria**:
1. WHEN usuário autenticado do establishment A solicita `GET /orders/:id` de um order do establishment B THEN sistema SHALL retornar 404 (não 403 — não confirmar existência)
2. WHEN qualquer query é executada THEN sistema SHALL aplicar filtro `establishment_id = request.user.establishmentId` automaticamente via middleware
3. WHEN usuário tenta conectar WebSocket a room de outro establishment THEN sistema SHALL fechar conexão com código 4003
4. WHEN webhook chega sem `establishment_id` válido na rota THEN sistema SHALL retornar 404

**Independent Test**: Criar orders para establishment A e B, autenticar como usuário de A, confirmar que `GET /orders/:id_do_B` retorna 404.

---

### P1 — SEC-03: Autenticação do WebSocket por mensagem ⭐ MVP

**User Story**: Como sistema, quero autenticar conexões WebSocket sem expor tokens em URLs.

**Acceptance Criteria**:
1. WHEN cliente conecta em `/ws` THEN sistema SHALL aceitar a conexão sem token na URL
2. WHEN cliente não envia mensagem `{ type: "auth", token: "..." }` em até 5 segundos THEN sistema SHALL fechar a conexão com código 4001
3. WHEN token na mensagem auth é inválido/expirado THEN sistema SHALL fechar conexão com código 4002
4. WHEN autenticação é bem-sucedida THEN sistema SHALL enviar `{ type: "auth:ok", establishmentId }` e adicionar socket ao room correto

**Independent Test**: Conectar WS sem enviar auth em 5s, verificar fechamento automático da conexão.

---

### P1 — SEC-04: CORS restrito ⭐ MVP

**User Story**: Como sistema, quero que apenas origens autorizadas possam fazer requests à API.

**Acceptance Criteria**:
1. WHEN request chega de origem não listada em `ALLOWED_ORIGINS` THEN sistema SHALL retornar 403 com header `Access-Control-Allow-Origin` ausente
2. WHEN request preflight OPTIONS chega de origem permitida THEN sistema SHALL responder com headers CORS corretos
3. WHEN `ALLOWED_ORIGINS` não está configurado THEN sistema SHALL falhar ao iniciar (não usar `*` como fallback)

**Independent Test**: Fazer request da origem `http://evil.com`, verificar ausência do header CORS.

---

### P1 — SEC-05: HTTPS obrigatório em produção ⭐ MVP

**User Story**: Como sistema, quero que todo tráfego em produção seja criptografado.

**Acceptance Criteria**:
1. WHEN `NODE_ENV=production` e request chega por HTTP THEN sistema SHALL redirecionar para HTTPS (301)
2. WHEN response é enviada THEN sistema SHALL incluir `Strict-Transport-Security: max-age=31536000`
3. WHEN Docker Compose produção sobe THEN deverá ter TLS terminado no proxy (Traefik/Nginx) ou serviço cloud

**Independent Test**: Em produção, fazer request HTTP, verificar redirect 301 para HTTPS.

---

### P1 — SEC-06: Audit trail para operações financeiras ⭐ MVP

**User Story**: Como administrador, quero rastrear todas as operações do caixa com identidade do operador.

**Acceptance Criteria**:
1. WHEN qualquer `CashMovement` é criado THEN sistema SHALL registrar: `user_id`, `timestamp`, `ip_address`, `action_type`
2. WHEN caixa é aberto ou fechado THEN sistema SHALL registrar evento em tabela `audit_logs` imutável (sem UPDATE/DELETE permitido na tabela)
3. WHEN admin consulta audit log THEN sistema SHALL retornar histórico completo com identidade do operador
4. WHEN audit log é consultado THEN sistema SHALL exigir role `admin` ou `manager`

**Independent Test**: Abrir caixa, registrar pagamento, consultar `GET /audit/cash/:registerId`, verificar entradas com user_id.

---

### P1 — SEC-07: Assinatura HMAC no webhook ⭐ MVP

**User Story**: Como sistema, quero verificar que webhooks são genuinamente do n8n autorizado.

**Acceptance Criteria**:
1. WHEN webhook chega THEN sistema SHALL verificar header `X-Webhook-Signature: sha256=HMAC(secret, body)` usando `crypto.timingSafeEqual()`
2. WHEN assinatura é inválida THEN sistema SHALL retornar 401 e registrar tentativa em log
3. WHEN header de assinatura está ausente THEN sistema SHALL retornar 401
4. WHEN mesma assinatura é usada duas vezes (replay attack) THEN sistema SHALL rejeitar — nonce de 5 minutos no Redis

**Independent Test**: Enviar request com assinatura inválida, verificar 401 e entrada no log de segurança.

---

### P1 — SEC-08: Rate limiting global ⭐ MVP

**User Story**: Como sistema, quero limitar requisições por IP para evitar abuso.

**Acceptance Criteria**:
1. WHEN IP faz mais de 100 requests/minuto para qualquer rota autenticada THEN sistema SHALL retornar 429
2. WHEN IP faz mais de 20 requests/minuto para `/auth/login` THEN sistema SHALL retornar 429
3. WHEN IP faz mais de 10 requests/minuto para `/webhooks/*` THEN sistema SHALL retornar 429
4. WHEN rate limit é atingido THEN response SHALL incluir `Retry-After` header
5. WHEN IP está bloqueado por rate limit THEN sistema SHALL contar no Redis com TTL de 1 minuto

**Independent Test**: Simular 101 requests em 1 minuto, verificar 429 no 101º.

---

### P1 — SEC-09: Security headers HTTP ⭐ MVP

**User Story**: Como sistema, quero que todas as respostas incluam headers de segurança padrão.

**Acceptance Criteria**:
1. WHEN qualquer response é enviada THEN SHALL incluir: `X-Content-Type-Options: nosniff`
2. WHEN qualquer response é enviada THEN SHALL incluir: `X-Frame-Options: DENY`
3. WHEN qualquer response é enviada THEN SHALL incluir: `Content-Security-Policy: default-src 'none'` (para a API — não aplica ao frontend)
4. WHEN response de erro é enviada THEN SHALL NÃO incluir stack traces ou detalhes internos

**Independent Test**: Curl qualquer endpoint, verificar presença dos headers de segurança.

---

### P2 — SEC-10: Rotação de refresh token

**User Story**: Como sistema, quero rotacionar refresh tokens a cada uso para detectar vazamentos.

**Acceptance Criteria**:
1. WHEN `POST /auth/refresh` é chamado com refreshToken válido THEN sistema SHALL emitir novo refreshToken e invalidar o anterior
2. WHEN refreshToken já usado é apresentado novamente THEN sistema SHALL invalidar TODA a família de tokens do usuário e retornar 401
3. WHEN família de tokens é invalidada THEN sistema SHALL logar evento de segurança com user_id e IP

**Independent Test**: Usar refreshToken, tentar reusar o mesmo token, verificar 401 e invalidação da sessão.

---

### P2 — SEC-11: Respostas de erro não revelam estrutura interna

**Acceptance Criteria**:
1. WHEN acesso é negado por falta de permissão THEN sistema SHALL retornar apenas `{ error: 'forbidden' }` — sem campo `required`
2. WHEN recurso não existe OU usuário não tem acesso THEN sistema SHALL retornar 404 (não distinguir entre "não existe" e "não autorizado")
3. WHEN erro interno ocorre THEN sistema SHALL logar detalhes internamente mas retornar apenas `{ error: 'internal_error', requestId }` para o cliente

---

### P2 — SEC-12: Sanitização de CSV para prevenção de fórmula injection

**Acceptance Criteria**:
1. WHEN relatório CSV é gerado THEN sistema SHALL prefixar com `'` qualquer cell que comece com `=`, `+`, `-`, `@`
2. WHEN nome de produto/cliente começa com esses caracteres THEN sistema SHALL sanitizar antes de serializar no CSV

---

### P2 — SEC-13: Política de senha

**Acceptance Criteria**:
1. WHEN usuário define senha THEN sistema SHALL exigir mínimo 8 caracteres
2. WHEN senha contém apenas letras ou apenas números THEN sistema SHALL rejeitar (exigir mix)
3. WHEN senha temporária é gerada THEN sistema SHALL forçar troca no primeiro login
4. WHEN usuário tenta reusar senha atual THEN sistema SHALL rejeitar

---

### P2 — SEC-16: Política de logging sem dados sensíveis

**Acceptance Criteria**:
1. WHEN sistema loga requests THEN SHALL NÃO incluir: Authorization header, senha, número de cartão, valor de pagamento completo
2. WHEN webhook é recebido THEN SHALL logar apenas: `establishment_id`, `message_id`, `timestamp` — não o payload completo
3. WHEN erro ocorre THEN sistema SHALL logar stack trace internamente com `requestId` mas retornar apenas o `requestId` ao cliente

---

## Edge Cases

- WHEN webhook duplicado (mesmo `whatsapp_message_id`) THEN sistema SHALL ignorar e retornar 200 (idempotente)
- WHEN WebSocket cliente desconecta e reconecta THEN sistema SHALL re-enviar estado atual do painel
- WHEN banco PostgreSQL está inacessível THEN sistema SHALL retornar 503 com retry-after
- WHEN order cancelado tenta mudar status THEN sistema SHALL retornar 422 com mensagem clara
- WHEN caixa está fechado e tenta registrar pagamento THEN sistema SHALL retornar 409

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
|----------------|-------|-------|--------|
| AUTH-01 | P1: Login e RBAC | Design | Pending |
| AUTH-02 | P1: Refresh token | Design | Pending |
| AUTH-03 | P1: Role guard middleware | Design | Pending |
| WEBHOOK-01 | P1: Receber pedido WA | Design | Pending |
| WEBHOOK-02 | P1: Create customer auto | Design | Pending |
| WEBHOOK-03 | P1: Idempotência | Design | Pending |
| ORDER-01 | P1: Status flow | Design | Pending |
| ORDER-02 | P1: WebSocket broadcast | Design | Pending |
| ORDER-03 | P1: Timestamps por etapa | Design | Pending |
| KITCHEN-01 | P1: Fila em tempo real | Design | Pending |
| KITCHEN-02 | P1: SLA alert | Design | Pending |
| CASHIER-01 | P1: Abertura/fechamento | Design | Pending |
| CASHIER-02 | P1: Pagamentos | Design | Pending |
| CASHIER-03 | P1: Sangria/suprimento | Design | Pending |
| DELIVERY-01 | P1: Fila entrega | Design | Pending |
| DELIVERY-02 | P1: Atribuição entregador | Design | Pending |
| DELIVERY-03 | P1: Status entrega | Design | Pending |
| DASHBOARD-01 | P2: Métricas dia/mês | - | Pending |
| ADMIN-01 | P2: Gestão usuários | - | Pending |
| PRODUCTS-01 | P2: Gestão cardápio | - | Pending |
| REPORTS-01 | P3: Exportação CSV | - | Pending |
| SEC-01 | P1: Brute force login | Design | Pending |
| SEC-02 | P1: Isolamento cross-tenant (IDOR) | Design | Pending |
| SEC-03 | P1: WebSocket auth por mensagem | Design | Pending |
| SEC-04 | P1: CORS restrito | Design | Pending |
| SEC-05 | P1: HTTPS em produção | Design | Pending |
| SEC-06 | P1: Audit trail financeiro | Design | Pending |
| SEC-07 | P1: HMAC + replay protection webhook | Design | Pending |
| SEC-08 | P1: Rate limiting global | Design | Pending |
| SEC-09 | P1: Security headers | Design | Pending |
| SEC-10 | P2: Refresh token rotation | - | Pending |
| SEC-11 | P2: Error responses não revelam internos | - | Pending |
| SEC-12 | P2: CSV formula injection | - | Pending |
| SEC-13 | P2: Política de senha | - | Pending |
| SEC-16 | P2: Logging sem dados sensíveis | - | Pending |

**Coverage:** 34 total, 26 mapeados P1, 8 P2/P3

---

## Success Criteria

- [ ] Pedido enviado via WhatsApp aparece no painel da cozinha em < 2s
- [ ] Nenhum painel exige reload manual para ver atualizações
- [ ] Usuário com role `kitchen` consegue fazer apenas o que o perfil permite
- [ ] Caixa abre, registra pagamentos e fecha sem inconsistência de saldo
- [ ] Sistema suporta 2+ establishments com dados completamente isolados
