# Guia de Configuração

Todas as configurações do bot vivem na tabela `settings` do banco de dados. Edite pelo **Adminer** (`http://localhost:8070`) ou por SQL — a mudança entra na próxima mensagem, sem restart.

## Tabela `settings`

| Chave | Tipo | Descrição | Exemplo |
|---|---|---|---|
| `establishment_name` | texto | Nome exibido nas mensagens | `Sakura Restaurante` |
| `establishment_city` | texto | Cidade do estabelecimento (usada no geocoding) | `São Paulo, SP` |
| `establishment_lat` | decimal | Latitude do estabelecimento | `-23.5505` |
| `establishment_lng` | decimal | Longitude do estabelecimento | `-46.6333` |
| `opening_time` | HH:MM | Horário de abertura | `18:00` |
| `closing_time` | HH:MM | Horário de fechamento | `23:00` |
| `working_days` | texto | Dias de funcionamento separados por vírgula | `ter,qua,qui,sex,sab,dom` |
| `welcome_message` | texto | Primeira mensagem ao cliente | `Olá! Bem-vindo ao Sakura 🌸` |
| `closed_message` | texto | Mensagem quando fechado | `Estamos fechados agora.` |
| `min_order_value` | decimal | Valor mínimo de pedido em reais | `30` |
| `prep_time_minutes` | inteiro | Tempo médio de preparo em minutos | `30` |
| `evolution_api_key` | texto | API key da Evolution API | _(valor do .env)_ |
| `ignore_business_hours` | boolean | `true` ignora horário (usar em dev) | `false` |

---

## Feature Flags

Definidas no arquivo `infra/.env`. Controlam quais fluxos ficam ativos:

| Variável | Padrão | Efeito |
|---|---|---|
| `FEATURE_DELIVERY` | `true` | Habilita fluxo de entrega |
| `FEATURE_RETIRADA` | `true` | Habilita opção de retirada |
| `FEATURE_RESERVAS` | `false` | Habilita reservas de mesa |
| `FEATURE_PEDIDO_MESA` | `false` | Habilita pedido via WhatsApp para mesas do local |

---

## Formas de Pagamento

Configuradas na tabela `payment_types`. Cada linha representa uma forma de pagamento disponível.

```sql
-- Exemplo: PIX, cartão de débito e dinheiro
INSERT INTO payment_types (name, label, active) VALUES
  ('pix',     '💳 PIX',                true),
  ('debito',  '💳 Cartão de Débito',   true),
  ('dinheiro','💵 Dinheiro',           true);
```

| Coluna | Descrição |
|---|---|
| `name` | Identificador interno (sem espaços) |
| `label` | Texto exibido para o cliente |
| `active` | `true` = disponível |

### Divisão de pagamento entre pessoas

Automático — quando há 2 ou mais formas de pagamento, o cliente pode escolher "👥 Dividir entre pessoas", informar quantas pessoas são e cada uma paga a sua parte.

### Pagamento misto (parte PIX + parte dinheiro)

Automático quando há pelo menos uma forma não-dinheiro. O cliente escolha "💰 Pagamento misto", informa o valor em cartão/PIX e o restante é em dinheiro.

Veja [`pagamento.md`](pagamento.md) para detalhes do fluxo.

---

## Taxa de Entrega

Configurada na tabela `delivery_fee_rules`. Há cinco modos:

| Modo | Descrição |
|---|---|
| `fixed` | Taxa fixa independente da distância |
| `per_km` | Taxa base + valor por km |
| `per_route_min` | Taxa base + valor por minuto de rota |
| `zones_km` | Zonas por distância em km (tabela `delivery_fee_zones`) |
| `zones_min` | Zonas por tempo de rota em minutos (tabela `delivery_fee_zones`) |

Veja [`taxa-entrega.md`](taxa-entrega.md) para exemplos detalhados.

---

## Cardápio / Produtos

Tabela `menu_items`. Colunas principais:

| Coluna | Descrição |
|---|---|
| `category` | Categoria do item (ex: `Entradas`, `Pratos`, `Bebidas`) |
| `name` | Nome do produto/serviço |
| `description` | Descrição exibida ao cliente |
| `price` | Preço em reais |
| `active` | `true` = disponível para venda |

Para atualizar preços ou desativar itens: Adminer → tabela `menu_items` → editar linha.

---

## FAQ

Tabela `faq`. Novas entradas entram imediatamente, sem restart.

| Coluna | Descrição |
|---|---|
| `category` | Categoria (ex: `Entrega`, `Cardápio`, `Pagamento`) |
| `question` | Pergunta |
| `answer` | Resposta |
| `keywords` | Palavras-chave separadas por vírgula |
| `active` | `true` = ativa |

A view `pending_questions` lista perguntas frequentes ainda sem resposta na FAQ.

---

## Reservas de Mesa

Requer `FEATURE_RESERVAS=true` no `.env`.

Tabela `tables` — cadastro das mesas físicas:

```sql
INSERT INTO tables (number, capacity, active) VALUES
  (1, 2, true),
  (2, 4, true),
  (3, 6, true);
```

O bot verifica disponibilidade em tempo real antes de confirmar a reserva (cruza com reservas pendentes e confirmadas na data/hora solicitada).

---

## Regras da IA

O arquivo `dados/processos.md` é injetado como contexto do modelo de IA (Groq/Llama). Edite-o para:
- Mudar horários de funcionamento na resposta da IA
- Atualizar áreas de entrega
- Adicionar instruções sobre alergênicos, promoções, políticas
- Definir quando transferir para atendente humano

A transferência para atendimento humano é feita pelo próprio Order Hub Web (`/conversations`), que
recebe o pedido de handoff do n8n (nós "Filtrar Handoff Humano" → "Solicitar Atendimento Humano" em
`n8n/workflows/01-receber-mensagem.json`) e registra/loga toda a conversa nas tabelas
`conversation_sessions`/`conversation_messages` do `apps/api`.
