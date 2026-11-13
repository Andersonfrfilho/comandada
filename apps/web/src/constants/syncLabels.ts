export const SYNC_LABELS = {
  online: 'Sincronizado',
  offline: 'Sem internet: trabalhando na loja',
  pending: (count: number) => `${count} ${count === 1 ? 'alteração aguardando' : 'alterações aguardando'} envio`,
  conflicts: (count: number) => `${count} ${count === 1 ? 'conflito' : 'conflitos'} para revisar`,
  cloud: 'Nuvem',
  lastSuccess: 'Última sincronização',
  never: 'nunca',
  lastError: 'Último erro',
  title: 'Sincronização com a nuvem',
  explanation:
    'A loja funciona sem internet. Tudo o que é feito aqui fica guardado e é enviado em partes quando a conexão volta.',
  conflictsTitle: 'Conflitos',
  noConflicts: 'Nenhum conflito. Loja e nuvem estão de acordo.',
  acceptRemote: 'Usar a versão recebida',
  keepLocal: 'Manter a daqui',
  retrying: 'Tentando de novo sozinho',
} as const

export const SYNC_TABLE_LABELS: Record<string, string> = {
  'public.orders': 'Pedido',
  'public.order_items': 'Item do pedido',
  'public.order_payments': 'Pagamento',
  'public.customers': 'Cliente',
  'public.products': 'Produto',
  'public.ingredients': 'Ingrediente',
  'public.stock_batches': 'Lote de estoque',
  'public.comandas': 'Comanda',
  'public.deliveries': 'Entrega',
  'public.cash_registers': 'Caixa',
  'public.cash_movements': 'Movimento de caixa',
  'public.fiscal_documents': 'Nota fiscal',
  'public.tables': 'Mesa',
}
