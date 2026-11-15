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
import { AuthGuard, HomeRoute, PermissionGate } from '@/components/layout/RoleGuard'
import { AccessDeniedBanner } from '@/components/layout/AccessDeniedBanner'
import { PWAInstallBanner } from '@/components/pwa/PWAInstallBanner'
import { useEffect } from 'react'
import { AppFooter } from '@/components/brand/AppFooter'
import { useAuthStore } from '@/stores/authStore'
import { useBrandingStore } from '@/stores/brandingStore'

// `h-screen` e não `min-h-screen`: com altura só mínima, nenhum filho tem teto contra o qual rolar,
// o `overflow-y-auto` do main nunca entra em ação e quem estica é a página inteira. `min-w-0` pelo
// mesmo motivo no eixo horizontal — sem ele, uma tabela larga alarga o layout todo em vez de rolar
// dentro do próprio contêiner. O wrapper `min-h-full flex flex-col` com o conteúdo em `flex-1`
// empurra o rodapé para o fim da tela quando a página tem pouco conteúdo; com conteúdo longo, ele
// fica depois do conteúdo, como antes.
function AppLayout() {
  return (
    <div className="flex h-screen overflow-hidden">
      <MobileNav />
      <Sidebar />
      <main className="flex-1 min-w-0 overflow-y-auto pt-14 md:pt-0">
        <div className="flex min-h-full flex-col">
          <div className="flex-1">
            <AccessDeniedBanner />
            <Outlet />
          </div>
          <AppFooter />
        </div>
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
          <Route path="/" element={<HomeRoute dashboard={<DashboardPage />} />} />
          <Route
            path="/kitchen"
            element={
              <PermissionGate>
                <KitchenPage />
              </PermissionGate>
            }
          />
          <Route
            path="/delivery"
            element={
              <PermissionGate>
                <DeliveryPage />
              </PermissionGate>
            }
          />
          <Route
            path="/cashier"
            element={
              <PermissionGate>
                <CashierPage />
              </PermissionGate>
            }
          />
          <Route
            path="/orders"
            element={
              <PermissionGate>
                <OrdersPage />
              </PermissionGate>
            }
          />
          <Route
            path="/agenda"
            element={
              <PermissionGate>
                <AgendaPage />
              </PermissionGate>
            }
          />
          <Route
            path="/orders/new"
            element={
              <PermissionGate>
                <CreateOrderPage />
              </PermissionGate>
            }
          />
          <Route
            path="/orders/:id"
            element={
              <PermissionGate>
                <OrderDetailPage />
              </PermissionGate>
            }
          />
          <Route
            path="/conversations"
            element={
              <PermissionGate>
                <ConversationsPage />
              </PermissionGate>
            }
          />
          <Route
            path="/documents"
            element={
              <PermissionGate>
                <DocumentsPage />
              </PermissionGate>
            }
          />
          <Route
            path="/messages"
            element={
              <PermissionGate>
                <MessagesPage />
              </PermissionGate>
            }
          />
          <Route
            path="/fiscal"
            element={
              <PermissionGate>
                <FiscalDocumentsPage />
              </PermissionGate>
            }
          />
          <Route
            path="/tables"
            element={
              <PermissionGate>
                <TablesPage />
              </PermissionGate>
            }
          />
          <Route
            path="/customers"
            element={
              <PermissionGate>
                <CustomersPage />
              </PermissionGate>
            }
          />
          <Route
            path="/staff"
            element={
              <PermissionGate>
                <StaffPage />
              </PermissionGate>
            }
          />
          <Route
            path="/roles"
            element={
              <PermissionGate>
                <RolesPage />
              </PermissionGate>
            }
          />
          <Route
            path="/catalog"
            element={
              <PermissionGate>
                <CatalogPage />
              </PermissionGate>
            }
          />
          <Route
            path="/reports"
            element={
              <PermissionGate>
                <ReportsPage />
              </PermissionGate>
            }
          />
          <Route
            path="/settings"
            element={
              <PermissionGate>
                <SettingsPage />
              </PermissionGate>
            }
          />
          <Route
            path="/finance"
            element={
              <PermissionGate>
                <FinancePage />
              </PermissionGate>
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
