import { db } from '@/infra/database/connection'
import { RedisProvider } from '@/infra/redis/RedisProvider'

// Auth
import { DrizzleUserRepository } from '@/modules/auth/infra/repositories/DrizzleUserRepository'
import { LoginUseCase } from '@/modules/auth/application/use-cases/LoginUseCase'
import { RefreshTokenUseCase } from '@/modules/auth/application/use-cases/RefreshTokenUseCase'
import { LogoutUseCase } from '@/modules/auth/application/use-cases/LogoutUseCase'
import { ChangePasswordUseCase } from '@/modules/auth/application/use-cases/ChangePasswordUseCase'
import { AuthController } from '@/modules/auth/infra/http/AuthController'

// Customers
import { FindOrCreateCustomerUseCase } from '@/modules/customers/application/use-cases/FindOrCreateCustomerUseCase'
import { DrizzleCustomerRepository } from '@/modules/customers/infra/repositories/DrizzleCustomerRepository'
import { ListCustomersUseCase } from '@/modules/customers/application/use-cases/ListCustomersUseCase'
import { GetCustomerDetailsUseCase } from '@/modules/customers/application/use-cases/GetCustomerDetailsUseCase'
import { CreateCustomerUseCase } from '@/modules/customers/application/use-cases/CreateCustomerUseCase'
import { UpdateCustomerUseCase } from '@/modules/customers/application/use-cases/UpdateCustomerUseCase'
import { DeleteCustomerUseCase } from '@/modules/customers/application/use-cases/DeleteCustomerUseCase'
import { CustomerController } from '@/modules/customers/infra/http/CustomerController'
import { ListAddressesUseCase } from '@/modules/customers/application/use-cases/ListAddressesUseCase'
import { CreateAddressUseCase } from '@/modules/customers/application/use-cases/CreateAddressUseCase'
import { UpdateAddressUseCase } from '@/modules/customers/application/use-cases/UpdateAddressUseCase'
import { DeleteAddressUseCase } from '@/modules/customers/application/use-cases/DeleteAddressUseCase'
import { SetDefaultAddressUseCase } from '@/modules/customers/application/use-cases/SetDefaultAddressUseCase'
import { AddressController } from '@/modules/customers/infra/http/AddressController'
import { DrizzleAddressRepository } from '@/modules/customers/infra/repositories/DrizzleAddressRepository'

// Products / Catalog
import { MenuController } from '@/modules/products/infra/http/MenuController'
import { CatalogController } from '@/modules/products/infra/http/CatalogController'
import { SectionController } from '@/modules/products/infra/http/SectionController'
import { IngredientController } from '@/modules/products/infra/http/IngredientController'
import { StockBatchController } from '@/modules/products/infra/http/StockBatchController'
import { CreateStockBatchUseCase } from '@/modules/products/application/use-cases/CreateStockBatchUseCase'
import { DeductStockForOrderUseCase } from '@/modules/products/application/use-cases/DeductStockForOrderUseCase'
import { StockMovementController } from '@/modules/products/infra/http/StockMovementController'
import { CreateStockMovementUseCase } from '@/modules/products/application/use-cases/CreateStockMovementUseCase'

// Tables
import { DrizzleTableRepository } from '@/modules/tables/infra/repositories/DrizzleTableRepository'
import { DrizzleComandaRepository } from '@/modules/tables/infra/repositories/DrizzleComandaRepository'
import { ListTablesUseCase } from '@/modules/tables/application/use-cases/ListTablesUseCase'
import { CreateTableUseCase } from '@/modules/tables/application/use-cases/CreateTableUseCase'
import { UpdateTablePositionUseCase } from '@/modules/tables/application/use-cases/UpdateTablePositionUseCase'
import { GroupTablesUseCase } from '@/modules/tables/application/use-cases/GroupTablesUseCase'
import { ListComandasByTableUseCase } from '@/modules/tables/application/use-cases/ListComandasByTableUseCase'
import { UngroupTablesUseCase } from '@/modules/tables/application/use-cases/UngroupTablesUseCase'
import { UpdateTableUseCase } from '@/modules/tables/application/use-cases/UpdateTableUseCase'
import { DeleteTableUseCase } from '@/modules/tables/application/use-cases/DeleteTableUseCase'
import { OpenComandaUseCase } from '@/modules/tables/application/use-cases/OpenComandaUseCase'
import { CloseComandaUseCase } from '@/modules/tables/application/use-cases/CloseComandaUseCase'
import { GetComandaByCodeUseCase } from '@/modules/tables/application/use-cases/GetComandaByCodeUseCase'
import { ConfirmComandaUseCase } from '@/modules/tables/application/use-cases/ConfirmComandaUseCase'
import { TableController } from '@/modules/tables/infra/http/TableController'

// Staff
import { DrizzleStaffRepository } from '@/modules/users/infra/repositories/DrizzleStaffRepository'
import { ListStaffUseCase } from '@/modules/users/application/use-cases/ListStaffUseCase'
import { CreateStaffUseCase } from '@/modules/users/application/use-cases/CreateStaffUseCase'
import { UpdateStaffUseCase } from '@/modules/users/application/use-cases/UpdateStaffUseCase'
import { DeleteStaffUseCase } from '@/modules/users/application/use-cases/DeleteStaffUseCase'
import { ToggleStaffActiveUseCase } from '@/modules/users/application/use-cases/ToggleStaffActiveUseCase'
import { ResetStaffPasswordUseCase } from '@/modules/users/application/use-cases/ResetStaffPasswordUseCase'
import { ListRolesUseCase } from '@/modules/users/application/use-cases/ListRolesUseCase'
import { CreateRoleUseCase } from '@/modules/users/application/use-cases/CreateRoleUseCase'
import { UpdateRoleUseCase } from '@/modules/users/application/use-cases/UpdateRoleUseCase'
import { DeleteRoleUseCase } from '@/modules/users/application/use-cases/DeleteRoleUseCase'
import { GetRoleWithPermissionsUseCase } from '@/modules/users/application/use-cases/GetRoleWithPermissionsUseCase'
import { ListRolesWithPermissionsUseCase } from '@/modules/users/application/use-cases/ListRolesWithPermissionsUseCase'
import { AssignPermissionsUseCase } from '@/modules/users/application/use-cases/AssignPermissionsUseCase'
import { StaffController } from '@/modules/users/infra/http/StaffController'
import { RoleController } from '@/modules/users/infra/http/RoleController'

// Orders
import { CreateOrderUseCase } from '@/modules/orders/application/use-cases/CreateOrderUseCase'
import { UpdateOrderStatusUseCase } from '@/modules/orders/application/use-cases/UpdateOrderStatusUseCase'
import { TriggerFiscalEmissionUseCase } from '@/modules/fiscal/application/use-cases/TriggerFiscalEmissionUseCase'
import { UpdateOrderNotesUseCase } from '@/modules/orders/application/use-cases/UpdateOrderNotesUseCase'
import { GetOrderUseCase } from '@/modules/orders/application/use-cases/GetOrderUseCase'
import { ListOrdersUseCase } from '@/modules/orders/application/use-cases/ListOrdersUseCase'
import { OrderController } from '@/modules/orders/infra/http/OrderController'
import { RequestPartialOrderConfirmationUseCase } from '@/modules/orders/application/use-cases/RequestPartialOrderConfirmationUseCase'
import { ListPaymentTypesUseCase } from '@/modules/orders/application/use-cases/ListPaymentTypesUseCase'
import { ListOrderTypesUseCase } from '@/modules/orders/application/use-cases/ListOrderTypesUseCase'
import { OrderReferenceDataController } from '@/modules/orders/infra/http/OrderReferenceDataController'
import { BotConfigRepository } from '@/infra/database/BotConfigRepository'
import { BotCustomerService } from '@/modules/bot/application/services/BotCustomerService'
import { GetBotContextUseCase } from '@/modules/bot/application/use-cases/GetBotContextUseCase'
import { SaveBotSessionUseCase } from '@/modules/bot/application/use-cases/SaveBotSessionUseCase'
import { CreateBotOrderUseCase } from '@/modules/bot/application/use-cases/CreateBotOrderUseCase'
import { BotController } from '@/modules/bot/infra/http/BotController'
import { CreateOrderIssueUseCase } from '@/modules/issues/application/use-cases/CreateOrderIssueUseCase'
import { GetOrderIssueReportUseCase } from '@/modules/issues/application/use-cases/GetOrderIssueReportUseCase'
import { ResolveOrderIssueUseCase } from '@/modules/issues/application/use-cases/ResolveOrderIssueUseCase'
import { OrderIssueController } from '@/modules/issues/infra/http/OrderIssueController'
import { NotifySyncedOrderStatusUseCase } from '@/modules/orders/application/use-cases/NotifySyncedOrderStatusUseCase'
import { AnswerPartialConfirmationUseCase } from '@/modules/orders/application/use-cases/AnswerPartialConfirmationUseCase'
import { OrderUpdateSender } from '@/modules/conversations/application/services/OrderUpdateSender'
import { NotifyOrderStatusUseCase } from '@/modules/orders/application/use-cases/NotifyOrderStatusUseCase'
import { EstimateOrderTimeUseCase } from '@/modules/orders/application/use-cases/EstimateOrderTimeUseCase'
import { CreateBotReservationUseCase } from '@/modules/bot/application/use-cases/CreateBotReservationUseCase'
import { schedulingModule } from '@/infra/scheduling/schedulingModule'
import { AgendaSetupService } from '@/modules/agenda/application/services/AgendaSetupService'
import { ListScheduledOrderSlotsUseCase } from '@/modules/agenda/application/use-cases/ListScheduledOrderSlotsUseCase'
import { BookScheduledOrderUseCase } from '@/modules/agenda/application/use-cases/BookScheduledOrderUseCase'
import { CancelScheduleBookingUseCase } from '@/modules/agenda/application/use-cases/CancelScheduleBookingUseCase'
import { ReserveTableUseCase } from '@/modules/agenda/application/use-cases/ReserveTableUseCase'
import { GetAgendaDayUseCase } from '@/modules/agenda/application/use-cases/GetAgendaDayUseCase'
import { AgendaController } from '@/modules/agenda/infra/http/AgendaController'
import { CalculateDeliveryFeeUseCase } from '@/modules/delivery/application/use-cases/CalculateDeliveryFeeUseCase'
import type { CustomerMessageProvider } from '@/shared/providers/CustomerMessageProvider'
import type { BotMessageProvider } from '@/shared/providers/BotMessageProvider'
import { MercadoPagoGatewayFactoryImplementation } from '@/modules/payments/infra/gateways/MercadoPagoGatewayFactoryImplementation'
import { PaymentAccountService } from '@/modules/payments/application/services/PaymentAccountService'
import { OrderPaymentTransitions } from '@/modules/payments/application/services/OrderPaymentTransitions'
import { GetPaymentAccountUseCase } from '@/modules/payments/application/use-cases/GetPaymentAccountUseCase'
import { UpsertPaymentAccountUseCase } from '@/modules/payments/application/use-cases/UpsertPaymentAccountUseCase'
import { CreateOrderChargeUseCase } from '@/modules/payments/application/use-cases/CreateOrderChargeUseCase'
import { HandlePaymentWebhookUseCase } from '@/modules/payments/application/use-cases/HandlePaymentWebhookUseCase'
import { ExpireStaleChargesUseCase } from '@/modules/payments/application/use-cases/ExpireStaleChargesUseCase'
import { PaymentController } from '@/modules/payments/infra/http/PaymentController'
import {
  CONVERSATION_AGENT_SENDER,
  CONVERSATION_START_STATE,
} from '@/modules/conversations/shared/conversations.constant'

// Kitchen
import { GetKitchenQueueUseCase } from '@/modules/kitchen/application/use-cases/GetKitchenQueueUseCase'
import { MarkOrderItemReadyUseCase } from '@/modules/kitchen/application/use-cases/MarkOrderItemReadyUseCase'
import { KitchenController } from '@/modules/kitchen/infra/http/KitchenController'

// Delivery
import { GetDeliveryQueueUseCase } from '@/modules/delivery/application/use-cases/GetDeliveryQueueUseCase'
import { UpdateDeliveryStatusUseCase } from '@/modules/delivery/application/use-cases/UpdateDeliveryStatusUseCase'
import { DeliveryController } from '@/modules/delivery/infra/http/DeliveryController'

// Cashier
import { OpenCashRegisterUseCase } from '@/modules/cashier/application/use-cases/OpenCashRegisterUseCase'
import { CloseCashRegisterUseCase } from '@/modules/cashier/application/use-cases/CloseCashRegisterUseCase'
import { RecordOrderPaymentsUseCase } from '@/modules/cashier/application/use-cases/RecordOrderPaymentsUseCase'
import { AddCashMovementUseCase } from '@/modules/cashier/application/use-cases/AddCashMovementUseCase'
import { CashierController } from '@/modules/cashier/infra/http/CashierController'

// Dashboard
import { GetDashboardMetricsUseCase } from '@/modules/dashboard/application/use-cases/GetDashboardMetricsUseCase'
import { DashboardController } from '@/modules/dashboard/infra/http/DashboardController'

// Reports
import { ExportOrdersCSVUseCase } from '@/modules/reports/application/use-cases/ExportOrdersCSVUseCase'
import { GetMonthlyReportUseCase } from '@/modules/reports/application/use-cases/GetMonthlyReportUseCase'
import { GetFunnelAnalysisUseCase } from '@/modules/reports/application/use-cases/GetFunnelAnalysisUseCase'
import { GetTableMetricsUseCase } from '@/modules/reports/application/use-cases/GetTableMetricsUseCase'
import { GetIngredientsRankingUseCase } from '@/modules/reports/application/use-cases/GetIngredientsRankingUseCase'
import { GetProductProfitUseCase } from '@/modules/reports/application/use-cases/GetProductProfitUseCase'
import { GetPreparationTimeComparisonUseCase } from '@/modules/reports/application/use-cases/GetPreparationTimeComparisonUseCase'
import { ReportsController } from '@/modules/reports/infra/http/ReportsController'

// Settings
import { GetSettingsUseCase } from '@/modules/settings/application/use-cases/GetSettingsUseCase'
import { UpsertSettingUseCase } from '@/modules/settings/application/use-cases/UpsertSettingUseCase'
import { SettingsController } from '@/modules/settings/infra/http/SettingsController'
import { BrandingController } from '@/modules/settings/infra/http/BrandingController'
import { GetBrandingUseCase } from '@/modules/settings/application/use-cases/GetBrandingUseCase'
import { BrandStickerService } from '@/modules/settings/application/services/BrandStickerService'
import { DeliveryFeeController } from '@/modules/settings/infra/http/DeliveryFeeController'

// Audit
import { CreateAuditLogUseCase } from '@/modules/audit/application/use-cases/CreateAuditLogUseCase'

// Webhook
import { WebhookController } from '@/modules/webhook/infra/http/WebhookController'
import { WhatsAppInboundController } from '@/modules/webhook/infra/http/WhatsAppInboundController'
import { EnqueueWhatsAppInboundUseCase } from '@/modules/webhook/application/EnqueueWhatsAppInbound.use-case'
import { whatsAppInboundQueue } from '@/infra/queue/whatsAppInboundQueue'
import { PreviewInboundController } from '@/modules/webhook/infra/http/PreviewInboundController'
import { PreviewMediaController } from '@/modules/webhook/infra/http/PreviewMediaController'
import { SendPreviewInboundUseCase } from '@/modules/webhook/application/SendPreviewInbound.use-case'

// Conversations — servidas pelo @adatechnology/meta-whatsapp-module
import { createMetaWhatsAppModuleRegistry } from '@/modules/conversations/infra/whatsapp/metaWhatsAppModule'
import { createConversationObjectStorage } from '@/modules/conversations/infra/storage/conversationObjectStorage'
import { isStorageEnabled } from '@/infra/config/storageEnvironment'
import { ConversationController } from '@/modules/conversations/infra/http/ConversationController'
import { WhatsAppTemplateProvider } from '@adatechnology/meta-whatsapp-provider'
import { WhatsAppSettingsController } from '@/modules/conversations/infra/http/WhatsAppSettingsController'

// Finance
import { MonthlyAccountController } from '@/modules/finance/infra/http/MonthlyAccountController'
import { ExpenseController } from '@/modules/finance/infra/http/ExpenseController'

// Fiscal
import { EmitFiscalDocumentUseCase } from '@/modules/fiscal/application/use-cases/EmitFiscalDocumentUseCase'
import { CancelFiscalDocumentUseCase } from '@/modules/fiscal/application/use-cases/CancelFiscalDocumentUseCase'
import { GetFiscalDocumentUseCase } from '@/modules/fiscal/application/use-cases/GetFiscalDocumentUseCase'
import { UpsertFiscalConfigUseCase } from '@/modules/fiscal/application/use-cases/UpsertFiscalConfigUseCase'
import { TestFiscalConnectionUseCase } from '@/modules/fiscal/application/use-cases/TestFiscalConnectionUseCase'
import { RetryFiscalDocumentUseCase } from '@/modules/fiscal/application/use-cases/RetryFiscalDocumentUseCase'
import { PrintFiscalCupomUseCase } from '@/modules/fiscal/application/use-cases/PrintFiscalCupomUseCase'
import { GenerateFiscalPdfUseCase } from '@/modules/fiscal/application/use-cases/GenerateFiscalPdfUseCase'
import { ThermalPrinterProvider } from '@/modules/fiscal/application/printing/ThermalPrinterProvider'
import { FiscalController } from '@/modules/fiscal/infra/http/FiscalController'

// Uploads
import { LocalStorageProvider } from '@/shared/providers/LocalStorageProvider'
import { CachedProductLookup } from '@/shared/providers/CachedProductLookup'
import { OpenFoodFactsProvider } from '@/shared/providers/OpenFoodFactsProvider'
import { CachedRegionalPrice } from '@/shared/providers/CachedRegionalPrice'
import { PrecoDaHoraBahiaProvider } from '@/shared/providers/PrecoDaHoraBahiaProvider'
import { NominatimProvider } from '@/shared/providers/NominatimProvider'
import { UploadFileUseCase } from '@/modules/uploads/application/UploadFileUseCase'
import { UploadController } from '@/modules/uploads/infra/http/UploadController'

// WebSocket Hub (passed in from server bootstrap to avoid circular dep)
import type { WebSocketHub } from '@/infra/websocket/WebSocketHub'
import type { QueueWorkerDependencies } from '@/infra/queue/startQueueWorkers'

export interface AppContainer {
  cache: RedisProvider
  notifySyncedOrderStatus: NotifySyncedOrderStatusUseCase
  menuController: MenuController
  catalogController: CatalogController
  sectionController: SectionController
  ingredientController: IngredientController
  stockBatchController: StockBatchController
  stockMovementController: StockMovementController
  authController: AuthController
  orderController: OrderController
  orderReferenceDataController: OrderReferenceDataController
  kitchenController: KitchenController
  deliveryController: DeliveryController
  cashierController: CashierController
  dashboardController: DashboardController
  reportsController: ReportsController
  settingsController: SettingsController
  brandingController: BrandingController
  deliveryFeeController: DeliveryFeeController
  botController: BotController
  orderIssueController: OrderIssueController
  agendaController: AgendaController
  webhookController: WebhookController
  whatsAppInboundController: WhatsAppInboundController
  paymentController: PaymentController
  expireStaleCharges: ExpireStaleChargesUseCase
  previewInboundController: PreviewInboundController
  previewMediaController: PreviewMediaController
  customerController: CustomerController
  addressController: AddressController
  tableController: TableController
  staffController: StaffController
  roleController: RoleController
  conversationController: ConversationController
  whatsAppSettingsController: WhatsAppSettingsController
  fiscalController: FiscalController
  monthlyAccountController: MonthlyAccountController
  expenseController: ExpenseController
  uploadController: UploadController
  queueWorkerDependencies: QueueWorkerDependencies
}

export function buildContainer(wsHub: WebSocketHub): AppContainer {
  const cache = new RedisProvider()

  // Sem STORAGE_ENABLED a instalação roda igual, só sem biblioteca de documentos: o anexo segue
  // acessível pelo proxy de mídia da Meta enquanto a URL dela viver.
  const objectStorage = isStorageEnabled() ? createConversationObjectStorage() : undefined

  const isConversationPreviewEnabled = process.env.CONVERSATION_PREVIEW_ENABLED === 'true'

  // Uma instância do módulo por estabelecimento: os eventos que ele emite não carregam tenant.
  const metaWhatsAppModules = createMetaWhatsAppModuleRegistry({
    db,
    cache,
    webSocketHub: wsHub,
    objectStorage: objectStorage?.forModule,
    previewMediaEnabled: isConversationPreviewEnabled,
  })

  // Shared repos
  const userRepository = new DrizzleUserRepository(db)

  // Auth
  const loginUseCase = new LoginUseCase(userRepository, cache)
  const refreshTokenUseCase = new RefreshTokenUseCase(userRepository, cache)
  const logoutUseCase = new LogoutUseCase(cache)
  const changePasswordUseCase = new ChangePasswordUseCase(userRepository)
  const authController = new AuthController(loginUseCase, refreshTokenUseCase, logoutUseCase, changePasswordUseCase)

  // Shared use cases
  const findOrCreateCustomerUseCase = new FindOrCreateCustomerUseCase(db)
  const createAuditLogUseCase = new CreateAuditLogUseCase(db)

  // Products / Catalog
  // A ordem do array é a ordem de tentativa do fallback. Provider fiscal (T4.2) entra
  // depois da OpenFoodFacts quando houver contrato — sem mudar nada no controller.
  const productLookup = new CachedProductLookup(cache, [new OpenFoodFactsProvider()])

  // Preço regional tem cobertura por UF, não nacional: cada provider cobre um estado
  // e o resolver escolhe pelo estado do estabelecimento. UF sem provider → sem sugestão.
  const regionalPrice = new CachedRegionalPrice(cache, [
    new PrecoDaHoraBahiaProvider(new NominatimProvider()),
  ])

  const menuController = new MenuController(db, cache)
  const catalogController = new CatalogController(db, cache, productLookup, regionalPrice)
  const sectionController = new SectionController(db)
  const ingredientController = new IngredientController(db)
  const createStockBatchUseCase = new CreateStockBatchUseCase(db, createAuditLogUseCase)
  const stockBatchController = new StockBatchController(db, createStockBatchUseCase)
  const createStockMovementUseCase = new CreateStockMovementUseCase(db, createAuditLogUseCase)
  const stockMovementController = new StockMovementController(db, createStockMovementUseCase)
  const deductStockForOrderUseCase = new DeductStockForOrderUseCase(db)
  const triggerFiscalEmissionUseCase = new TriggerFiscalEmissionUseCase(db, wsHub)
  // Único caminho de envio ao cliente: o mesmo módulo que a inbox usa, só que atrás de uma
  // interface, para o módulo de pedidos não conhecer o registry.
  // Aviso de pedido fora da janela de 24 h vira template aprovado (OrderUpdateSender).
  const orderUpdateSender = new OrderUpdateSender(
    db,
    (establishmentId) => metaWhatsAppModules.forEstablishment(establishmentId).conversations.send
  )
  const customerMessages: CustomerMessageProvider = {
    async sendText(params): Promise<void> {
      await orderUpdateSender.send({ ...params, sender: CONVERSATION_AGENT_SENDER })
    },
  }

  // Mensagem do bot sem atendente (pagamento confirmado, Pix expirado).
  const botMessages: BotMessageProvider = {
    async sendText(params): Promise<void> {
      await orderUpdateSender.send({ ...params, sender: 'bot' })
    },
  }

  const addCashMovementUseCase = new AddCashMovementUseCase(db, triggerFiscalEmissionUseCase)
  const recordOrderPaymentsUseCase = new RecordOrderPaymentsUseCase(db, addCashMovementUseCase)
  const notifyOrderStatusUseCase = new NotifyOrderStatusUseCase(db, customerMessages)
  // A loja não tem o WhatsApp: o aviso sai da nuvem quando o status chega pela sincronização.
  const notifySyncedOrderStatus = new NotifySyncedOrderStatusUseCase(db, notifyOrderStatusUseCase)
  const notifiesCustomerHere = process.env['SYNC_ROLE'] !== 'loja'
  const updateOrderStatusUseCase = new UpdateOrderStatusUseCase(
    db,
    wsHub,
    triggerFiscalEmissionUseCase,
    deductStockForOrderUseCase,
    notifiesCustomerHere ? notifyOrderStatusUseCase : undefined,
    recordOrderPaymentsUseCase
  )

  // Orders
  const botConfigRepository = new BotConfigRepository(db)
  const calculateDeliveryFeeUseCase = new CalculateDeliveryFeeUseCase(botConfigRepository, new NominatimProvider())
  const createOrderUseCase = new CreateOrderUseCase(db, wsHub, calculateDeliveryFeeUseCase)
  const updateOrderNotesUseCase = new UpdateOrderNotesUseCase(db)
  const getOrderUseCase = new GetOrderUseCase(db)
  const listOrdersUseCase = new ListOrdersUseCase(db)
  const listPaymentTypesUseCase = new ListPaymentTypesUseCase(botConfigRepository)
  const listOrderTypesUseCase = new ListOrderTypesUseCase(botConfigRepository)
  const orderReferenceDataController = new OrderReferenceDataController(
    listPaymentTypesUseCase,
    listOrderTypesUseCase
  )

  const requestPartialOrderConfirmationUseCase = new RequestPartialOrderConfirmationUseCase(
    db,
    customerMessages,
    createAuditLogUseCase
  )
  const orderController = new OrderController(
    createOrderUseCase,
    updateOrderStatusUseCase,
    updateOrderNotesUseCase,
    getOrderUseCase,
    listOrdersUseCase,
    requestPartialOrderConfirmationUseCase
  )

  // Kitchen
  const getKitchenQueueUseCase = new GetKitchenQueueUseCase(db)
  const markOrderItemReadyUseCase = new MarkOrderItemReadyUseCase(db, updateOrderStatusUseCase)
  const kitchenController = new KitchenController(
    getKitchenQueueUseCase,
    updateOrderStatusUseCase,
    markOrderItemReadyUseCase
  )

  // Delivery
  const getDeliveryQueueUseCase = new GetDeliveryQueueUseCase(db)
  const updateDeliveryStatusUseCase = new UpdateDeliveryStatusUseCase(db, wsHub, updateOrderStatusUseCase)
  const deliveryController = new DeliveryController(
    getDeliveryQueueUseCase,
    updateDeliveryStatusUseCase
  )

  // Cashier
  const openCashRegisterUseCase = new OpenCashRegisterUseCase(db)
  const closeCashRegisterUseCase = new CloseCashRegisterUseCase(db)
  const cashierController = new CashierController(
    openCashRegisterUseCase,
    closeCashRegisterUseCase,
    addCashMovementUseCase,
    db
  )

  // Dashboard
  const getDashboardMetricsUseCase = new GetDashboardMetricsUseCase(db, cache)
  const dashboardController = new DashboardController(getDashboardMetricsUseCase)

  // Reports
  const exportOrdersCSVUseCase = new ExportOrdersCSVUseCase(db)
  const getMonthlyReportUseCase = new GetMonthlyReportUseCase(db, cache)
  const getFunnelAnalysisUseCase = new GetFunnelAnalysisUseCase(db)
  const getTableMetricsUseCase = new GetTableMetricsUseCase(db)
  const getIngredientsRankingUseCase = new GetIngredientsRankingUseCase(db)
  const getProductProfitUseCase = new GetProductProfitUseCase(db)
  const getPreparationTimeComparisonUseCase = new GetPreparationTimeComparisonUseCase(db)
  const reportsController = new ReportsController(
    exportOrdersCSVUseCase,
    getMonthlyReportUseCase,
    getFunnelAnalysisUseCase,
    getTableMetricsUseCase,
    getIngredientsRankingUseCase,
    getProductProfitUseCase,
    getPreparationTimeComparisonUseCase
  )

  // Settings
  const getSettingsUseCase = new GetSettingsUseCase(db)
  const upsertSettingUseCase = new UpsertSettingUseCase(db)
  const settingsController = new SettingsController(getSettingsUseCase, upsertSettingUseCase)
  const getBrandingUseCase = new GetBrandingUseCase(db)
  const brandingController = new BrandingController(getBrandingUseCase, new BrandStickerService(getBrandingUseCase))
  const deliveryFeeController = new DeliveryFeeController()
  const botCustomerService = new BotCustomerService(db)
  // Agenda: encomendas e reservas ocupam horário no SDK de agendamento.
  const scheduling = schedulingModule.useCases
  const agendaSetupService = new AgendaSetupService(db, scheduling)
  const scheduleBooking = {
    book: new BookScheduledOrderUseCase(scheduling, agendaSetupService),
    cancel: new CancelScheduleBookingUseCase(scheduling),
  }
  const agendaController = new AgendaController(new GetAgendaDayUseCase(db, scheduling))
  // Pagamento online pelo WhatsApp: cada restaurante liga a própria conta (Mercado Pago) em Configurações.
  const publicApiUrl = process.env.API_PUBLIC_URL ?? 'http://localhost:3333'
  const paymentAccountService = new PaymentAccountService(db, new MercadoPagoGatewayFactoryImplementation())
  const orderPaymentTransitions = new OrderPaymentTransitions({
    db,
    wsHub,
    botMessages,
    addCashMovement: addCashMovementUseCase,
    cancelBooking: scheduleBooking.cancel,
  })
  const createOrderChargeUseCase = new CreateOrderChargeUseCase(db, paymentAccountService, publicApiUrl)
  const getPaymentAccountUseCase = new GetPaymentAccountUseCase(paymentAccountService, publicApiUrl)
  const paymentController = new PaymentController(
    getPaymentAccountUseCase,
    new UpsertPaymentAccountUseCase(db, paymentAccountService, createAuditLogUseCase),
    new HandlePaymentWebhookUseCase(db, paymentAccountService, orderPaymentTransitions)
  )
  const expireStaleCharges = new ExpireStaleChargesUseCase(db, paymentAccountService, orderPaymentTransitions)

  const botController = new BotController(
    new GetBotContextUseCase(
      db,
      botConfigRepository,
      botCustomerService,
      new ListScheduledOrderSlotsUseCase(scheduling, agendaSetupService),
      paymentAccountService,
      // A Meta só baixa a figurinha de uma URL pública em HTTPS; sem ela o bot segue sem figurinha.
      publicApiUrl.startsWith('https://') ? publicApiUrl : undefined
    ),
    new SaveBotSessionUseCase(db),
    new CreateBotOrderUseCase(
      db,
      botCustomerService,
      createOrderUseCase,
      scheduleBooking,
      new EstimateOrderTimeUseCase(db),
      createOrderChargeUseCase
    ),
    botCustomerService,
    new CreateBotReservationUseCase(botCustomerService, new ReserveTableUseCase(db, scheduling, agendaSetupService)),
    new CreateOrderIssueUseCase(db, botCustomerService, wsHub),
    new AnswerPartialConfirmationUseCase(db, wsHub, updateOrderStatusUseCase)
  )
  const orderIssueController = new OrderIssueController(new GetOrderIssueReportUseCase(db), new ResolveOrderIssueUseCase(db))

  // Webhook — assinatura, replay e persistência ficam no módulo
  const webhookController = new WebhookController(metaWhatsAppModules)
  const whatsAppInboundController = new WhatsAppInboundController(
    new EnqueueWhatsAppInboundUseCase(whatsAppInboundQueue, process.env.WHATSAPP_APP_SECRET ?? '')
  )

  // Simulador de cliente — desligado por padrão; o app secret nunca sai daqui para o navegador
  const previewInboundController = new PreviewInboundController(
    new SendPreviewInboundUseCase(
      metaWhatsAppModules,
      process.env.WHATSAPP_APP_SECRET,
      isConversationPreviewEnabled
    )
  )
  const previewMediaController = new PreviewMediaController(metaWhatsAppModules)

  // Customers
  const customerRepository = new DrizzleCustomerRepository(db)
  const listCustomersUseCase = new ListCustomersUseCase(customerRepository)
  const getCustomerDetailsUseCase = new GetCustomerDetailsUseCase(customerRepository)
  const createCustomerUseCase = new CreateCustomerUseCase(customerRepository)
  const updateCustomerUseCase = new UpdateCustomerUseCase(customerRepository)
  const deleteCustomerUseCase = new DeleteCustomerUseCase(customerRepository)
  const customerController = new CustomerController(
    listCustomersUseCase,
    getCustomerDetailsUseCase,
    createCustomerUseCase,
    updateCustomerUseCase,
    deleteCustomerUseCase
  )

  // Addresses
  const addressRepository = new DrizzleAddressRepository(db)
  const listAddressesUseCase = new ListAddressesUseCase(addressRepository)
  const createAddressUseCase = new CreateAddressUseCase(addressRepository)
  const updateAddressUseCase = new UpdateAddressUseCase(addressRepository)
  const deleteAddressUseCase = new DeleteAddressUseCase(addressRepository)
  const setDefaultAddressUseCase = new SetDefaultAddressUseCase(addressRepository)
  const addressController = new AddressController(
    listAddressesUseCase,
    createAddressUseCase,
    updateAddressUseCase,
    deleteAddressUseCase,
    setDefaultAddressUseCase
  )

  // Tables + Comanda
  const tableRepository = new DrizzleTableRepository(db)
  const comandaRepository = new DrizzleComandaRepository(db)
  const listTablesUseCase = new ListTablesUseCase(tableRepository)
  const createTableUseCase = new CreateTableUseCase(tableRepository)
  const updateTableUseCase = new UpdateTableUseCase(tableRepository)
  const updateTablePositionUseCase = new UpdateTablePositionUseCase(tableRepository, createAuditLogUseCase)
  const deleteTableUseCase = new DeleteTableUseCase(tableRepository)
  const groupTablesUseCase = new GroupTablesUseCase(db, tableRepository, createAuditLogUseCase)
  const ungroupTablesUseCase = new UngroupTablesUseCase(db, createAuditLogUseCase)
  const openComandaUseCase = new OpenComandaUseCase(tableRepository, comandaRepository)
  const closeComandaUseCase = new CloseComandaUseCase(tableRepository, comandaRepository)
  const getComandaByCodeUseCase = new GetComandaByCodeUseCase(comandaRepository)
  const listComandasByTableUseCase = new ListComandasByTableUseCase(tableRepository, comandaRepository)
  const confirmComandaUseCase = new ConfirmComandaUseCase(comandaRepository)
  const tableController = new TableController(
    listTablesUseCase,
    createTableUseCase,
    updateTableUseCase,
    updateTablePositionUseCase,
    deleteTableUseCase,
    groupTablesUseCase,
    ungroupTablesUseCase,
    openComandaUseCase,
    closeComandaUseCase,
    getComandaByCodeUseCase,
    listComandasByTableUseCase,
    confirmComandaUseCase,
    comandaRepository
  )

  // Conversations
  const conversationController = new ConversationController(metaWhatsAppModules, objectStorage?.forModule)
  const whatsAppSettingsController = new WhatsAppSettingsController(
    metaWhatsAppModules,
    new WhatsAppTemplateProvider({
      accessToken: process.env.WHATSAPP_ACCESS_TOKEN ?? '',
      ...(process.env.WHATSAPP_BUSINESS_ACCOUNT_ID
        ? { wabaId: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID }
        : {}),
      ...(process.env.WHATSAPP_API_VERSION ? { apiVersion: process.env.WHATSAPP_API_VERSION } : {}),
    })
  )

  // Staff
  const staffRepository = new DrizzleStaffRepository(db)
  const listStaffUseCase = new ListStaffUseCase(staffRepository)
  const createStaffUseCase = new CreateStaffUseCase(staffRepository)
  const updateStaffUseCase = new UpdateStaffUseCase(staffRepository)
  const deleteStaffUseCase = new DeleteStaffUseCase(staffRepository)
  const toggleStaffActiveUseCase = new ToggleStaffActiveUseCase(staffRepository)
  const resetStaffPasswordUseCase = new ResetStaffPasswordUseCase(staffRepository)
  const listRolesUseCase = new ListRolesUseCase(staffRepository)
  const staffController = new StaffController(
    listStaffUseCase,
    createStaffUseCase,
    updateStaffUseCase,
    deleteStaffUseCase,
    toggleStaffActiveUseCase,
    resetStaffPasswordUseCase,
    listRolesUseCase
  )

  // Roles
  const createRoleUseCase = new CreateRoleUseCase(staffRepository)
  const updateRoleUseCase = new UpdateRoleUseCase(staffRepository)
  const deleteRoleUseCase = new DeleteRoleUseCase(staffRepository)
  const getRoleWithPermissionsUseCase = new GetRoleWithPermissionsUseCase(staffRepository)
  const listRolesWithPermissionsUseCase = new ListRolesWithPermissionsUseCase(staffRepository)
  const assignPermissionsUseCase = new AssignPermissionsUseCase(staffRepository)
  const roleController = new RoleController(
    listRolesWithPermissionsUseCase,
    getRoleWithPermissionsUseCase,
    createRoleUseCase,
    updateRoleUseCase,
    deleteRoleUseCase,
    assignPermissionsUseCase
  )

  // Fiscal
  const emitFiscalDocumentUseCase = new EmitFiscalDocumentUseCase(db, wsHub)
  const cancelFiscalDocumentUseCase = new CancelFiscalDocumentUseCase(db, wsHub)
  const getFiscalDocumentUseCase = new GetFiscalDocumentUseCase(db)
  const upsertFiscalConfigUseCase = new UpsertFiscalConfigUseCase(db)
  const testFiscalConnectionUseCase = new TestFiscalConnectionUseCase()
  const retryFiscalDocumentUseCase = new RetryFiscalDocumentUseCase(db, wsHub)
  const printFiscalCupomUseCase = new PrintFiscalCupomUseCase(db, new ThermalPrinterProvider())
  const generateFiscalPdfUseCase = new GenerateFiscalPdfUseCase(db)

  // Fiscal
  const fiscalController = new FiscalController(
    emitFiscalDocumentUseCase,
    cancelFiscalDocumentUseCase,
    getFiscalDocumentUseCase,
    upsertFiscalConfigUseCase,
    testFiscalConnectionUseCase,
    retryFiscalDocumentUseCase,
    printFiscalCupomUseCase,
    generateFiscalPdfUseCase
  )

  // Uploads
  const storageProvider = new LocalStorageProvider()
  const uploadFileUseCase = new UploadFileUseCase(storageProvider)
  const uploadController = new UploadController(uploadFileUseCase)

  // Finance
  const monthlyAccountController = new MonthlyAccountController(db)
  const expenseController = new ExpenseController(db, uploadFileUseCase)

  return {
    notifySyncedOrderStatus,
    // Os consumidores de fila sobem fora daqui (`startQueueWorkers`): no processo da API ou no
    // serviço worker, conforme o ambiente. O container só entrega o que eles precisam.
    queueWorkerDependencies: {
      database: db,
      websocketHub: wsHub,
      botMessages,
      createOrderUseCase,
      updateOrderStatusUseCase,
      metaWhatsAppModules,
      documentIngestionEnabled: Boolean(objectStorage),
    },
    cache,
    menuController,
    catalogController,
    sectionController,
    ingredientController,
    stockBatchController,
    stockMovementController,
    authController,
    orderController,
    orderReferenceDataController,
    kitchenController,
    deliveryController,
    cashierController,
    dashboardController,
    reportsController,
    settingsController,
    brandingController,
    deliveryFeeController,
    botController,
    orderIssueController,
    agendaController,
    webhookController,
    whatsAppInboundController,
    paymentController,
    expireStaleCharges,
    previewInboundController,
    previewMediaController,
    customerController,
    addressController,
    tableController,
    staffController,
    roleController,
    conversationController,
    whatsAppSettingsController,
    fiscalController,
    monthlyAccountController,
    expenseController,
    uploadController,
  }
}
