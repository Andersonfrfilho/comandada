import type { ComponentType } from 'react'
import {
  Banknote,
  BarChart3,
  BookOpen,
  CalendarDays,
  ChefHat,
  ClipboardList,
  FileText,
  FolderOpen,
  LayoutDashboard,
  MessageCircle,
  Send,
  Settings,
  Shield,
  Truck,
  Users,
  UsersRound,
  UtensilsCrossed,
  Wallet,
} from 'lucide-react'
import { hasPermission, type Permission, type RequiredPermission } from '@/lib/permissions'

interface NavItem {
  to: string
  label: string
  /** Mesma permissão que a API pede para a tela funcionar; sem ela o item some e a rota redireciona. */
  permission: RequiredPermission
  icon: ComponentType<{ className?: string }>
}

interface NavSection {
  label: string
  items: NavItem[]
}

// Agrupado pelo trabalho de quem usa (tocar o salão × atender cliente × gerir a casa), não por
// qual pacote implementa a tela — quem atende não sabe nem precisa saber que Conversas vem do
// conversations-ui. Cabeçalho estático em vez de accordion: cobra um clique e esconde caminho
// sem economizar altura, já que a lista é filtrada por cargo antes de desenhar.
export const NAV_SECTIONS: NavSection[] = [
  {
    label: 'Operação',
    items: [
      { to: '/', label: 'Dashboard', permission: { resource: 'reports', action: 'read' }, icon: LayoutDashboard },
      { to: '/orders', label: 'Pedidos', permission: { resource: 'orders', action: 'write' }, icon: ClipboardList },
      { to: '/agenda', label: 'Agenda', permission: { resource: 'orders', action: 'write' }, icon: CalendarDays },
      { to: '/kitchen', label: 'Cozinha', permission: { resource: 'kitchen', action: 'read' }, icon: ChefHat },
      { to: '/delivery', label: 'Entregas', permission: { resource: 'delivery', action: 'read' }, icon: Truck },
      { to: '/tables', label: 'Mesas', permission: { resource: 'orders', action: 'write' }, icon: UtensilsCrossed },
      { to: '/cashier', label: 'Caixa', permission: { resource: 'cashier', action: 'read' }, icon: Wallet },
    ],
  },
  {
    label: 'Atendimento',
    items: [
      { to: '/conversations', label: 'Conversas', permission: { resource: 'conversations', action: 'read' }, icon: MessageCircle },
      { to: '/documents', label: 'Documentos', permission: { resource: 'conversations', action: 'read' }, icon: FolderOpen },
      { to: '/messages', label: 'Mensagens', permission: { resource: 'conversations', action: 'manage' }, icon: Send },
      { to: '/customers', label: 'Clientes', permission: { resource: 'customers', action: 'read' }, icon: Users },
    ],
  },
  {
    label: 'Gestão',
    items: [
      { to: '/catalog', label: 'Cardápio', permission: { resource: 'products', action: 'write' }, icon: BookOpen },
      { to: '/finance', label: 'Financeiro', permission: { resource: 'finance', action: 'read' }, icon: Banknote },
      { to: '/fiscal', label: 'Notas Fiscais', permission: { resource: 'fiscal', action: 'read' }, icon: FileText },
      { to: '/reports', label: 'Relatórios', permission: { resource: 'reports', action: 'read' }, icon: BarChart3 },
    ],
  },
  {
    label: 'Administração',
    items: [
      { to: '/staff', label: 'Funcionários', permission: { resource: 'users', action: 'read' }, icon: UsersRound },
      // A API exige `users:manage` aqui: quem edita cargos pode conceder permissões a si mesmo.
      { to: '/roles', label: 'Cargos', permission: { resource: 'users', action: 'manage' }, icon: Shield },
      { to: '/settings', label: 'Configurações', permission: { resource: 'settings', action: 'read' }, icon: Settings },
    ],
  },
]

// Seção sem nenhum item permitido some inteira: um cabeçalho sozinho anuncia uma área que o cargo
// não alcança. Vive aqui porque sidebar e menu mobile desenham a mesma lista.
export function visibleSectionsFor(permissions: Permission[] | undefined): NavSection[] {
  return NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => hasPermission(permissions, item.permission)),
  })).filter((section) => section.items.length > 0)
}

/** Permissão exigida por uma rota do menu (subrotas como /orders/123 herdam a do item). */
export function permissionForPath(path: string): RequiredPermission | undefined {
  const items = NAV_SECTIONS.flatMap((section) => section.items)
  const exact = items.find((item) => item.to === path)
  if (exact) return exact.permission
  return items.filter((item) => item.to !== '/' && path.startsWith(`${item.to}/`))[0]?.permission
}

/**
 * Tela inicial de quem entrou: o Dashboard para quem vê relatórios; para os outros, a primeira tela
 * do menu que o cargo alcança (cozinha cai na Cozinha, entregador em Entregas). Antes todos abriam no
 * Dashboard, que dava 403 e mostrava zeros como se fossem números reais.
 */
export function homePathFor(permissions: Permission[] | undefined): string | null {
  return visibleSectionsFor(permissions)[0]?.items[0]?.to ?? null
}
