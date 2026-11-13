import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom'
import { LoginPage } from '@/pages/auth/LoginPage'
import { DashboardPage } from '@/pages/dashboard/DashboardPage'
import { KitchenPage } from '@/pages/kitchen/KitchenPage'
import { DeliveryPage } from '@/pages/delivery/DeliveryPage'
import { CashierPage } from '@/pages/cashier/CashierPage'
import { OrderDetailPage } from '@/pages/orders/OrderDetailPage'
import { OrdersPage } from '@/pages/orders/OrdersPage'
import { AgendaPage } from '@/pages/agenda/AgendaPage'
import { CreateOrderPage } from '@/pages/orders/CreateOrderPage'
import { ConversationsPage } from '@/pages/conversations/ConversationsPage'
import { DocumentsPage } from '@/pages/conversations/DocumentsPage'
import { MessagesPage } from '@/pages/messages/MessagesPage'
import { CustomersPage } from '@/pages/customers/CustomersPage'
import { TablesPage } from '@/pages/tables/TablesPage'
import { StaffPage } from '@/pages/staff/StaffPage'
import { RolesPage } from '@/pages/staff/RolesPage'
import { CatalogPage } from '@/pages/catalog/CatalogPage'
import { ReportsPage } from '@/pages/reports/ReportsPage'
import { SettingsPage } from '@/pages/settings/SettingsPage'
import { FiscalDocumentsPage } from '@/pages/fiscal/FiscalDocumentsPage'
import { FinancePage } from '@/pages/finance/FinancePage'
import { ChangePasswordPage } from '@/pages/auth/ChangePasswordPage'
import { ComandaConfirmPage } from '@/pages/comanda/ComandaConfirmPage'
import { CustomerInvoicePage } from '@/pages/public/CustomerInvoicePage'
import { Sidebar } from '@/components/layout/Sidebar'
import { MobileNav } from '@/components/layout/MobileNav'
import { AuthGuard, RoleGuard } from '@/components/layout/RoleGuard'
import { AccessDeniedBanner } from '@/components/layout/AccessDeniedBanner'
import { PWAInstallBanner } from '@/components/pwa/PWAInstallBanner'
import { ROLES } from '@/constants/navigation'
import { useEffect } from 'react'
import { AppFooter } from '@/components/brand/AppFooter'
import { useAuthStore } from '@/stores/authStore'
import { useBrandingStore } from '@/stores/brandingStore'

// `h-screen` e não `min-h-screen`: com altura só mínima, nenhum filho tem teto contra o qual rolar,
// o `overflow-y-auto` do main nunca entra em ação e quem estica é a página inteira. `min-w-0` pelo
// mesmo motivo no eixo horizontal — sem ele, uma tabela larga alarga o layout todo em vez de rolar
// dentro do próprio contêiner.
function AppLayout() {
  return (
    <div className="flex h-screen overflow-hidden">
      <MobileNav />
      <Sidebar />
      <main className="flex-1 min-w-0 overflow-y-auto pt-14 md:pt-0">
        <AccessDeniedBanner />
        <Outlet />
        <AppFooter />
      </main>
    </div>
  )
}

// Marca do domínio antes do login; marca do restaurante de quem entrou depois.
function useBranding(): void {
  const accessToken = useAuthStore((state) => state.accessToken)
  const loadForHost = useBrandingStore((state) => state.loadForHost)
  const loadForEstablishment = useBrandingStore((state) => state.loadForEstablishment)
  useEffect(() => {
    if (accessToken) void loadForEstablishment(accessToken)
    else void loadForHost()
  }, [accessToken, loadForHost, loadForEstablishment])
}

export default function App() {
  useBranding()
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/change-password" element={<ChangePasswordPage />} />

        <Route
          element={
            <AuthGuard>
              <AppLayout />
            </AuthGuard>
          }
        >
          <Route path="/" element={<DashboardPage />} />
          <Route
            path="/kitchen"
            element={
              <RoleGuard allowedRoles={[ROLES.ADMIN, ROLES.MANAGER, ROLES.KITCHEN]}>
                <KitchenPage />
              </RoleGuard>
            }
          />
          <Route
            path="/delivery"
            element={
              <RoleGuard allowedRoles={[ROLES.ADMIN, ROLES.MANAGER, ROLES.DELIVERY]}>
                <DeliveryPage />
              </RoleGuard>
            }
          />
          <Route
            path="/cashier"
            element={
              <RoleGuard allowedRoles={[ROLES.ADMIN, ROLES.MANAGER, ROLES.CASHIER]}>
                <CashierPage />
              </RoleGuard>
            }
          />
          <Route
            path="/orders"
            element={
              <RoleGuard allowedRoles={[ROLES.ADMIN, ROLES.MANAGER, ROLES.ATTENDANT]}>
                <OrdersPage />
              </RoleGuard>
            }
          />
          <Route
            path="/agenda"
            element={
              <RoleGuard allowedRoles={[ROLES.ADMIN, ROLES.MANAGER, ROLES.ATTENDANT]}>
                <AgendaPage />
              </RoleGuard>
            }
          />
          <Route
            path="/orders/new"
            element={
              <RoleGuard allowedRoles={[ROLES.ADMIN, ROLES.MANAGER, ROLES.ATTENDANT]}>
                <CreateOrderPage />
              </RoleGuard>
            }
          />
          <Route
            path="/orders/:id"
            element={
              <RoleGuard allowedRoles={[ROLES.ADMIN, ROLES.MANAGER, ROLES.ATTENDANT]}>
                <OrderDetailPage />
              </RoleGuard>
            }
          />
          <Route
            path="/conversations"
            element={
              <RoleGuard allowedRoles={[ROLES.ADMIN, ROLES.MANAGER, ROLES.ATTENDANT]}>
                <ConversationsPage />
              </RoleGuard>
            }
          />
          <Route
            path="/documents"
            element={
              <RoleGuard allowedRoles={[ROLES.ADMIN, ROLES.MANAGER, ROLES.ATTENDANT]}>
                <DocumentsPage />
              </RoleGuard>
            }
          />
          <Route
            path="/messages"
            element={
              <RoleGuard allowedRoles={[ROLES.ADMIN, ROLES.MANAGER]}>
                <MessagesPage />
              </RoleGuard>
            }
          />
          <Route
            path="/fiscal"
            element={
              <RoleGuard allowedRoles={[ROLES.ADMIN, ROLES.MANAGER, ROLES.CASHIER]}>
                <FiscalDocumentsPage />
              </RoleGuard>
            }
          />
          <Route
            path="/tables"
            element={
              <RoleGuard allowedRoles={[ROLES.ADMIN, ROLES.MANAGER, ROLES.ATTENDANT]}>
                <TablesPage />
              </RoleGuard>
            }
          />
          <Route
            path="/customers"
            element={
              <RoleGuard allowedRoles={[ROLES.ADMIN, ROLES.MANAGER]}>
                <CustomersPage />
              </RoleGuard>
            }
          />
          <Route
            path="/staff"
            element={
              <RoleGuard allowedRoles={[ROLES.ADMIN, ROLES.MANAGER]}>
                <StaffPage />
              </RoleGuard>
            }
          />
          <Route
            path="/roles"
            element={
              <RoleGuard allowedRoles={[ROLES.ADMIN, ROLES.MANAGER]}>
                <RolesPage />
              </RoleGuard>
            }
          />
          <Route
            path="/catalog"
            element={
              <RoleGuard allowedRoles={[ROLES.ADMIN, ROLES.MANAGER]}>
                <CatalogPage />
              </RoleGuard>
            }
          />
          <Route
            path="/reports"
            element={
              <RoleGuard allowedRoles={[ROLES.ADMIN, ROLES.MANAGER]}>
                <ReportsPage />
              </RoleGuard>
            }
          />
          <Route
            path="/settings"
            element={
              <RoleGuard allowedRoles={[ROLES.ADMIN, ROLES.MANAGER]}>
                <SettingsPage />
              </RoleGuard>
            }
          />
          <Route
            path="/finance"
            element={
              <RoleGuard allowedRoles={[ROLES.ADMIN, ROLES.MANAGER]}>
                <FinancePage />
              </RoleGuard>
            }
          />
        </Route>

        {/* Rota pública — sem autenticação */}
        <Route path="/comanda/:code" element={<ComandaConfirmPage />} />
        <Route path="/nota/:token" element={<CustomerInvoicePage />} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <PWAInstallBanner />
    </BrowserRouter>
  )
}
