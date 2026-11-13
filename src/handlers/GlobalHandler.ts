class GlobalHandler extends BaseHandler {
  async handle(): Promise<boolean> {
    if (texto !== 'sair' && texto !== 'cancelar') return false;
    newState = BotState.START;
    newCart = CartConstants.EMPTY();
    newReservationTemp = {};
    respostas.push(MessagesConstants.ATENDIMENTO_ENCERRADO);
    return true;
  }
}
