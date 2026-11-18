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
        // Mesmos botões de depois de adicionar um item: Adicionar mais / Editar carrinho / Finalizar.
        newState = BotState.AWAITING_MORE;
        const { lines, total } = cartSummary(items);
        respostas.push(moreItemsButtons(
          MessagesConstants.PEDIDO_REPETIDO + lines.join('\n')
            + MessagesConstants.TOTAL_PARCIAL(fmtBRL(total))
            + MessagesConstants.ADICIONAR_MAIS_OU_FINALIZAR
        ));
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
        newState = BotState.AWAITING_MORE;
        respostas.push(moreItemsButtons(
          MessagesConstants.CARRINHO_RESUMO_PREFIX + lines.join('\n')
            + MessagesConstants.TOTAL_PARCIAL(fmtBRL(total))
            + MessagesConstants.ADICIONAR_MAIS_OU_FINALIZAR
        ));
      }
      return true;
    }

    // Finalizar
    if (texto === 'finalizar') {
      if (newCart.items.length === 0) {
        respostas.push(MessagesConstants.CARRINHO_VAZIO);
      } else {
        const { total } = cartSummary(newCart.items);
        const minOrder = minOrderValue;
        if (minOrder > 0 && total < minOrder) {
          respostas.push(MessagesConstants.VALOR_MINIMO(fmtBRL(minOrder), fmtBRL(total)));
        } else {
          showOrderConfirmation();
        }
      }
      return true;
    }

    // Confirmar pedido
    if ((texto === 'confirmar' || texto === 'sim') && currentState === BotState.CONFIRMING) {
      // Agendamento já foi escolhido na lista de categorias; sem ele, o pedido é para agora.
      startCheckout();
      return true;
    }

    return false;
  }
}
