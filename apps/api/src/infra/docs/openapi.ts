import type { OpenAPIV3_1 } from 'openapi-types'

export function generateOpenAPISpec(): OpenAPIV3_1.Document {
  return {
    openapi: '3.1.0',
    info: {
      title: 'Order Hub API',
      description: 'API REST + WebSocket para gerenciamento de pedidos de restaurantes integrada ao WhatsApp Bot.',
      version: '0.0.1',
      contact: {
        name: 'Sakura Bot',
      },
    },
    servers: [
      {
        url: 'http://localhost:3333',
        description: 'Local development',
      },
    ],
    tags: [
      { name: 'Health', description: 'Health check' },
      { name: 'Auth', description: 'Autenticação e sessão' },
      { name: 'Orders', description: 'Pedidos' },
      { name: 'Kitchen', description: 'Fila da cozinha' },
      { name: 'Delivery', description: 'Fila de entregas' },
      { name: 'Cashier', description: 'Caixa e movimentações' },
      { name: 'Dashboard', description: 'Métricas do painel' },
      { name: 'Reports', description: 'Relatórios e exportações' },
      { name: 'Settings', description: 'Configurações' },
      { name: 'Webhook', description: 'Webhooks (WhatsApp)' },
    ],
    paths: {
      '/health': {
        get: {
          tags: ['Health'],
          summary: 'Health check',
          operationId: 'healthCheck',
          responses: {
            '200': {
              description: 'API está saudável',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      status: { type: 'string', example: 'ok' },
                      timestamp: { type: 'string', format: 'date-time' },
                      env: { type: 'string', example: 'development' },
                    },
                  },
                },
              },
            },
          },
        },
      },

      // ─── Auth ───────────────────────────────────────────
      '/auth/login': {
        post: {
          tags: ['Auth'],
          summary: 'Login',
          operationId: 'login',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['email', 'password'],
                  properties: {
                    email: { type: 'string', format: 'email' },
                    password: { type: 'string', minLength: 1 },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Login realizado com sucesso',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      accessToken: { type: 'string' },
                      refreshToken: { type: 'string' },
                      user: { $ref: '#/components/schemas/AuthenticatedUser' },
                    },
                  },
                },
              },
            },
            '401': { $ref: '#/components/responses/Unauthorized' },
          },
        },
      },

      '/auth/refresh': {
        post: {
          tags: ['Auth'],
          summary: 'Renovar token de acesso',
          operationId: 'refreshToken',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['refreshToken'],
                  properties: {
                    refreshToken: { type: 'string', minLength: 1 },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Token renovado',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      accessToken: { type: 'string' },
                      refreshToken: { type: 'string' },
                    },
                  },
                },
              },
            },
            '401': { $ref: '#/components/responses/Unauthorized' },
          },
        },
      },

      '/auth/logout': {
        post: {
          tags: ['Auth'],
          summary: 'Logout (invalida refresh token)',
          operationId: 'logout',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['refreshToken'],
                  properties: {
                    refreshToken: { type: 'string', minLength: 1 },
                  },
                },
              },
            },
          },
          responses: {
            '200': { description: 'Logout realizado' },
            '401': { $ref: '#/components/responses/Unauthorized' },
          },
        },
      },

      '/auth/me': {
        get: {
          tags: ['Auth'],
          summary: 'Dados do usuário autenticado',
          operationId: 'getMe',
          security: [{ bearerAuth: [] }],
          responses: {
            '200': {
              description: 'Dados do usuário',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      user: { $ref: '#/components/schemas/AuthenticatedUser' },
                    },
                  },
                },
              },
            },
            '401': { $ref: '#/components/responses/Unauthorized' },
          },
        },
      },

      // ─── Orders ─────────────────────────────────────────
      '/orders': {
        get: {
          tags: ['Orders'],
          summary: 'Listar pedidos',
          operationId: 'listOrders',
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: 'page',
              in: 'query',
              schema: { type: 'integer', default: 1 },
            },
            {
              name: 'pageSize',
              in: 'query',
              schema: { type: 'integer', default: 20 },
            },
            {
              name: 'status',
              in: 'query',
              schema: { $ref: '#/components/schemas/OrderStatus' },
            },
            {
              name: 'type',
              in: 'query',
              schema: { $ref: '#/components/schemas/OrderType' },
            },
            {
              name: 'channel',
              in: 'query',
              schema: { $ref: '#/components/schemas/OrderChannel' },
            },
            {
              name: 'from',
              in: 'query',
              schema: { type: 'string', format: 'date' },
            },
            {
              name: 'to',
              in: 'query',
              schema: { type: 'string', format: 'date' },
            },
          ],
          responses: {
            '200': {
              description: 'Lista paginada de pedidos',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      data: {
                        type: 'array',
                        items: { $ref: '#/components/schemas/Order' },
                      },
                      total: { type: 'integer' },
                      page: { type: 'integer' },
                      pageSize: { type: 'integer' },
                      totalPages: { type: 'integer' },
                    },
                  },
                },
              },
            },
            '401': { $ref: '#/components/responses/Unauthorized' },
            '403': { $ref: '#/components/responses/Forbidden' },
          },
        },
        post: {
          tags: ['Orders'],
          summary: 'Criar pedido',
          operationId: 'createOrder',
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['channel', 'type', 'items'],
                  properties: {
                    customerId: { type: 'string', format: 'uuid' },
                    tableId: { type: 'string', format: 'uuid' },
                    channel: { $ref: '#/components/schemas/OrderChannel' },
                    type: { $ref: '#/components/schemas/OrderType' },
                    items: {
                      type: 'array',
                      minItems: 1,
                      items: { $ref: '#/components/schemas/OrderItemInput' },
                    },
                    notes: { type: 'string', maxLength: 1000 },
                    whatsappMessageId: { type: 'string', maxLength: 255 },
                  },
                },
              },
            },
          },
          responses: {
            '201': {
              description: 'Pedido criado',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      order: { $ref: '#/components/schemas/Order' },
                    },
                  },
                },
              },
            },
            '400': { $ref: '#/components/responses/BadRequest' },
            '401': { $ref: '#/components/responses/Unauthorized' },
            '403': { $ref: '#/components/responses/Forbidden' },
          },
        },
      },

      '/orders/{id}': {
        get: {
          tags: ['Orders'],
          summary: 'Obter pedido por ID',
          operationId: 'getOrder',
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'string', format: 'uuid' },
            },
          ],
          responses: {
            '200': {
              description: 'Pedido encontrado',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      order: { $ref: '#/components/schemas/Order' },
                    },
                  },
                },
              },
            },
            '404': { $ref: '#/components/responses/NotFound' },
            '401': { $ref: '#/components/responses/Unauthorized' },
            '403': { $ref: '#/components/responses/Forbidden' },
          },
        },
      },

      '/orders/{id}/status': {
        patch: {
          tags: ['Orders'],
          summary: 'Atualizar status do pedido',
          operationId: 'updateOrderStatus',
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'string', format: 'uuid' },
            },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['status'],
                  properties: {
                    status: { $ref: '#/components/schemas/OrderStatus' },
                    cancellationReason: { type: 'string', maxLength: 500 },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Status atualizado',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      order: { $ref: '#/components/schemas/Order' },
                    },
                  },
                },
              },
            },
            '400': { $ref: '#/components/responses/BadRequest' },
            '409': { $ref: '#/components/responses/Conflict' },
            '401': { $ref: '#/components/responses/Unauthorized' },
            '403': { $ref: '#/components/responses/Forbidden' },
          },
        },
      },

      // ─── Kitchen ────────────────────────────────────────
      '/kitchen/queue': {
        get: {
          tags: ['Kitchen'],
          summary: 'Fila da cozinha (pedidos em produção/prontos)',
          operationId: 'getKitchenQueue',
          security: [{ bearerAuth: [] }],
          responses: {
            '200': {
              description: 'Fila da cozinha',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      orders: {
                        type: 'array',
                        items: { $ref: '#/components/schemas/Order' },
                      },
                    },
                  },
                },
              },
            },
            '401': { $ref: '#/components/responses/Unauthorized' },
            '403': { $ref: '#/components/responses/Forbidden' },
          },
        },
      },

      '/kitchen/orders/{id}/advance': {
        patch: {
          tags: ['Kitchen'],
          summary: 'Avançar status do pedido na cozinha',
          operationId: 'advanceKitchenOrder',
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'string', format: 'uuid' },
            },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['status'],
                  properties: {
                    status: {
                      type: 'string',
                      enum: ['in_production', 'ready'],
                    },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Pedido avançado',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      order: { $ref: '#/components/schemas/Order' },
                    },
                  },
                },
              },
            },
            '400': { $ref: '#/components/responses/BadRequest' },
            '409': { $ref: '#/components/responses/Conflict' },
            '401': { $ref: '#/components/responses/Unauthorized' },
            '403': { $ref: '#/components/responses/Forbidden' },
          },
        },
      },

      // ─── Delivery ───────────────────────────────────────
      '/delivery/queue': {
        get: {
          tags: ['Delivery'],
          summary: 'Fila de entregas',
          operationId: 'getDeliveryQueue',
          security: [{ bearerAuth: [] }],
          responses: {
            '200': {
              description: 'Fila de entregas',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      deliveries: {
                        type: 'array',
                        items: { $ref: '#/components/schemas/Delivery' },
                      },
                    },
                  },
                },
              },
            },
            '401': { $ref: '#/components/responses/Unauthorized' },
            '403': { $ref: '#/components/responses/Forbidden' },
          },
        },
      },

      '/delivery/{id}/status': {
        patch: {
          tags: ['Delivery'],
          summary: 'Atualizar status da entrega',
          operationId: 'updateDeliveryStatus',
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'string', format: 'uuid' },
            },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['status'],
                  properties: {
                    status: { $ref: '#/components/schemas/DeliveryStatus' },
                    delivererId: { type: 'string', format: 'uuid' },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Status da entrega atualizado',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      delivery: { $ref: '#/components/schemas/Delivery' },
                    },
                  },
                },
              },
            },
            '400': { $ref: '#/components/responses/BadRequest' },
            '409': { $ref: '#/components/responses/Conflict' },
            '401': { $ref: '#/components/responses/Unauthorized' },
            '403': { $ref: '#/components/responses/Forbidden' },
          },
        },
      },

      // ─── Cashier ────────────────────────────────────────
      '/cashier/registers': {
        post: {
          tags: ['Cashier'],
          summary: 'Abrir caixa',
          operationId: 'openCashRegister',
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['openingAmount'],
                  properties: {
                    openingAmount: { type: 'number', minimum: 0 },
                  },
                },
              },
            },
          },
          responses: {
            '201': {
              description: 'Caixa aberto',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      register: { $ref: '#/components/schemas/CashRegister' },
                    },
                  },
                },
              },
            },
            '409': { $ref: '#/components/responses/Conflict' },
            '401': { $ref: '#/components/responses/Unauthorized' },
            '403': { $ref: '#/components/responses/Forbidden' },
          },
        },
      },

      '/cashier/registers/{id}/close': {
        patch: {
          tags: ['Cashier'],
          summary: 'Fechar caixa',
          operationId: 'closeCashRegister',
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'string', format: 'uuid' },
            },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['closingAmount'],
                  properties: {
                    closingAmount: { type: 'number', minimum: 0 },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Caixa fechado',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      register: { $ref: '#/components/schemas/CashRegister' },
                    },
                  },
                },
              },
            },
            '409': { $ref: '#/components/responses/Conflict' },
            '401': { $ref: '#/components/responses/Unauthorized' },
            '403': { $ref: '#/components/responses/Forbidden' },
          },
        },
      },

      '/cashier/movements': {
        post: {
          tags: ['Cashier'],
          summary: 'Adicionar movimentação ao caixa',
          operationId: 'addCashMovement',
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['type', 'amount'],
                  properties: {
                    type: { $ref: '#/components/schemas/CashMovementType' },
                    paymentMethod: { $ref: '#/components/schemas/PaymentMethod' },
                    amount: { type: 'number', minimum: 0.01 },
                    orderId: { type: 'string', format: 'uuid' },
                    notes: { type: 'string', maxLength: 500 },
                  },
                },
              },
            },
          },
          responses: {
            '201': {
              description: 'Movimentação adicionada',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      movement: { $ref: '#/components/schemas/CashMovement' },
                    },
                  },
                },
              },
            },
            '400': { $ref: '#/components/responses/BadRequest' },
            '401': { $ref: '#/components/responses/Unauthorized' },
            '403': { $ref: '#/components/responses/Forbidden' },
          },
        },
      },

      // ─── Dashboard ──────────────────────────────────────
      '/dashboard/metrics': {
        get: {
          tags: ['Dashboard'],
          summary: 'Métricas do dashboard',
          operationId: 'getDashboardMetrics',
          security: [{ bearerAuth: [] }],
          responses: {
            '200': {
              description: 'Métricas agregadas',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      totalRevenue: { type: 'number' },
                      totalOrders: { type: 'integer' },
                      averageTicket: { type: 'number' },
                      ordersByStatus: { type: 'object' },
                      ordersByType: { type: 'object' },
                      recentOrders: {
                        type: 'array',
                        items: { $ref: '#/components/schemas/Order' },
                      },
                    },
                  },
                },
              },
            },
            '401': { $ref: '#/components/responses/Unauthorized' },
            '403': { $ref: '#/components/responses/Forbidden' },
          },
        },
      },

      // ─── Reports ────────────────────────────────────────
      '/reports/orders/export': {
        get: {
          tags: ['Reports'],
          summary: 'Exportar pedidos em CSV',
          operationId: 'exportOrdersCSV',
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: 'from',
              in: 'query',
              required: true,
              schema: { type: 'string', format: 'date' },
            },
            {
              name: 'to',
              in: 'query',
              required: true,
              schema: { type: 'string', format: 'date' },
            },
          ],
          responses: {
            '200': {
              description: 'Arquivo CSV',
              content: {
                'text/csv': {
                  schema: { type: 'string' },
                },
              },
            },
            '400': { $ref: '#/components/responses/BadRequest' },
            '401': { $ref: '#/components/responses/Unauthorized' },
            '403': { $ref: '#/components/responses/Forbidden' },
          },
        },
      },

      // ─── Settings ───────────────────────────────────────
      '/settings': {
        get: {
          tags: ['Settings'],
          summary: 'Listar configurações',
          operationId: 'getSettings',
          security: [{ bearerAuth: [] }],
          responses: {
            '200': {
              description: 'Mapa de configurações (chave → valor)',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    additionalProperties: true,
                  },
                },
              },
            },
            '401': { $ref: '#/components/responses/Unauthorized' },
            '403': { $ref: '#/components/responses/Forbidden' },
          },
        },
        put: {
          tags: ['Settings'],
          summary: 'Criar ou atualizar configuração',
          operationId: 'upsertSetting',
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['key', 'value'],
                  properties: {
                    key: { type: 'string', minLength: 1, maxLength: 100 },
                    value: {},
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Configuração salva',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      setting: { $ref: '#/components/schemas/Setting' },
                    },
                  },
                },
              },
            },
            '400': { $ref: '#/components/responses/BadRequest' },
            '401': { $ref: '#/components/responses/Unauthorized' },
            '403': { $ref: '#/components/responses/Forbidden' },
          },
        },
      },

      // ─── Webhook ────────────────────────────────────────
      '/webhook': {
        get: {
          tags: ['Webhook'],
          summary: 'Verificação do webhook (Meta WhatsApp)',
          operationId: 'verifyWebhook',
          parameters: [
            {
              name: 'hub.mode',
              in: 'query',
              schema: { type: 'string' },
            },
            {
              name: 'hub.verify_token',
              in: 'query',
              schema: { type: 'string' },
            },
            {
              name: 'hub.challenge',
              in: 'query',
              schema: { type: 'string' },
            },
          ],
          responses: {
            '200': {
              description: 'Challenge retornado para verificação',
              content: {
                'text/plain': {
                  schema: { type: 'string' },
                },
              },
            },
            '403': { description: 'Token de verificação inválido' },
          },
        },
      },

      '/webhook/{establishmentId}': {
        post: {
          tags: ['Webhook'],
          summary: 'Receber webhook do WhatsApp',
          operationId: 'receiveWebhook',
          parameters: [
            {
              name: 'establishmentId',
              in: 'path',
              required: true,
              schema: { type: 'string', format: 'uuid' },
            },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  description: 'Payload do webhook da Meta WhatsApp Cloud API',
                },
              },
            },
          },
          responses: {
            '200': { description: 'Webhook processado' },
            '400': { $ref: '#/components/responses/BadRequest' },
          },
        },
      },
    },

    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
      responses: {
        BadRequest: {
          description: 'Requisição inválida',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Error' },
            },
          },
        },
        Unauthorized: {
          description: 'Não autorizado',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Error' },
            },
          },
        },
        Forbidden: {
          description: 'Acesso proibido',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Error' },
            },
          },
        },
        NotFound: {
          description: 'Recurso não encontrado',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Error' },
            },
          },
        },
        Conflict: {
          description: 'Conflito',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Error' },
            },
          },
        },
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' },
            details: {},
          },
        },

        AuthenticatedUser: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            establishmentId: { type: 'string', format: 'uuid' },
            email: { type: 'string', format: 'email' },
            name: { type: 'string' },
            role: { type: 'string' },
            permissions: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  resource: { type: 'string' },
                  action: { type: 'string' },
                },
              },
            },
          },
        },

        OrderStatus: {
          type: 'string',
          enum: [
            'received',
            'in_production',
            'ready',
            'in_delivery',
            'picked_up',
            'completed',
            'cancelled',
          ],
        },

        OrderType: {
          type: 'string',
          enum: ['delivery', 'pickup', 'table'],
        },

        OrderChannel: {
          type: 'string',
          enum: ['whatsapp', 'ifood', 'manual'],
        },

        DeliveryStatus: {
          type: 'string',
          enum: ['pending', 'dispatched', 'delivered', 'failed'],
        },

        CashRegisterStatus: {
          type: 'string',
          enum: ['open', 'closed'],
        },

        CashMovementType: {
          type: 'string',
          enum: ['payment', 'withdrawal', 'supply'],
        },

        PaymentMethod: {
          type: 'string',
          enum: ['pix', 'card_credit', 'card_debit', 'cash', 'voucher'],
        },

        OrderItemInput: {
          type: 'object',
          required: ['productName', 'unitPrice', 'quantity'],
          properties: {
            productId: { type: 'string', format: 'uuid' },
            productName: { type: 'string', minLength: 1, maxLength: 255 },
            unitPrice: { type: 'number', minimum: 0.01 },
            quantity: { type: 'integer', minimum: 1 },
            notes: { type: 'string', maxLength: 500 },
          },
        },

        OrderItem: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            productId: { type: 'string', format: 'uuid' },
            productName: { type: 'string' },
            unitPrice: { type: 'number' },
            quantity: { type: 'integer' },
            notes: { type: 'string' },
            subtotal: { type: 'number' },
          },
        },

        Order: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            establishmentId: { type: 'string', format: 'uuid' },
            customerId: { type: 'string', format: 'uuid' },
            tableId: { type: 'string', format: 'uuid' },
            channel: { $ref: '#/components/schemas/OrderChannel' },
            type: { $ref: '#/components/schemas/OrderType' },
            status: { $ref: '#/components/schemas/OrderStatus' },
            total: { type: 'number' },
            notes: { type: 'string' },
            items: {
              type: 'array',
              items: { $ref: '#/components/schemas/OrderItem' },
            },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },

        Delivery: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            orderId: { type: 'string', format: 'uuid' },
            status: { $ref: '#/components/schemas/DeliveryStatus' },
            delivererId: { type: 'string', format: 'uuid' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },

        CashRegister: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            establishmentId: { type: 'string', format: 'uuid' },
            openedBy: { type: 'string', format: 'uuid' },
            closedBy: { type: 'string', format: 'uuid' },
            status: { $ref: '#/components/schemas/CashRegisterStatus' },
            openingAmount: { type: 'number' },
            closingAmount: { type: 'number' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },

        CashMovement: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            registerId: { type: 'string', format: 'uuid' },
            type: { $ref: '#/components/schemas/CashMovementType' },
            paymentMethod: { $ref: '#/components/schemas/PaymentMethod' },
            amount: { type: 'number' },
            orderId: { type: 'string', format: 'uuid' },
            notes: { type: 'string' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },

        Setting: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            establishmentId: { type: 'string', format: 'uuid' },
            key: { type: 'string' },
            value: {},
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
      },
    },
  }
}
