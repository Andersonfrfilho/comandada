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

export const ROLES = {
  ADMIN: 'Administrador',
  MANAGER: 'Gerente',
  CASHIER: 'Caixa',
  KITCHEN: 'Cozinha',
  DELIVERY: 'Entregador',
  ATTENDANT: 'Atendente',
} as const

export type Role = (typeof ROLES)[keyof typeof ROLES]

interface NavItem {
  to: string
  label: string
  roles?: Role[]
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
      { to: '/', label: 'Dashboard', icon: LayoutDashboard },
      { to: '/orders', label: 'Pedidos', roles: [ROLES.ADMIN, ROLES.MANAGER, ROLES.ATTENDANT], icon: ClipboardList },
      { to: '/agenda', label: 'Agenda', roles: [ROLES.ADMIN, ROLES.MANAGER, ROLES.ATTENDANT], icon: CalendarDays },
      { to: '/kitchen', label: 'Cozinha', roles: [ROLES.ADMIN, ROLES.MANAGER, ROLES.KITCHEN], icon: ChefHat },
      { to: '/delivery', label: 'Entregas', roles: [ROLES.ADMIN, ROLES.MANAGER, ROLES.DELIVERY], icon: Truck },
      { to: '/tables', label: 'Mesas', roles: [ROLES.ADMIN, ROLES.MANAGER, ROLES.ATTENDANT], icon: UtensilsCrossed },
      { to: '/cashier', label: 'Caixa', roles: [ROLES.ADMIN, ROLES.MANAGER, ROLES.CASHIER], icon: Wallet },
    ],
  },
  {
    label: 'Atendimento',
    items: [
      { to: '/conversations', label: 'Conversas', roles: [ROLES.ADMIN, ROLES.MANAGER, ROLES.ATTENDANT], icon: MessageCircle },
      { to: '/documents', label: 'Documentos', roles: [ROLES.ADMIN, ROLES.MANAGER, ROLES.ATTENDANT], icon: FolderOpen },
      { to: '/messages', label: 'Mensagens', roles: [ROLES.ADMIN, ROLES.MANAGER], icon: Send },
      { to: '/customers', label: 'Clientes', roles: [ROLES.ADMIN, ROLES.MANAGER], icon: Users },
    ],
  },
  {
    label: 'Gestão',
    items: [
      { to: '/catalog', label: 'Cardápio', roles: [ROLES.ADMIN, ROLES.MANAGER], icon: BookOpen },
      { to: '/finance', label: 'Financeiro', roles: [ROLES.ADMIN, ROLES.MANAGER], icon: Banknote },
      { to: '/fiscal', label: 'Notas Fiscais', roles: [ROLES.ADMIN, ROLES.MANAGER, ROLES.CASHIER], icon: FileText },
      { to: '/reports', label: 'Relatórios', roles: [ROLES.ADMIN, ROLES.MANAGER], icon: BarChart3 },
    ],
  },
  {
    label: 'Administração',
    items: [
      { to: '/staff', label: 'Funcionários', roles: [ROLES.ADMIN, ROLES.MANAGER], icon: UsersRound },
      // Só admin: a API exige `users:manage` aqui, e quem edita cargos pode
      // conceder permissões a si mesmo.
      { to: '/roles', label: 'Cargos', roles: [ROLES.ADMIN], icon: Shield },
      { to: '/settings', label: 'Configurações', roles: [ROLES.ADMIN, ROLES.MANAGER], icon: Settings },
    ],
  },
]

// Seção sem nenhum item permitido some inteira: um cabeçalho sozinho anuncia uma área que o cargo
// não alcança. Vive aqui porque sidebar e menu mobile desenham a mesma lista.
export function visibleSectionsFor(role: string | undefined): NavSection[] {
  const isAllowed = (item: NavItem): boolean =>
    !item.roles || item.roles.some((allowed) => allowed === role)

  return NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter(isAllowed),
  })).filter((section) => section.items.length > 0)
}
