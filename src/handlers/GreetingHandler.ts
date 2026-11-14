class GreetingHandler extends BaseHandler {
  async handle(): Promise<boolean> {
    if (!greetings.includes(texto) && !texto.includes('oi!') && !texto.includes('ola!')) return false;

    newState = BotState.START;
    newCart = CartConstants.EMPTY();
    // A saudação abre com a figurinha do logo do restaurante, quando ele tem logo.
    if (brandSticker) respostas.push(brandSticker);

    // Boas-vindas curta, o cartão com os dados do restaurante e o pin no mapa, cada um numa mensagem.
    const companyCard = buildCompanyInfo();
    const locationCard = establishmentLocationCard();
    const pushCompanyCard = (): void => {
      respostas.push(companyCard);
      if (locationCard) respostas.push(locationCard);
    };

    if (!customerName) {
      newState = BotState.AWAITING_NAME;
      respostas.push(MessagesConstants.BOAS_VINDAS_NOVO(estName));
      pushCompanyCard();
      respostas.push(MessagesConstants.PEDIR_NOME);
    } else {
      if (!customerNameFromDB && pushNameFormatted) {
        customerNameToSave = pushNameFormatted;
        save_customer_name = true;
      }
      respostas.push(msgWelcome);
      pushCompanyCard();
      // Com pedido em andamento o menu já traz "Meu pedido" e "Ajuda": não oferece repetir o anterior.
      if (!hasOrderInProgress() && lastOrder && Array.isArray(lastOrder.items) && lastOrder.items.length > 0) {
        const lines = buildRepeatOrderLines({ lastOrder, products, header: MessagesConstants.SAUDACAO_REPEAT(customerName) });
        newState = BotState.REPEAT_ORDER;
        respostas.push(lines.join('\n'));
        respostas.push(yesNo(MessagesConstants.SAUDACAO_REPEAT_PERGUNTA));
      } else {
        respostas.push(mainMenu());
      }
    }
    return true;
  }
}
