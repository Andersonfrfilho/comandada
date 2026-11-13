class CartHandler extends BaseHandler {
  async handle(): Promise<boolean> {
    // Repeat order — sim
    if (texto === 'sim' && currentState === BotState.REPEAT_ORDER) {
      if (lastOrder && Array.isArray(lastOrder.items)) {
        const items: CartItem[] = lastOrder.items.map((orderItem: OrderItem) => {
          const product = products.find((prod: Product) => prod.id === orderItem.id);
          return product ? { id: product.id, name: product.name, qty: orderItem.qty, price: Number(product.price), menuIdx: products.indexOf(product) + 1 } : null;
        }).filter(Boolean) as CartItem[];
        newCart.items = items;
        newState = BotState.ORDERING;
        const { lines, total } = cartSummary(items);
        respostas.push(MessagesConstants.PEDIDO_REPETIDO + lines.join('\n') + '\n\n*Total: R$ ' + fmtBRL(total) + '*' + MessagesConstants.PEDIDO_REPETIDO_SUFFIX);
      } else {
        newState = BotState.START;
        respostas.push(MessagesConstants.PEDIDO_REPETIDO_NAO_ENCONTRADO);
      }
      return true;
    }

    // Repeat order — não
    if ((texto === 'não' || texto === 'nao') && currentState === BotState.REPEAT_ORDER) {
      newState = BotState.START;
      newCart = CartConstants.EMPTY();
      respostas.push(MessagesConstants.REPEAT_ORDER_RECUSA);
      respostas.push(mainMenu());
      return true;
    }

    // Qualquer outro texto em repeat_order
    if (currentState === BotState.REPEAT_ORDER) {
      respostas.push(yesNo(MessagesConstants.REPEAT_ORDER_PROMPT));
      return true;
    }

    // Ver carrinho
    if (texto === 'carrinho') {
      if (newCart.items.length === 0) {
        respostas.push(MessagesConstants.CARRINHO_VAZIO);
      } else {
        const { lines, total } = cartSummary(newCart.items);
        respostas.push(MessagesConstants.CARRINHO_RESUMO_PREFIX + lines.join('\n') + '\n\n*Total: R$ ' + fmtBRL(total) + '*' + MessagesConstants.CARRINHO_RESUMO_SUFFIX);
      }
      return true;
    }

    // Finalizar
    if (texto === 'finalizar') {
      if (newCart.items.length === 0) {
        respostas.push(MessagesConstants.CARRINHO_VAZIO);
      } else {
        const { lines, total } = cartSummary(newCart.items);
        const minOrder = minOrderValue;
        if (minOrder > 0 && total < minOrder) {
          respostas.push(MessagesConstants.VALOR_MINIMO(fmtBRL(minOrder), fmtBRL(total)));
        } else {
          newState = BotState.CONFIRMING;
          respostas.push(confirmBtn(MessagesConstants.CONFIRMAR_PEDIDO(lines.join('\n'), fmtBRL(total))));
        }
      }
      return true;
    }

    // Confirmar pedido
    if ((texto === 'confirmar' || texto === 'sim') && currentState === BotState.CONFIRMING) {
      newCart.scheduled_date = '';
      newCart.scheduled_time = '';
      if (scheduleSlots.length > 0) {
        newState = BotState.AWAITING_WHEN;
        respostas.push(whenBtn());
      } else {
        startCheckout();
      }
      return true;
    }

    return false;
  }
}
