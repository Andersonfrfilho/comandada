class GlobalHandler extends BaseHandler {
  async handle(): Promise<boolean> {
    if (texto !== 'sair' && texto !== 'cancelar') return false;
    const discardedItems = (newCart.items || []).reduce((sum: number, item: CartItem) => sum + (Number(item.qty) || 0), 0);
    const openOrder = recentOrders.find((order: RecentOrder) => (IssueConstants.OPEN_STATUSES as readonly string[]).includes(order.status));
    newState = BotState.START;
    newCart = CartConstants.EMPTY();
    newReservationTemp = {};
    respostas.push(MessagesConstants.ATENDIMENTO_ENCERRADO({
      nome: customerName ? customerName.split(' ')[0] : null,
      restaurante: estName,
      itensDescartados: discardedItems,
      pedidoAberto: openOrder ? openOrder.code.replace(/^#/, '') : null,
    }));
    return true;
  }
}
