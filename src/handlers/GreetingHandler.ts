class GreetingHandler extends BaseHandler {
  async handle(): Promise<boolean> {
    if (!greetings.includes(texto) && !texto.includes('oi!') && !texto.includes('ola!')) return false;

    newState = BotState.START;
    newCart = CartConstants.EMPTY();

    if (!customerName) {
      newState = BotState.AWAITING_NAME;
      respostas.push(MessagesConstants.BOAS_VINDAS_NOME(estName));
    } else {
      if (!customerNameFromDB && pushNameFormatted) {
        customerNameToSave = pushNameFormatted;
        save_customer_name = true;
      }
      if (lastOrder && Array.isArray(lastOrder.items) && lastOrder.items.length > 0) {
        const lines = buildRepeatOrderLines({ lastOrder, products, header: MessagesConstants.SAUDACAO_REPEAT(customerName) });
        newState = BotState.REPEAT_ORDER;
        respostas.push(msgWelcome);
        respostas.push(lines.join('\n'));
        respostas.push(yesNo(MessagesConstants.SAUDACAO_REPEAT_PERGUNTA));
      } else {
        respostas.push(msgWelcome);
        respostas.push(mainMenu());
      }
    }
    return true;
  }
}
