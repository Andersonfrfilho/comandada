# Budibase — Setup Guide

## 1. Deploy no Railway

Add Service → Docker Image → `budibase/budibase`

Variáveis de ambiente obrigatórias:
```
BB_ADMIN_USER_EMAIL=admin@seudominio.com
BB_ADMIN_USER_PASSWORD=senha-forte-aqui
JWT_SECRET=string-aleatoria-longa
ENCRYPTION_KEY=string-aleatoria-longa
```

Após subir, acesse o painel e crie a conta admin.

---

## 2. Conectar PostgreSQL

Settings → Data → Add Data Source → PostgreSQL

```
Host:     host-railway.railway.internal
Port:     5432
Database: railway
User:     postgres
Password: <sua senha>
```

Fetch tables → seleciona todas → Save.

---

## 3. Auto-gerar screens (cobre 80% do trabalho)

Para cada tabela abaixo:  
**Design → Screens → Add Screen → Auto-generated screens → seleciona a tabela**

| Tabela | Tipo de screen | Para quem |
|---|---|---|
| `establishments` | List + Form | Admin |
| `products` | List + Form | Admin |
| `categories` | List + Form | Admin |
| `payment_types` | List + Form | Admin |
| `order_types` | List + Form | Admin |
| `delivery_fee_rules` | List + Form | Admin |
| `faq` | List + Form | Admin |
| `order_status_notifications` | List + Form | Admin |
| `customers` | List (read-only) | Admin |
| `orders` | List | Admin |
| `promotions` | List + Form | Admin |

Após gerar, **remova o botão Delete** nas telas de `customers` e `orders` (use soft-delete pelo campo `deleted_at` quando necessário).

---

## 4. Tela de Pedidos — Admin (personalizar o auto-gerado)

Tela: `orders / List`

**Adicionar filtros rápidos (Chips no topo):**
- Status = received → "Novos"
- Status = confirmed / preparing → "Em preparo"
- Status = out_for_delivery → "Em entrega"
- Status = delivered → "Entregues"

**Colunas visíveis na tabela:**
`code` · `status` · `order_type` · `total` · `customer_phone` · `created_at`

**Botão de ação por linha:**  
Dropdown → update `status` para o próximo estágio:

| Status atual | Botão | Próximo status |
|---|---|---|
| received | ✅ Confirmar | confirmed |
| confirmed | 👨‍🍳 Iniciar preparo | preparing |
| preparing | 📦 Pronto | ready |
| ready (delivery) | 🛵 Saiu | out_for_delivery |
| ready / out_for_delivery | ✅ Entregue | delivered |

Como criar o botão de update:
1. Add component → Button
2. On click → Execute query → custom SQL:
```sql
UPDATE orders SET status = 'confirmed', updated_at = now()
WHERE id = {{ "orders.List"._id }}
```
3. After query → Refresh data

---

## 5. Tela KDS — Cozinha (manual — Kanban)

**Design → Screens → Add Screen → Blank**  
Nome: `KDS Cozinha`  
URL: `/cozinha`

### 5.1 Fonte de dados

Add component → **Table / Kanban** → Data: `orders`

Filter (automático):
```
status  não é  delivered
status  não é  cancelled
deleted_at  está vazio
```

Ordena por `created_at` ASC (pedidos mais antigos primeiro).

### 5.2 Configurar Kanban

- **Category field:** `status`
- **Colunas visíveis** (remova delivered/cancelled da view):
  - `received` → "🔔 Novos"
  - `confirmed` → "✅ Confirmados"  
  - `preparing` → "👨‍🍳 Em preparo"
  - `ready` → "📦 Prontos"
  - `out_for_delivery` → "🛵 Em entrega"

### 5.3 Card de pedido

Title binding:
```
{{ "Pedido #" + orders.code }}
```

Description binding:
```
{{ orders.order_type + " · R$ " + orders.total }}
```

Footer binding (itens):
```
{{ JSON.stringify(orders.items).substring(0, 80) + "..." }}
```

### 5.4 Botão de avançar status no card

Add button → "Avançar →"

On click → Execute query:
```sql
UPDATE orders
SET status = CASE status
  WHEN 'received'         THEN 'confirmed'
  WHEN 'confirmed'        THEN 'preparing'
  WHEN 'preparing'        THEN 'ready'
  WHEN 'ready'            THEN 'out_for_delivery'
  WHEN 'out_for_delivery' THEN 'delivered'
  ELSE status
END,
updated_at = now()
WHERE id = {{ orders._id }}
```

After query → Refresh data source.

### 5.5 Auto-refresh (pedidos novos aparecem automaticamente)

Settings do data source → **Auto-refresh:** 15 seconds

---

## 6. Automação — Webhook para atualizar KDS em tempo real

(Opcional — complementa o auto-refresh)

Automation → Add Automation → "Pedido Novo"  
Trigger: **Webhook**  
Action: **Update Row** → tabela `orders` → atualiza `updated_at = now()`  
(força o Budibase a refletir a mudança nas telas abertas)

URL do webhook gerado pelo Budibase:  
`https://budibase.railway.app/api/automations/webhook/...`

Configure no n8n, no nó que salva o pedido:  
Add node → HTTP Request → POST para a URL acima  
Body: `{ "orderId": "{{ $json.id }}" }`

---

## 7. Roles e permissões

Settings → Access → Roles

| Role | Acesso |
|---|---|
| `Admin` | Todas as telas |
| `Cozinha` | Somente `/cozinha` (KDS) |

Para criar usuário da cozinha:  
Settings → Users → Invite → atribui role `Cozinha`

A URL `/cozinha` pode ficar aberta em um tablet ou monitor dedicado.

---

## 8. Filtro por establishment_id (multi-tenant)

Quando tiver múltiplos estabelecimentos, adicione filtro global em cada screen:

Data source filter:
```
establishment_id  igual a  {{ Current User.establishment_id }}
```

Para isso, adicione `establishment_id` como campo no perfil do usuário Budibase  
(Settings → User metadata → Add field → `establishment_id` → UUID).

Atribua o UUID correto ao criar cada usuário operador.

---

## Checklist de setup (ordem)

- [ ] Deploy Budibase no Railway com env vars
- [ ] Conectar PostgreSQL
- [ ] Auto-gerar screens das tabelas (passo 3)
- [ ] Personalizar tela de pedidos admin (passo 4)
- [ ] Criar tela KDS cozinha (passo 5)
- [ ] Configurar roles (passo 7)
- [ ] Criar usuário cozinha e testar KDS
- [ ] (Opcional) Ligar webhook n8n → Budibase (passo 6)
