// Editar carrinho: o cliente escolhe uma linha do carrinho e tira ou muda a quantidade.
// Entra pelo botão "✏️ Editar carrinho" (depois de adicionar) ou "✏️ Editar" (na confirmação),
// ou digitando "editar"/"editar carrinho". Ao terminar volta para "mais alguma coisa?".
const CART_EDIT_COMMANDS: ReadonlyArray<string> = ['cart:edit', 'editar', 'editar carrinho', 'alterar carrinho', 'mudar carrinho'];
const CART_EDIT_ROW_PREFIX = 'edit:item:';

function cartEditListMessage(): ListMessage {
  const rows: ListRow[] = newCart.items.slice(0, 9).map((item: CartItem, index: number) => ({
    id: CART_EDIT_ROW_PREFIX + index,
    title: item.name,
    description: item.qty + ' x R$ ' + fmtBRL(item.price) + ' = R$ ' + fmtBRL(item.price * item.qty)
      + (item.note ? ' · obs: ' + item.note : ''),
  }));
  rows.push({ id: 'edit:back', title: MessagesConstants.EDITAR_VOLTAR_LINHA });
  return {
    type: 'list',
    body: MessagesConstants.EDITAR_ESCOLHA,
    button: MessagesConstants.EDITAR_LISTA_BOTAO,
    sections: [{ title: MessagesConstants.EDITAR_SECAO, rows }],
  };
}

class CartEditHandler extends BaseHandler {
  async handle(): Promise<boolean> {
    if (currentState === BotState.AWAITING_CART_EDIT) return this._pickLine();
    if (currentState === BotState.AWAITING_CART_EDIT_ITEM) return this._lineAction();
    if (currentState === BotState.AWAITING_CART_EDIT_QTY) return this._newQuantity();
    if (!CART_EDIT_COMMANDS.includes(texto.trim())) return false;
    if (newCart.items.length === 0) {
      respostas.push(MessagesConstants.EDITAR_SEM_ITENS);
      newState = BotState.ORDERING_CAT;
      respostas.push(categoryList('order'));
      return true;
    }
    this._openList();
    return true;
  }

  private _openList(): void {
    newCart.edit_index = null;
    newState = BotState.AWAITING_CART_EDIT;
    respostas.push(cartEditListMessage());
  }

  private _selectedLine(): CartItem | undefined {
    const index = newCart.edit_index;
    return typeof index === 'number' ? newCart.items[index] : undefined;
  }

  private _pickLine(): boolean {
    if (texto === 'edit:back' || texto === 'voltar' || texto === '0') return this._backToCart();
    const typedIndex = /^\d{1,2}$/.test(texto.trim()) ? Number(texto.trim()) - 1 : -1;
    const index = texto.startsWith(CART_EDIT_ROW_PREFIX) ? Number(texto.slice(CART_EDIT_ROW_PREFIX.length)) : typedIndex;
    const item = Number.isInteger(index) ? newCart.items[index] : undefined;
    if (!item) {
      respostas.push(cartEditListMessage());
      return true;
    }
    newCart.edit_index = index;
    newState = BotState.AWAITING_CART_EDIT_ITEM;
    respostas.push({
      type: 'buttons',
      body: MessagesConstants.EDITAR_ITEM(item.name, item.qty, item.note),
      buttons: [
        { id: 'edit:remove', title: MessagesConstants.EDITAR_REMOVER },
        { id: 'edit:qty', title: MessagesConstants.EDITAR_MUDAR_QTD },
        { id: 'edit:back', title: MessagesConstants.EDITAR_VOLTAR },
      ],
    });
    return true;
  }

  private _lineAction(): boolean {
    const item = this._selectedLine();
    if (!item || texto === 'edit:back' || texto === 'voltar') {
      this._openList();
      return true;
    }
    if (texto === 'edit:remove' || texto === 'remover' || texto === 'tirar') {
      return this._applyQuantity(item, 0);
    }
    if (texto === 'edit:qty' || texto === 'mudar qtd' || texto === 'quantidade') {
      newState = BotState.AWAITING_CART_EDIT_QTY;
      respostas.push(MessagesConstants.EDITAR_QTD_PERGUNTA(item.name));
      return true;
    }
    // Número digitado direto também vale como nova quantidade.
    const typed = /^\d{1,3}$/.test(texto.trim()) ? Number(texto.trim()) : null;
    if (typed !== null && typed <= MAX_ITEM_QTY) return this._applyQuantity(item, typed);
    respostas.push(MessagesConstants.EDITAR_ITEM(item.name, item.qty, item.note));
    return true;
  }

  private _newQuantity(): boolean {
    const item = this._selectedLine();
    if (!item) {
      this._openList();
      return true;
    }
    const trimmed = texto.trim();
    const quantity = /^\d{1,3}$/.test(trimmed) ? Number(trimmed) : null;
    if (quantity === null || quantity > MAX_ITEM_QTY) {
      respostas.push(MessagesConstants.EDITAR_QTD_INVALIDA);
      return true;
    }
    return this._applyQuantity(item, quantity);
  }

  private _applyQuantity(item: CartItem, quantity: number): boolean {
    if (quantity === 0) {
      newCart.items = newCart.items.filter((cartItem: CartItem) => cartItem !== item);
      respostas.push(MessagesConstants.EDITAR_REMOVIDO(item.name));
    } else {
      item.qty = quantity;
      respostas.push(MessagesConstants.EDITAR_QTD_ALTERADA(item.name, quantity));
    }
    newCart.edit_index = null;
    if (newCart.items.length === 0) {
      newState = BotState.ORDERING_CAT;
      respostas.push(MessagesConstants.EDITAR_CARRINHO_VAZIO);
      respostas.push(categoryList('order'));
      return true;
    }
    return this._backToCart();
  }

  private _backToCart(): boolean {
    newCart.edit_index = null;
    newState = BotState.AWAITING_MORE;
    const { lines, total } = cartSummary(newCart.items);
    respostas.push(moreItemsButtons(
      MessagesConstants.CARRINHO_ATUAL.trimStart() + lines.join('\n')
        + MessagesConstants.TOTAL_PARCIAL(fmtBRL(total))
        + MessagesConstants.ADICIONAR_MAIS_OU_FINALIZAR
    ));
    return true;
  }
}
