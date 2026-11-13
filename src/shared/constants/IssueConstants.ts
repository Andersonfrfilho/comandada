// Menu de ajuda com o pedido. As opções dependem do momento do pedido (em andamento, entregue há
// pouco, nenhum). Os ids das categorias de problema são os mesmos que a API grava e os Relatórios
// agrupam (ORDER_ISSUE_CATEGORIES em apps/api/src/modules/issues).
const IssueConstants = {
  // Ids das opções (lista interativa: título até 24 caracteres).
  OPTION: {
    STATUS:    'ajuda_status',
    LATE:      'issue_atraso',
    CHANGE:    'ajuda_alterar',
    HUMAN:     'ajuda_atendente',
    NEW_ORDER: '2',
    MENU:      '1',
  },
  ISSUE_PREFIX: 'issue_',
  // Problemas que só fazem sentido depois que o pedido chegou.
  AFTER_DELIVERY_CATEGORIES: [
    { id: 'item_faltando', title: '➖ Faltou item' },
    { id: 'item_errado',   title: '🔄 Veio item errado' },
    { id: 'qualidade',     title: '🍽️ Qualidade da comida' },
    { id: 'entrega',       title: '🛵 Problema na entrega', deliveryOnly: true },
    { id: 'cobranca',      title: '💳 Pagamento ou troco' },
    { id: 'outro',         title: '💬 Outro problema' },
  ],
  // Status (vocabulário do bot) do pedido em andamento; "received" ainda pode ser alterado.
  OPEN_STATUSES: ['received', 'confirmed', 'preparing', 'ready', 'out_for_delivery'],
  CHANGEABLE_STATUSES: ['received', 'confirmed'],
  DONE_STATUS: 'delivered',
  // Por quantas horas depois de entregue o cliente ainda vê as opções de problema.
  AFTER_DELIVERY_HOURS: 6,
  KEYWORDS: ['problema', 'reclamar', 'reclamação', 'reclamacao', 'ajuda', 'cadê meu pedido', 'cade meu pedido', 'onde está meu pedido', 'onde esta meu pedido', 'atrasad'],
  SKIP_DETAIL: ['pular', 'nao', 'não', '-'],
  RESOLVED_ANSWERS: ['issue_resolvido', 'resolvido', 'ok', 'sim', 'obrigado', 'obrigada'],
  HUMAN_ANSWERS: ['issue_atendente', 'atendente', 'humano'],
  DESCRIPTION_MAX_LENGTH: 1000,

  MENU_BOTAO: 'Ver opções',
  MENU_SECAO: 'Opções',
  MENU_CORPO_ANDAMENTO: (code: string, status: string) => `🆘 *Ajuda com o pedido #${code}*\n${status}\n\nEscolha uma opção:`,
  MENU_CORPO_ENTREGUE: (code: string) => `🆘 *Ajuda com o pedido #${code}*\n\nAconteceu algo com o pedido? Escolha uma opção:`,
  MENU_CORPO_SEM_PEDIDO: '🆘 *Como posso ajudar?*\n\nNão encontrei pedido em andamento no seu número.',
  ROW_STATUS: '📍 Onde está meu pedido',
  ROW_LATE: '⏰ Pedido atrasado',
  ROW_CHANGE: '✏️ Alterar ou cancelar',
  ROW_HUMAN: '👤 Falar com atendente',
  ROW_NEW_ORDER: '🛒 Fazer pedido',
  ROW_MENU: '📖 Ver cardápio',

  STATUS_LINHA: (code: string, status: string, estimate: string) =>
    `🔖 *#${code}* — ${status}${estimate ? '\n   ⏱️ ' + estimate : ''}`,
  STATUS_CABECALHO: '📍 *Seus pedidos em andamento:*\n\n',
  PREVISAO: (time: string) => `Previsão: ${time}`,
  AGENDADO_PARA: (time: string) => `Agendado para ${time}`,
  PREVISAO_PASSOU: (time: string) => `A previsão era ${time}`,
  ALTERAR_PEDIDO: (code: string) => `✏️ Vou chamar a equipe para alterar ou cancelar o pedido *#${code}*. Diga aqui o que quer mudar.`,

  PEDIR_DETALHE: '✍️ Conte em poucas palavras o que aconteceu (ou responda *pular*).',
  OPCAO_INVALIDA_MENU: 'Essa opção não está disponível agora. Escolha uma das opções da lista, por favor.',
  REGISTRADO: (orderCode: string | null) =>
    `✅ *Problema registrado${orderCode ? ' no pedido #' + orderCode : ''}.* A equipe já foi avisada.`,
  RESOLVEU_PERGUNTA: 'Isso resolve por enquanto, ou prefere falar com alguém da equipe?',
  RESOLVIDO_BOTAO: '✅ Resolvido',
  ATENDENTE_BOTAO: '👤 Falar com atendente',
  OBRIGADO: 'Obrigado por avisar! 🙏 Estamos à disposição.',
} as const;
