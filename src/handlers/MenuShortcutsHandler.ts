class MenuShortcutsHandler extends BaseHandler {
  async handle(): Promise<boolean> {
    if (expectingRawInput) return false;

    if (texto === '1' || texto.includes('cardapio') || texto.includes('cardápio') || texto.includes('menu')) {
      newState = BotState.ORDERING_CAT;
      respostas.push(categoryList('order'));
      return true;
    }

    if (texto === '2' || (texto.includes('pedido') && texto !== 'meu pedido' && !texto.startsWith('meus pedido')) || texto.includes('pedir')) {
      newState = BotState.ORDERING_CAT;
      respostas.push(categoryList('order'));
      return true;
    }

    if ((texto === '3' || texto.includes('reserva') || texto.includes('reservar'))
        && ![BotState.RESERVING as string, BotState.CONFIRMING_RESERVATION as string].includes(currentState)) {
      newState = BotState.RESERVING;
      respostas.push(MessagesConstants.RESERVA_SOLICITAR);
      return true;
    }

    return false;
  }
}
