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
      newCart.browse_cat_page = 0;
      newState = BotState.START;
      respostas.push(mainMenu());
      return true;
    }

    const allCategories = menuCategories();
    const currentCatPage = newCart.browse_cat_page || 0;

    if (isNextPageCommand(texto)) {
      const nextPage = allCategories.length > (currentCatPage + 1) * categoryPageSize() ? currentCatPage + 1 : 0;
      newCart.browse_cat_page = nextPage;
      respostas.push(categoryList('order', nextPage));
      return true;
    }

    // Número digitado (lista em texto) ou id da lista interativa.
    const categoryNumber = /^\d+$/.test(texto) ? parseInt(texto, 10) : NaN;
    const foundCategory = !isNaN(categoryNumber)
      ? allCategories[categoryNumber - 1]
      : allCategories.find((category: string) => category.toLowerCase() === catInput.toLowerCase());

    if (foundCategory) {
      newCart.browse_category = foundCategory;
      newCart.browse_page = 0;
      newCart.browse_cat_page = 0;
      newState = BotState.ORDERING_ITEMS;
      respostas.push(itemsList(foundCategory, 'order', 0));
    } else {
      respostas.push(categoryList('order', currentCatPage));
    }
    return true;
  }

  private _handleItems(): boolean {
    const currentCategory = newCart.browse_category || '';

    if (texto === 'cat:back' || texto === 'order_cat:back' || texto === '0' || texto === 'voltar') {
      newState = BotState.ORDERING_CAT;
      newCart.browse_page = 0;
      newCart.browse_cat_page = 0;
      respostas.push(categoryList('order', 0, true));
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
    const currentPage = newCart.browse_page || 0;
    const pageSize = itemsPageSize();
    const pageStart = currentPage * pageSize;

    if (isNextPageCommand(texto)) {
      if (allEntries.length > pageStart + pageSize) {
        newCart.browse_page = currentPage + 1;
        respostas.push(itemsList(currentCategory, 'order', currentPage + 1));
      } else {
        newCart.browse_page = 0;
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
    newCart.pending_item_note = '';
    newState = BotState.AWAITING_QTY;
    const descriptionText = selectedProduct.description ? detailDescription(String(selectedProduct.description)) : '';
    respostas.push({
      type: 'buttons',
      body: MessagesConstants.PRODUTO_DETALHE(productEmoji(selectedProduct, newCart.browse_category), selectedProduct.name, fmtBRL(selectedProduct.price), descriptionText) + MessagesConstants.PRODUTO_VOLTAR_DICA,
      buttons: [
        { id: 'qty:1', title: MessagesConstants.QTD_ADICIONAR_UM },
        { id: 'qty:note', title: MessagesConstants.OBSERVACAO_BOTAO },
        { id: 'item:back', title: MessagesConstants.TROCAR_ITEM },
      ],
    });
  }

  /** Depois da observação: só falta a quantidade (a observação já está guardada no pedido em andamento). */
  private _quantityButtons(body: string): ButtonMessage {
    return {
      type: 'buttons',
      body,
      buttons: [
        { id: 'qty:1', title: MessagesConstants.QTD_ADICIONAR_UM },
        { id: 'item:back', title: MessagesConstants.TROCAR_ITEM },
      ],
    };
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
      respostas.push(variantMenu({ product: variants[0], variants, title: variantBaseName(variants[0]) }, newCart.browse_category));
      return true;
    }
    this._askQuantity(chosen);
    return true;
  }

  private _handleQuantity(): boolean {
    if (texto === 'item:back' || texto === '0' || texto === 'voltar') {
      this._clearPendingItem();
      newState = BotState.ORDERING_ITEMS;
      respostas.push(itemsList(newCart.browse_category || '', 'order', newCart.browse_page || 0));
      return true;
    }

    if (texto === 'qty:more') {
      respostas.push(MessagesConstants.QTD_SOLICITAR);
      return true;
    }

    // Na Evolution os botões viram texto sem número: "obs"/"observação" também abre a observação.
    if (texto === 'qty:note' || /^(com )?(obs|observa[cç][aã]o)$/.test(texto.trim())) {
      newState = BotState.AWAITING_ITEM_NOTE;
      respostas.push({
        type: 'buttons',
        body: MessagesConstants.OBSERVACAO_PERGUNTA_ITEM(newCart.pending_item_name || ''),
        buttons: [
          { id: 'note:skip', title: MessagesConstants.OBSERVACAO_SEM },
          { id: 'item:back', title: MessagesConstants.TROCAR_ITEM },
        ],
      });
      return true;
    }

    // "2 sem cebolinha": quantidade e observação de uma vez.
    const quantityWithNote = rawText.trim().match(/^(\d{1,3})\s+(?:x\s+)?([a-zà-ú].*)$/i);
    if (quantityWithNote && parseQuantityInput(quantityWithNote[1]) !== null && /[a-zà-ú]{2}/i.test(quantityWithNote[2])) {
      newCart.pending_item_note = quantityWithNote[2].trim().slice(0, 140);
    }
    const quantity = parseQuantityInput(
      texto.startsWith('qty:') ? texto.slice('qty:'.length) : (quantityWithNote ? quantityWithNote[1] : texto)
    );

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

    const note = (newCart.pending_item_note || '').trim();
    const capped = mergeCartItem(newCart.items, {
      id: foundProduct.id, name: foundProduct.name, qty: quantity, price: Number(foundProduct.price),
      menuIdx: products.indexOf(foundProduct) + 1, ...(note ? { note } : {}),
    });
    if (capped) respostas.push(MessagesConstants.QTD_LIMITE(foundProduct.name, MAX_ITEM_QTY));
    newCart.pending_item_id = null;
    newCart.pending_item_name = '';
    newCart.pending_item_note = '';
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

  private _clearPendingItem(): void {
    newCart.pending_item_id = null;
    newCart.pending_item_name = '';
    newCart.pending_item_note = '';
  }

  private _moreButtons(body: string): OutgoingMessage {
    return moreItemsButtons(body);
  }

  private _lastItem(): CartItem | undefined {
    return newCart.items.find((cartItem: CartItem) => cartItem.id === newCart.last_item_id);
  }

  private _handleNote(): boolean {
    // Observação pedida na escolha do item: guarda e volta para a quantidade.
    if (newCart.pending_item_id) {
      // Escolheu o item errado: volta para a lista da categoria sem levar nada.
      if (texto === 'item:back' || texto === 'voltar' || texto === 'trocar item') {
        this._clearPendingItem();
        newState = BotState.ORDERING_ITEMS;
        respostas.push(itemsList(newCart.browse_category || '', 'order', newCart.browse_page || 0));
        return true;
      }
      const raw = rawText.trim();
      const skipped = texto === 'note:skip' || ['pular', 'nao', 'não', 'n', '-', '0', 'sem observacao', 'sem observação'].includes(texto.trim());
      newState = BotState.AWAITING_QTY;
      if (skipped || !raw) {
        newCart.pending_item_note = '';
        respostas.push(this._quantityButtons(MessagesConstants.OBSERVACAO_PULADA_QTD));
        return true;
      }
      newCart.pending_item_note = raw.slice(0, 140);
      respostas.push(this._quantityButtons(MessagesConstants.OBSERVACAO_ITEM_ANOTADA(newCart.pending_item_name || '', newCart.pending_item_note)));
      return true;
    }
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
      const { total } = cartSummary(newCart.items);
      const minOrder = minOrderValue;
      if (minOrder > 0 && total < minOrder) {
        respostas.push(MessagesConstants.ORDEM_MINIMO_ADDMORE(fmtBRL(minOrder), fmtBRL(total)));
        newState = BotState.AWAITING_MORE;
        respostas.push({ type: 'buttons', body: MessagesConstants.ADICIONAR_MAIS_MINIMO, buttons: [{ id: '__add_more__', title: '➕ Adicionar mais' }] });
      } else {
        showOrderConfirmation();
      }
      return true;
    }

    respostas.push(this._moreButtons(MessagesConstants.ADICIONAR_MAIS_PERGUNTA));
    return true;
  }
}
