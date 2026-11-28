import { BRANDING_SETTING_KEYS } from '@/constants/branding'

export type SettingFieldType = 'text' | 'tel' | 'url' | 'number' | 'boolean' | 'color' | 'time' | 'days'

export type SettingSectionKey = 'marca' | 'estabelecimento' | 'operacao' | 'funcionalidades' | 'outros'

export interface SettingField {
  key: string
  label: string
  type: SettingFieldType
  section: SettingSectionKey
  description?: string
  placeholder?: string
  /** Texto fixo dentro do campo: "R$" antes do valor, "min" depois. */
  prefix?: string
  suffix?: string
  /** Ocupa a linha inteira na grade de duas colunas. */
  wide?: boolean
  /** Campo curto: fica lado a lado com o vizinho também no celular. */
  compact?: boolean
  /** Fica dentro de "Ajuste fino", fechado por padrão. */
  advanced?: boolean
  step?: string
}

export interface SettingSection {
  key: SettingSectionKey
  title: string
  description: string
}

export const STOCK_ENABLED_SETTING_KEY = 'stock.enabled'

export const SETTING_SECTIONS: SettingSection[] = [
  { key: 'marca', title: 'Marca', description: 'Como o painel aparece para a equipe e para quem abre o login.' },
  { key: 'estabelecimento', title: 'Dados do restaurante', description: 'Aparecem na saudação do WhatsApp e no cardápio online.' },
  { key: 'operacao', title: 'Horário e pedidos', description: 'Quando o restaurante atende e as regras de cada pedido.' },
  { key: 'funcionalidades', title: 'O que o bot aceita', description: 'Formas de pedido que o bot e o cardápio online oferecem.' },
  { key: 'outros', title: 'Outros', description: 'Ajustes que quase nunca mudam.' },
]

export const SETTING_FIELDS: SettingField[] = [
  { key: BRANDING_SETTING_KEYS.name, label: 'Nome exibido no painel', type: 'text', section: 'marca', wide: true, description: 'Aparece no login, no menu, na aba do navegador e no rodapé' },
  { key: BRANDING_SETTING_KEYS.primaryColor, label: 'Cor principal', type: 'color', section: 'marca', wide: true, description: 'Botões, destaques e menu ativo usam esta cor' },
  { key: BRANDING_SETTING_KEYS.domains, label: 'Domínios do painel', type: 'text', section: 'marca', wide: true, placeholder: 'painel.seurestaurante.com.br', description: 'Separados por vírgula. Quem abrir o painel por um destes endereços já vê a sua marca no login' },

  { key: 'establishment_name', label: 'Nome do estabelecimento', type: 'text', section: 'estabelecimento' },
  { key: 'whatsapp_number', label: 'Número WhatsApp', type: 'tel', section: 'estabelecimento', placeholder: '5511999999999', description: 'Com DDI e DDD, só números' },
  { key: 'establishment_address', label: 'Endereço completo', type: 'text', section: 'estabelecimento', wide: true, placeholder: 'Rua, número e bairro', description: 'Aparece na saudação do WhatsApp com o pin no mapa' },
  { key: 'establishment_city', label: 'Cidade', type: 'text', section: 'estabelecimento', placeholder: 'Franca - SP', description: 'Ajuda a achar o ponto certo no mapa' },
  { key: 'establishment_instagram', label: 'Instagram', type: 'text', section: 'estabelecimento', placeholder: '@seurestaurante', description: 'Vira link na saudação do WhatsApp' },
  { key: 'establishment_website', label: 'Site ou cardápio online', type: 'url', section: 'estabelecimento', wide: true, placeholder: 'https://', description: 'Vira link na saudação do WhatsApp' },
  { key: 'establishment_lat', label: 'Latitude', type: 'text', section: 'estabelecimento', advanced: true, placeholder: '-20.5386', description: 'Só se o pin calculado pelo endereço sair no lugar errado', compact: true },
  { key: 'establishment_lng', label: 'Longitude', type: 'text', section: 'estabelecimento', advanced: true, placeholder: '-47.4008', compact: true },

  { key: 'opening_time', label: 'Abre às', type: 'time', section: 'operacao', compact: true },
  { key: 'closing_time', label: 'Fecha às', type: 'time', section: 'operacao', compact: true },
  { key: 'working_days', label: 'Dias de funcionamento', type: 'days', section: 'operacao', wide: true },
  { key: 'min_order_value', label: 'Pedido mínimo', type: 'number', section: 'operacao', prefix: 'R$', step: '0.01', placeholder: '0,00', description: 'O bot não fecha pedido abaixo deste valor. Vazio ou 0: sem mínimo', compact: true },
  { key: 'default_preparation_time', label: 'Tempo de preparo padrão', type: 'number', section: 'operacao', suffix: 'min', step: '1', compact: true },
  { key: 'estimated_delivery_time', label: 'Tempo estimado de entrega', type: 'number', section: 'operacao', suffix: 'min', step: '1', compact: true },
  { key: 'estimated_pickup_time', label: 'Tempo estimado de retirada', type: 'number', section: 'operacao', suffix: 'min', step: '1', compact: true },

  { key: 'accept_orders', label: 'Aceitar pedidos', type: 'boolean', section: 'funcionalidades' },
  { key: 'accept_delivery', label: 'Aceitar entregas', type: 'boolean', section: 'funcionalidades' },
  { key: 'accept_pickup', label: 'Aceitar retirada', type: 'boolean', section: 'funcionalidades' },
  { key: 'accept_table', label: 'Aceitar pedidos na mesa', type: 'boolean', section: 'funcionalidades' },
  { key: STOCK_ENABLED_SETTING_KEY, label: 'Controlar estoque', type: 'boolean', section: 'funcionalidades', description: 'Desligado, os pedidos não baixam o estoque e as telas de estoque ficam indisponíveis' },
  { key: 'ignore_hours', label: 'Bot atende fora do horário', type: 'boolean', section: 'funcionalidades', description: 'Ligado, o bot atende a qualquer hora (útil para testes)' },

  { key: 'currency', label: 'Moeda', type: 'text', section: 'outros', placeholder: 'BRL' },
  { key: 'timezone', label: 'Fuso horário', type: 'text', section: 'outros', placeholder: 'America/Sao_Paulo' },
  { key: 'expiry_alert_days', label: 'Alerta de validade do estoque', type: 'number', section: 'outros', suffix: 'dias', step: '1', description: 'Avisa quando um lote vence dentro deste prazo' },
  { key: 'default_printer', label: 'Impressora padrão', type: 'text', section: 'outros' },
]

export const WEEK_DAYS = [
  { key: 'seg', label: 'Seg' },
  { key: 'ter', label: 'Ter' },
  { key: 'qua', label: 'Qua' },
  { key: 'qui', label: 'Qui' },
  { key: 'sex', label: 'Sex' },
  { key: 'sab', label: 'Sáb' },
  { key: 'dom', label: 'Dom' },
] as const

/** "ter, sab,qua" → ['ter', 'qua', 'sab'] na ordem da semana; o que não for dia some. */
export function parseWorkingDays(value: string): string[] {
  const chosen = new Set(value.split(',').map((day) => day.trim().toLowerCase()))
  return WEEK_DAYS.filter((day) => chosen.has(day.key)).map((day) => day.key)
}

export function toggleWorkingDay(value: string, day: string): string {
  const days = new Set(parseWorkingDays(value))
  if (days.has(day)) days.delete(day)
  else days.add(day)
  return WEEK_DAYS.filter((weekDay) => days.has(weekDay.key)).map((weekDay) => weekDay.key).join(',')
}

export function settingToString(value: unknown): string {
  if (value === null || value === undefined) return ''
  return String(value)
}

/** Valor do formulário no formato que a API grava. */
export function parseSettingValue(field: SettingField, raw: string): unknown {
  if (field.type === 'number') return raw === '' ? null : Number(raw)
  if (field.type === 'boolean') return raw === 'true'
  return raw
}
