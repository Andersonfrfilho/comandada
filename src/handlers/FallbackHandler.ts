class FallbackHandler extends BaseHandler {
  async handle(): Promise<boolean> {
    const textLines = texto.split(/[\n,+]/).map((line: string) => line.trim()).filter(Boolean);
    const parsedItems: CartItem[] = [];
    const unrecognizedLines: string[] = [];

    for (const line of textLines) {
      const indexQtyMatch = line.match(/^(\d+)\s*[xX×]\s*(\d+)$/);
      if (indexQtyMatch) {
        const productIndex = parseInt(indexQtyMatch[1]) - 1;
        const quantity = parseInt(indexQtyMatch[2]);
        if (quantity < 1) { unrecognizedLines.push(line); continue; }
        if (productIndex >= 0 && products && productIndex < products.length) {
          const product = products[productIndex];
          parsedItems.push({ id: product.id, name: product.name, qty: quantity, price: Number(product.price), menuIdx: productIndex + 1 });
        } else { unrecognizedLines.push(line); }
        continue;
      }

      const nameQtyMatch = line.match(/^(.+?)\s*[xX×]\s*(\d+)$/);
      if (nameQtyMatch) {
        const normalize = (source: string) => source.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
        const searchTerm = normalize(nameQtyMatch[1].trim());
        const quantity = parseInt(nameQtyMatch[2]);
        const foundProduct = products && products.find((product: Product) => normalize(product.name).includes(searchTerm));
        if (foundProduct && quantity >= 1) {
          parsedItems.push({ id: foundProduct.id, name: foundProduct.name, qty: quantity, price: Number(foundProduct.price), menuIdx: products.indexOf(foundProduct) + 1 });
        } else { unrecognizedLines.push(line); }
        continue;
      }

      const numberOnlyMatch = line.match(/^(\d+)$/);
      if (numberOnlyMatch) {
        const productNumber = parseInt(numberOnlyMatch[1]);
        if (productNumber >= 1 && products && productNumber <= products.length) {
          const product = products[productNumber - 1];
          parsedItems.push({ id: product.id, name: product.name, qty: 1, price: Number(product.price), menuIdx: productNumber });
        } else { unrecognizedLines.push(line); }
      } else { unrecognizedLines.push(line); }
    }

    if (parsedItems.length > 0) {
      // Desduplicar itens da mesma mensagem
      const dedupedItems: CartItem[] = [];
      for (const parsedItem of parsedItems) {
        const existingInDeduped = dedupedItems.find((deduped: CartItem) => deduped.id === parsedItem.id);
        if (existingInDeduped) { existingInDeduped.qty += parsedItem.qty; } else { dedupedItems.push({ ...parsedItem }); }
      }
      // Mergear com carrinho existente
      const hadItemsBefore = newCart.items.length > 0;
      for (const dedupedItem of dedupedItems) {
        const existingInCart = newCart.items.find((cartItem: CartItem) => cartItem.id === dedupedItem.id);
        if (existingInCart) { existingInCart.qty += dedupedItem.qty; } else { newCart.items.push(dedupedItem); }
      }
      newState = BotState.ORDERING;

      const addedLines = dedupedItems.map((dedupedItem: CartItem) =>
        '• [' + (dedupedItem.menuIdx || '') + '] ' + dedupedItem.name + ' — R$ ' + fmtBRL(dedupedItem.price) + ' × ' + dedupedItem.qty + ' — R$ ' + fmtBRL(dedupedItem.price * dedupedItem.qty)
      ).join('\n');
      const { lines: cartLines, total } = cartSummary(newCart.items);

      let msg = MessagesConstants.ADICIONAR_TEXTO + addedLines;
      if (hadItemsBefore) {
        msg += MessagesConstants.CARRINHO_ATUAL + cartLines.join('\n') + '\n' + MessagesConstants.TOTAL_LINE_SIMPLES(fmtBRL(total));
      } else {
        msg += MessagesConstants.TOTAL_PARCIAL(fmtBRL(total));
      }
      if (unrecognizedLines.length > 0) msg += MessagesConstants.NAO_RECONHECIDO(unrecognizedLines.join(', '));
      msg += MessagesConstants.INSTRUCOES_ORDERING;
      respostas.push(msg);
      return true;
    }

    if (currentState === BotState.START) {
      respostas.push(msgWelcome);
      respostas.push(mainMenu());
    } else {
      respostas.push(MessagesConstants.NAO_ENTENDI);
    }
    return true;
  }
}
