# Objetivo

Projetar e implementar um sistema completo de gestão de pedidos para restaurante/pesqueiro, contemplando backend, frontend web administrativo e painéis operacionais em tempo real.

# Stack Obrigatória

## Backend

- TypeScript
- Bun
- uWebSockets.js
- PostgreSQL
- Drizzle ORM
- Redis
- JWT
- Clean Architecture
- Arquitetura Modular
- SOLID
- Repository Pattern

## Frontend

- React
- TypeScript
- Vite
- TanStack Query
- Zustand
- TailwindCSS
- WebSocket para atualização em tempo real

# Arquitetura

Organizar o sistema por módulos de negócio.

Exemplo:

src/
├── shared/
├── modules/
│ ├── auth/
│ ├── users/
│ ├── roles/
│ ├── customers/
│ ├── products/
│ ├── categories/
│ ├── orders/
│ ├── tables/
│ ├── delivery/
│ ├── kitchen/
│ ├── cashier/
│ ├── reports/
│ ├── dashboard/
│ └── settings/

# Perfis de Usuário

Implementar RBAC.

Perfis mínimos:

- Administrador
- Gerente
- Caixa
- Cozinha
- Entregador
- Atendente

Cada perfil deve visualizar apenas os recursos autorizados.

# Painel Administrativo

Permitir:

- Gestão de usuários
- Gestão de produtos
- Gestão de categorias
- Gestão de clientes
- Gestão de entregadores
- Gestão de mesas
- Gestão de pedidos
- Configurações gerais
- Relatórios
- Dashboard gerencial

# Painel da Cozinha

Interface otimizada para tela touch.

Funcionalidades:

- Receber pedidos em tempo real
- Agrupar por status
- Agrupar por prioridade
- Marcar como:
  - Recebido
  - Em preparo
  - Finalizado

- Exibir tempo de preparo
- Alertas de atraso
- Impressão de comandas
- Atualização automática via WebSocket

# Painel de Entrega

Funcionalidades:

- Lista de pedidos prontos
- Atribuição de entregador
- Controle de rota
- Alteração de status:
  - Aguardando entrega
  - Saiu para entrega
  - Entregue
  - Não entregue

- Histórico de entregas
- Geolocalização opcional

# Painel do Caixa

Funcionalidades:

- Abrir caixa
- Fechar caixa
- Registrar pagamentos
- Pix
- Cartão
- Dinheiro
- Vale
- Estorno
- Sangria
- Suprimento
- Fluxo de caixa diário

# Gestão de Pedidos

Fluxo:

Novo Pedido
↓
Recebido
↓
Em Produção
↓
Pronto
↓
Em Entrega
↓
Finalizado

Permitir:

- Cancelamento
- Reabertura
- Histórico completo
- Auditoria

# Dashboard Gerencial

Exibir:

- Vendas do dia
- Vendas do mês
- Ticket médio
- Produtos mais vendidos
- Pedidos por hora
- Entregas realizadas
- Tempo médio de preparo
- Tempo médio de entrega
- Faturamento por período

# Banco de Dados

Gerar modelagem completa contendo:

- Users
- Roles
- Permissions
- Customers
- Addresses
- Products
- Categories
- Orders
- OrderItems
- Payments
- Deliveries
- CashRegisters
- CashMovements
- Tables
- Settings

# Tempo Real

Toda alteração deve ser propagada instantaneamente através de WebSocket para:

- Cozinha
- Caixa
- Entrega
- Dashboard

# Entregáveis

Gerar:

1. Modelagem completa do banco
2. Estrutura de pastas
3. APIs
4. DTOs
5. Casos de uso
6. Frontend completo
7. Telas
8. Componentes
9. Fluxos
10. Controle de permissões
11. Testes
12. Docker Compose
13. CI/CD
14. Documentação técnica

# Resultado Esperado

O sistema deve estar pronto para produção, suportando múltiplas unidades, múltiplos usuários simultâneos e atualização em tempo real de todos os painéis.
