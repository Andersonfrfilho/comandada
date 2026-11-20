/** Textos da confirmação parcial do pedido (itens em falta e troca sugerida). */

export const PARTIAL_CONFIRMATION_LABELS = {
  itemsTitle: 'Itens',
  markUnavailable: 'Não tem',
  undoUnavailable: 'Tem sim',
  unavailableBadge: 'Em falta',
  substituteLabel: 'Oferecer no lugar',
  substituteNone: 'Só tirar do pedido (sem troca)',
  substitutesLoading: 'Buscando opções do mesmo tipo…',
  substitutesEmpty: 'Nenhum produto parecido ativo no cardápio.',
  pendingSummary: (count: number) => (count === 1 ? '1 item em falta' : `${count} itens em falta`),
  newTotal: 'Novo total',
  submit: 'Enviar ao cliente',
  clear: 'Desfazer',
  modalTitle: 'Enviar ao cliente pelo WhatsApp?',
  modalWarning:
    'O cliente recebe a lista agora e o pedido fica aguardando a resposta dele. Com troca, ele pode aceitar, escolher outro item do mesmo tipo ou seguir sem o item.',
  modalPreviewTitle: 'O que vai na mensagem:',
  modalConfirm: 'Enviar e aguardar',
  modalCancel: 'Voltar',
  sending: 'Enviando...',
  noneSelected: 'Marque pelo menos um item.',
  allSelected: 'Todos os itens em falta e sem troca: cancele o pedido.',
  noCustomer: 'Pedido sem cliente com WhatsApp: não dá para pedir confirmação.',
  sendFailure: 'Não foi possível enviar a mensagem.',
  waitingTitle: 'Aguardando confirmação do cliente',
  waitingSince: (time: string) => `Enviado às ${time}. O pedido atualiza aqui assim que ele responder no WhatsApp.`,
  waitingBadge: 'Aguardando cliente',
  waitingSuggested: (name: string) => `sugerido: ${name}`,
  resend: 'Mudar e reenviar',
  acceptedNote: (time: string) => `Cliente confirmou às ${time}. Itens e total já atualizados.`,
  declinedNote: (time: string) => `Cliente não quis seguir às ${time}. Pedido cancelado.`,
} as const

/** Textos de marcar item a item o que ficou pronto no detalhe do pedido (mesma marcação da Cozinha). */
export const ITEM_READY_LABELS = {
  progress: (ready: number, total: number) => `${ready}/${total} prontos`,
  allReady: 'tudo pronto',
  markAll: 'Marcar todos',
  markItem: (name: string) => `Marcar ${name} como pronto`,
  readyAt: (time: string) => `Pronto ${time}`,
  alreadyReady: 'Já marcado como pronto',
  orderReady: 'Todos os itens prontos: o pedido foi para Pronto.',
  failure: 'Não deu para marcar o item. Tente de novo.',
} as const

export const CONVERSATION_LINK_LABEL = 'Conversar com o cliente'
