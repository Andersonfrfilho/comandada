class OrderingHandler extends BaseHandler {
  async handle(): Promise<boolean> {
    if (currentState === BotState.BROWSING_CATEGORIES || currentState === BotState.ORDERING_CAT) {
      return this._handleCategories();
    }
    if (currentState === BotState.BROWSING_ITEMS || currentState === BotState.ORDERING_ITEMS) {
      return this._handleItems();
    }
    if (currentState === BotState.AWAITING_SIZE) {
      return this._handleSize();
    }
    if (currentState === BotState.AWAITING_QTY) {
      return this._handleQuantity();
    }
    if (currentState === BotState.AWAITING_MORE) {
      return this._handleMore();
    }
    if (currentState === BotState.AWAITING_ITEM_NOTE) {
      return this._handleNote();
    }
    return false;
  }

  private _handleCategories(): boolean {
    const catInput = texto.replace(/^(order_cat:|cat:)/, '');
    if (catInput === 'back' || texto === '0' || texto === 'voltar') {
      newState = BotState.START;
      respostas.push(mainMenu());
      return true;
    }

    const allCategories = [...new Set(products.map((product: Product) => product.category || 'Outros'))] as string[];
    const foundCategory = allCategories.find((category: string) => category.toLowerCase() === catInput.toLowerCase());

    if (foundCategory) {
      newCart.browse_category = foundCategory;
      newState = BotState.ORDERING_ITEMS;
      respostas.push(itemsList(foundCategory, 'order', 0));
    } else {
      respostas.push(categoryList('order'));
    }
    return true;
  }

  private _handleItems(): boolean {
    const currentCategory = newCart.browse_category || '';

    if (texto === 'cat:back' || texto === 'order_cat:back' || texto === '0' || texto === 'voltar') {
      newState = BotState.ORDERING_CAT;
      respostas.push(categoryList('order'));
      return true;
    }

    if (texto.startsWith('page:')) {
      const pageParts = texto.split(':');
      const pageContext = pageParts[1];
      const pageCategoryRaw = pageParts.slice(2, -1).join(':');
      const pageNumber = parseInt(pageParts[pageParts.length - 1]);
      const resolvedCategory = products.map((product: Product) => product.category || 'Outros')
        .find((category: string) => category.toLowerCase() === pageCategoryRaw.toLowerCase()) || pageCategoryRaw;
      respostas.push(itemsList(resolvedCategory, pageContext, pageNumber));
      return true;
    }

    const allEntries = menuEntries(currentCategory);
    const PAGE_SIZE = 9;
    const currentPage = newCart.browse_page || 0;
    const pageStart = currentPage * PAGE_SIZE;

    if (texto === 'próxima' || texto === 'proxima' || texto === 'próximo' || texto === 'proximo') {
      if (allEntries.length > pageStart + PAGE_SIZE) {
        newCart.browse_page = currentPage + 1;
        respostas.push(itemsList(currentCategory, 'order', currentPage + 1));
      } else {
        respostas.push(itemsList(currentCategory, 'order', 0));
      }
      return true;
    }

    const itemNumber = parseInt(texto);
    const selectedEntry = !isNaN(itemNumber) ? allEntries[itemNumber - 1] : undefined;
    if (!selectedEntry) {
      respostas.push(itemsList(currentCategory, 'order', currentPage));
      return true;
    }
    newCart.browse_page = 0;
    if (selectedEntry.variants.length > 1) {
      newCart.pending_group = selectedEntry.product.variant_group || '';
      newState = BotState.AWAITING_SIZE;
      respostas.push(variantMenu(selectedEntry));
      return true;
    }
    this._askQuantity(selectedEntry.product);
    return true;
  }

  private _askQuantity(selectedProduct: Product): void {
    newCart.pending_item_id = selectedProduct.id;
    newCart.pending_item_name = selectedProduct.name;
    newCart.pending_group = '';
    newState = BotState.AWAITING_QTY;
    const descriptionText = selectedProduct.description ? '\n\n_' + selectedProduct.description + '_' : '';
    respostas.push({
      type: 'buttons',
      body: MessagesConstants.PRODUTO_DETALHE(selectedProduct.name, fmtBRL(selectedProduct.price), descriptionText),
      buttons: [
        { id: 'qty:1', title: '✅ Adicionar (1un)' },
        { id: 'qty:more', title: '✏️ Outra qtd' },
        { id: 'item:back', title: '↩️ Voltar' },
      ],
    });
  }

  private _handleSize(): boolean {
    const variants = products.filter((product: Product) => !!newCart.pending_group && product.variant_group === newCart.pending_group);
    if (texto === 'item:back' || texto === '0' || texto === 'voltar' || variants.length === 0) {
      newCart.pending_group = '';
      newState = BotState.ORDERING_ITEMS;
      respostas.push(itemsList(newCart.browse_category || '', 'order', 0));
      return true;
    }
    const normalize = (value: string) => value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const chosenId = texto.startsWith('size:') ? texto.slice('size:'.length) : '';
    const chosenIndex = parseInt(texto) - 1;
    const chosen = variants.find((variant: Product) => String(variant.id) === chosenId)
      || variants[chosenIndex]
      || variants.find((variant: Product) => !!variant.variant_label && normalize(texto).includes(normalize(variant.variant_label)));
    if (!chosen) {
      respostas.push(MessagesConstants.TAMANHO_INVALIDO);
      respostas.push(variantMenu({ product: variants[0], variants, title: variantBaseName(variants[0]) }));
      return true;
    }
    this._askQuantity(chosen);
    return true;
  }

  private _handleQuantity(): boolean {
    if (texto === 'item:back') {
      newState = BotState.ORDERING_ITEMS;
      respostas.push(itemsList(newCart.browse_category || '', 'order', newCart.browse_page || 0));
      return true;
    }

    if (texto === 'qty:more') {
      respostas.push(MessagesConstants.QTD_SOLICITAR);
      return true;
    }

    let quantity: number | null = null;
    if (texto.startsWith('qty:')) {
      quantity = parseInt(texto.replace('qty:', ''));
    } else {
      const parsed = parseInt(texto);
      if (!isNaN(parsed) && parsed >= 1 && parsed <= 99) quantity = parsed;
    }

    if (!quantity || quantity < 1) {
      respostas.push({
        type: 'buttons',
        body: MessagesConstants.QTD_INVALIDA,
        buttons: [{ id: 'qty:1', title: '✅ Adicionar (1un)' }, { id: 'item:back', title: '↩️ Voltar' }],
      });
      return true;
    }

    const foundProduct = products.find((product: Product) => String(product.id) === String(newCart.pending_item_id));
    if (!foundProduct) {
      newState = BotState.START;
      respostas.push(mainMenu());
      return true;
    }

    const existingItem = newCart.items.find((cartItem: CartItem) => cartItem.id === foundProduct.id);
    if (existingItem) {
      existingItem.qty += quantity;
    } else {
      newCart.items.push({ id: foundProduct.id, name: foundProduct.name, qty: quantity, price: Number(foundProduct.price), menuIdx: products.indexOf(foundProduct) + 1 });
    }
    newCart.pending_item_id = null;
    newCart.pending_item_name = '';
    newCart.last_item_id = foundProduct.id;

    const { lines: cartLines, total } = cartSummary(newCart.items);
    newState = BotState.AWAITING_MORE;
    respostas.push(this._moreButtons(
      MessagesConstants.ITEM_ADICIONADO(foundProduct.name, quantity)
        + MessagesConstants.CARRINHO_ATUAL + cartLines.join('\n')
        + MessagesConstants.TOTAL_PARCIAL(fmtBRL(total))
        + MessagesConstants.ADICIONAR_MAIS_OU_FINALIZAR
    ));
    return true;
  }

  // Depois de adicionar: mais itens, observação para o item que acabou de entrar, ou finalizar.
  private _moreButtons(body: string): OutgoingMessage {
    const buttons = [{ id: '__add_more__', title: '➕ Adicionar mais' }];
    if (newCart.last_item_id) buttons.push({ id: '__item_note__', title: MessagesConstants.OBSERVACAO_BOTAO });
    buttons.push({ id: 'finalizar', title: '✅ Finalizar' });
    return { type: 'buttons', body, buttons };
  }

  private _lastItem(): CartItem | undefined {
    return newCart.items.find((cartItem: CartItem) => cartItem.id === newCart.last_item_id);
  }

  private _handleNote(): boolean {
    const item = this._lastItem();
    newState = BotState.AWAITING_MORE;
    const raw = rawText.trim();
    const skipped = ['pular', 'nao', 'não', 'n', '-', '0', 'voltar'].includes(texto.trim());
    if (!item || skipped || !raw) {
      respostas.push(this._moreButtons(MessagesConstants.OBSERVACAO_PULADA + MessagesConstants.ADICIONAR_MAIS_OU_FINALIZAR));
      return true;
    }
    item.note = raw.slice(0, 140);
    respostas.push(this._moreButtons(MessagesConstants.OBSERVACAO_ANOTADA(item.name, item.note) + MessagesConstants.ADICIONAR_MAIS_OU_FINALIZAR));
    return true;
  }

  private _handleMore(): boolean {
    if (texto === '__item_note__') {
      const item = this._lastItem();
      if (item) {
        newState = BotState.AWAITING_ITEM_NOTE;
        respostas.push(MessagesConstants.OBSERVACAO_PERGUNTA(item.name));
        return true;
      }
    }

    if (texto === '__add_more__') {
      const savedCategory = newCart.browse_category;
      newState = savedCategory ? BotState.ORDERING_ITEMS : BotState.ORDERING_CAT;
      respostas.push(savedCategory ? itemsList(savedCategory, 'order', 0) : categoryList('order'));
      return true;
    }

    if (texto === 'finalizar') {
      const { lines, total } = cartSummary(newCart.items);
      const minOrder = minOrderValue;
      if (minOrder > 0 && total < minOrder) {
        respostas.push(MessagesConstants.ORDEM_MINIMO_ADDMORE(fmtBRL(minOrder), fmtBRL(total)));
        newState = BotState.AWAITING_MORE;
        respostas.push({ type: 'buttons', body: MessagesConstants.ADICIONAR_MAIS_MINIMO, buttons: [{ id: '__add_more__', title: '➕ Adicionar mais' }] });
      } else {
        newState = BotState.CONFIRMING;
        respostas.push(confirmBtn(MessagesConstants.CONFIRMAR_PEDIDO(lines.join('\n'), fmtBRL(total))));
      }
      return true;
    }

    respostas.push(this._moreButtons(MessagesConstants.ADICIONAR_MAIS_PERGUNTA));
    return true;
  }
}
