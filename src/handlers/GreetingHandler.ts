class GreetingHandler extends BaseHandler {
  async handle(): Promise<boolean> {
    if (!greetings.includes(texto) && !texto.includes('oi!') && !texto.includes('ola!')) return false;

    newState = BotState.START;
    newCart = CartConstants.EMPTY();

    // Fecho da saudação: pedir o nome, oferecer repetir o último pedido ou o menu.
    let welcome: string = msgWelcome;
    let closing: ButtonMessage | string;
    let repeatOrderLines: string | null = null;
    if (!customerName) {
      newState = BotState.AWAITING_NAME;
      welcome = MessagesConstants.BOAS_VINDAS_NOVO(estName);
      closing = MessagesConstants.PEDIR_NOME;
    } else {
      if (!customerNameFromDB && pushNameFormatted) {
        customerNameToSave = pushNameFormatted;
        save_customer_name = true;
      }
      // Com pedido em andamento o menu já traz "Meu pedido" e "Ajuda": não oferece repetir o anterior.
      if (!hasOrderInProgress() && lastOrder && Array.isArray(lastOrder.items) && lastOrder.items.length > 0) {
        newState = BotState.REPEAT_ORDER;
        repeatOrderLines = buildRepeatOrderLines({ lastOrder, products, header: MessagesConstants.SAUDACAO_REPEAT(customerName) }).join('\n');
        closing = yesNo(MessagesConstants.SAUDACAO_REPEAT_PERGUNTA);
      } else {
        closing = mainMenu();
      }
    }

    // Meta: tudo numa mensagem só, com o logo no topo. O resumo do pedido anterior entra antes da pergunta.
    if (channelProvider !== WhatsAppProvider.EVOLUTION) {
      const closingWithOrder = repeatOrderLines && typeof closing !== 'string'
        ? { ...closing, body: repeatOrderLines + '\n\n' + closing.body }
        : closing;
      const single = singleGreetingMessage(welcome, closingWithOrder);
      if (single) {
        respostas.push(single);
        return true;
      }
    }

    // Evolution (ou texto longo demais): figurinha do logo, boas-vindas, cartão, pin e o fecho, cada um numa mensagem.
    if (brandSticker) respostas.push(brandSticker);
    respostas.push(welcome);
    respostas.push(buildCompanyInfo());
    const locationCard = establishmentLocationCard();
    if (locationCard) respostas.push(locationCard);
    if (repeatOrderLines) respostas.push(repeatOrderLines);
    respostas.push(closing);
    return true;
  }
}
