// ── Pedido escrito ou falado ─────────────────────────────────────────────────
// O cliente escreve (ou fala, e o áudio chega transcrito) "2 combo tradicional e 1 hot roll":
// o bot acha os itens no cardápio, pergunta em lista o que ficou ambíguo e mostra o que anotou
// para o cliente confirmar. Só depois de confirmado os itens entram no carrinho. Convive com os
// botões: em qualquer passo de escolha do cardápio o cliente pode simplesmente escrever.

// Passos em que um texto livre pode ser um pedido.
const TEXT_ORDER_BROWSE_STATES: ReadonlyArray<string> = [
  BotState.START,
  BotState.ORDERING,
  BotState.ORDERING_CAT,
  BotState.BROWSING_CATEGORIES,
  BotState.ORDERING_ITEMS,
  BotState.BROWSING_ITEMS,
  BotState.AWAITING_MORE,
];

// Palavras que já são comando de outro passo do bot: nunca viram busca no cardápio.
const TEXT_ORDER_COMMANDS: ReadonlyArray<string> = [
  'finalizar', 'carrinho', 'voltar', 'próxima', 'proxima', 'próximo', 'proximo', 'mais', 'ver mais', 'sim', 'não',
  'nao', 'ok', 'confirmar', 'cancelar', 'sair', 'menu', 'cardapio', 'cardápio', 'pedido', 'meu pedido', 'meus pedidos',
  'ajuda', 'problema', 'reserva', 'reservar', 'atendente', 'pular',
];

const TEXT_ORDER_CONFIRM_WORDS: ReadonlyArray<string> = [
  'text:ok', 'sim', 's', 'confirmar', 'confirmo', 'confirma', 'ok', 'isso', 'isso mesmo', 'pode', 'pode ser', 'certo',
  'correto', 'fechado', 'beleza', 'blz', 'perfeito', 'ta certo', 'tá certo', 'está certo', 'esta certo',
];
const TEXT_ORDER_REDO_WORDS: ReadonlyArray<string> = ['text:redo', 'não', 'nao', 'n', 'corrigir', 'errado', 'refazer'];
const TEXT_ORDER_NONE_WORDS: ReadonlyArray<string> = ['pick:none', 'nenhum', 'nenhuma', 'nenhum desses', 'nenhum deles', 'nenhuma delas'];

function looksLikeFreeTextOrder(input: string): boolean {
  const text = input.trim();
  if (!text || text.length > 500 || !/\p{L}/u.test(text)) return false;
  if (/^[a-z_]+:\S/.test(text) || /^__.+__$/.test(text)) return false;
  return !TEXT_ORDER_COMMANDS.includes(text.replace(/[!.?]+$/, ''));
}

function emptyTextOrderDraft(): TextOrderDraft {
  return { items: [], pending: [], unrecognized: [] };
}

function findProductById(productId: string): Product | undefined {
  return products.find((product: Product) => String(product.id) === String(productId));
}

function addToItems(items: CartItem[], product: Product, qty: number): boolean {
  return mergeCartItem(items, { id: product.id, name: product.name, qty, price: Number(product.price), menuIdx: products.indexOf(product) + 1 });
}

function absorbFreeTextOrder(draft: TextOrderDraft, parsed: FreeTextParseResult): void {
  for (const match of parsed.matches) {
    if (match.product) {
      addToItems(draft.items, match.product, match.segment.qty);
      continue;
    }
    draft.pending.push({
      query: match.segment.text,
      qty: match.segment.qty,
      option_ids: match.options.map((product: Product) => String(product.id)),
    });
  }
  draft.unrecognized.push(...parsed.unrecognized);
}

function textOrderChoiceOptions(choice: TextOrderChoice): Product[] {
  return choice.option_ids.map(findProductById).filter(Boolean) as Product[];
}

function isSameItemSizes(options: Product[]): boolean {
  const group = options[0] && options[0].variant_group;
  return !!group && options.every((product: Product) => product.variant_group === group);
}

// Linhas da pergunta: com tamanhos de um item só, uma linha por tamanho; com vários itens, uma linha
// por item (os tamanhos dele juntos, perguntados depois) para "temaki" não virar oito linhas.
function textOrderChoiceRows(choice: TextOrderChoice): ListRow[] {
  const options = textOrderChoiceOptions(choice);
  if (isSameItemSizes(options)) {
    return options.slice(0, FREE_TEXT_MAX_ROWS).map((product: Product) => ({
      id: 'pick:' + product.id,
      title: product.variant_label ? SIZE_EMOJI + ' ' + product.variant_label : product.name,
      description: '💰 R$ ' + fmtBRL(product.price),
    }));
  }
  const rows: ListRow[] = [];
  const seenGroups: string[] = [];
  for (const product of options) {
    const group = product.variant_group || '';
    if (group && seenGroups.includes(group)) continue;
    if (group) seenGroups.push(group);
    const variants = group ? products.filter((candidate: Product) => candidate.variant_group === group) : [product];
    rows.push(variants.length > 1
      ? {
        id: 'pick:group:' + group,
        title: variantBaseName(product),
        description: variants.map((variant: Product) => (variant.variant_label || variant.name) + ' R$ ' + fmtBRL(variant.price)).join(' · '),
      }
      : {
        id: 'pick:' + product.id,
        title: product.name,
        description: '💰 R$ ' + fmtBRL(product.price) + (product.description
          ? ' · ' + compactDescription(String(product.description), MENU_ROW_DESCRIPTION_MAX - Array.from('💰 R$ ' + fmtBRL(product.price) + ' · ').length)
          : ''),
      });
  }
  return rows.slice(0, FREE_TEXT_MAX_ROWS);
}

function textOrderChoiceMessage(choice: TextOrderChoice, retry?: boolean): ListMessage {
  const options = textOrderChoiceOptions(choice);
  const body = (retry ? MessagesConstants.TEXTO_ESCOLHA_REPETIR + '\n\n' : '') + (isSameItemSizes(options)
    ? MessagesConstants.TEXTO_ESCOLHA_TAMANHO(options[0].emoji || menuEmojiFor(variantBaseName(options[0]), options[0].category || ''), variantBaseName(options[0]), choice.qty)
    : MessagesConstants.TEXTO_ESCOLHA(choice.query, choice.qty));
  const rows = textOrderChoiceRows(choice);
  rows.push({ id: 'pick:none', title: MessagesConstants.TEXTO_ESCOLHA_NENHUM });
  return {
    type: 'list',
    body,
    button: MessagesConstants.TEXTO_ESCOLHA_BOTAO,
    sections: [{ title: MessagesConstants.TEXTO_ESCOLHA_SECAO, rows }],
  };
}

function textOrderConfirmMessage(draft: TextOrderDraft): ButtonMessage {
  const lines = [orderTable(draft.items)];
  const draftTotal = draft.items.reduce((sum: number, item: CartItem) => sum + item.price * item.qty, 0);
  let body = MessagesConstants.TEXTO_ANOTEI + lines.join('\n') + MessagesConstants.TEXTO_SUBTOTAL(fmtBRL(draftTotal));
  if (newCart.items.length > 0) body += MessagesConstants.TEXTO_SOMA_CARRINHO(fmtBRL(cartSummary(newCart.items).total + draftTotal));
  if (draft.unrecognized.length > 0) body += MessagesConstants.TEXTO_NAO_ENCONTREI(draft.unrecognized.join(', '));
  body += MessagesConstants.TEXTO_CONFIRMA;
  return {
    type: 'buttons',
    body,
    buttons: [
      { id: 'text:ok', title: MessagesConstants.TEXTO_BOTAO_CONFIRMAR },
      { id: 'text:add', title: MessagesConstants.TEXTO_BOTAO_MAIS },
      { id: 'text:redo', title: MessagesConstants.TEXTO_BOTAO_CORRIGIR },
    ],
  };
}

// Próximo passo do rascunho: perguntar o que ficou ambíguo, pedir confirmação, ou dizer que nada bateu.
function continueTextOrder(draft: TextOrderDraft): void {
  if (draft.pending.length > 0) {
    newCart.text_order = draft;
    newState = BotState.AWAITING_TEXT_ORDER_CHOICE;
    respostas.push(textOrderChoiceMessage(draft.pending[0]));
    return;
  }
  if (draft.items.length > 0) {
    newCart.text_order = draft;
    newState = BotState.AWAITING_TEXT_ORDER_CONFIRM;
    respostas.push(textOrderConfirmMessage(draft));
    return;
  }
  newCart.text_order = null;
  newState = BotState.START;
  const buttons: Array<{ id: string; title: string }> = [{ id: '2', title: MessagesConstants.TEXTO_BOTAO_VER_CARDAPIO }];
  if (menuPdfUrl) buttons.push({ id: 'menu:pdf', title: '📄 ' + MessagesConstants.CARDAPIO_PDF_OPCAO });
  respostas.push({ type: 'buttons', body: MessagesConstants.TEXTO_NADA_ENCONTRADO(draft.unrecognized.join(', ')), buttons });
}

class TextOrderHandler extends BaseHandler {
  async handle(): Promise<boolean> {
    if (currentState === BotState.AWAITING_TEXT_ORDER_CHOICE) return this._handleChoice();
    if (currentState === BotState.AWAITING_TEXT_ORDER_CONFIRM) return this._handleConfirm();
    if (!TEXT_ORDER_BROWSE_STATES.includes(currentState) || !looksLikeFreeTextOrder(texto)) return false;

    const parsed = parseFreeTextOrder(texto, products);
    // Nada do texto bateu com o cardápio: segue para os atalhos e o fallback de sempre.
    if (parsed.matches.length === 0) return false;
    const draft = emptyTextOrderDraft();
    absorbFreeTextOrder(draft, parsed);
    continueTextOrder(draft);
    return true;
  }

  private _draft(): TextOrderDraft | null {
    const draft = newCart.text_order;
    return draft && Array.isArray(draft.items) && Array.isArray(draft.pending) ? draft : null;
  }

  private _handleChoice(): boolean {
    const draft = this._draft();
    const choice = draft && draft.pending[0];
    if (!draft || !choice) {
      newCart.text_order = null;
      newState = BotState.START;
      return false;
    }
    const answer = texto.trim();
    if (TEXT_ORDER_NONE_WORDS.includes(answer)) {
      draft.unrecognized.push(choice.query);
      draft.pending.shift();
      continueTextOrder(draft);
      return true;
    }
    // Toque na lista (id), número da linha, ou o nome escrito ("o de salmão", "grande").
    const rows = textOrderChoiceRows(choice);
    const typedNumber = /^\d+$/.test(answer) ? parseInt(answer, 10) : NaN;
    const rowId = answer.startsWith('pick:')
      ? answer
      : !isNaN(typedNumber) ? (rows[typedNumber - 1] ? rows[typedNumber - 1].id : '') : this._typedRowId(answer, choice);

    if (rowId.startsWith('pick:group:')) {
      const group = rowId.slice('pick:group:'.length);
      const variants = products.filter((product: Product) => product.variant_group === group);
      if (variants.length > 0) {
        choice.option_ids = variants.map((product: Product) => String(product.id));
        respostas.push(textOrderChoiceMessage(choice));
        newCart.text_order = draft;
        return true;
      }
    }
    const picked = rowId ? findProductById(rowId.slice('pick:'.length)) : undefined;
    if (!picked) {
      respostas.push(textOrderChoiceMessage(choice, true));
      return true;
    }
    addToItems(draft.items, picked, choice.qty);
    draft.pending.shift();
    continueTextOrder(draft);
    return true;
  }

  // "o de salmão": um produto só, ou os tamanhos de um item só (aí pergunta o tamanho).
  private _typedRowId(answer: string, choice: TextOrderChoice): string {
    const options = textOrderChoiceOptions(choice);
    const typedProduct = pickFreeTextOption(answer, options);
    if (typedProduct) return 'pick:' + typedProduct.id;
    const match = matchFreeTextProduct(significantTokens(normalizeFreeText(answer)), options);
    if (match.product) return 'pick:' + match.product.id;
    if (match.options.length > 0 && isSameItemSizes(match.options)) return 'pick:group:' + match.options[0].variant_group;
    return '';
  }

  private _handleConfirm(): boolean {
    const draft = this._draft();
    if (!draft) {
      newCart.text_order = null;
      newState = BotState.START;
      return false;
    }
    const answer = texto.trim().replace(/[!.]+$/, '');
    if (TEXT_ORDER_CONFIRM_WORDS.includes(answer)) {
      this._commit(draft);
      return true;
    }
    // "finalizar" aqui é confirmar e já fechar: os itens entram e o CartHandler segue com o fechamento.
    if (answer === 'finalizar') {
      this._commit(draft);
      respostas.length = 0;
      return false;
    }
    if (TEXT_ORDER_REDO_WORDS.includes(answer)) {
      newCart.text_order = null;
      newState = BotState.START;
      respostas.push(MessagesConstants.TEXTO_CORRIGIR);
      return true;
    }
    if (answer === 'text:add') {
      respostas.push(MessagesConstants.TEXTO_ESCREVA_MAIS(orderExample()));
      return true;
    }
    // Escreveu mais itens em vez de confirmar: somam ao que já foi anotado.
    const parsed = looksLikeFreeTextOrder(texto) ? parseFreeTextOrder(texto, products) : { matches: [], unrecognized: [] };
    if (parsed.matches.length > 0) {
      absorbFreeTextOrder(draft, parsed);
      continueTextOrder(draft);
      return true;
    }
    respostas.push(textOrderConfirmMessage(draft));
    return true;
  }

  private _commit(draft: TextOrderDraft): void {
    for (const item of draft.items) {
      const product = findProductById(item.id);
      if (product && addToItems(newCart.items, product, item.qty)) respostas.push(MessagesConstants.QTD_LIMITE(product.name, MAX_ITEM_QTY));
    }
    const lastItem = draft.items[draft.items.length - 1];
    if (lastItem) newCart.last_item_id = lastItem.id;
    newCart.text_order = null;
    newState = BotState.AWAITING_MORE;
    const { lines, total } = cartSummary(newCart.items);
    respostas.push(moreItemsButtons(
      MessagesConstants.TEXTO_ADICIONADOS
        + MessagesConstants.CARRINHO_ATUAL + lines.join('\n')
        + MessagesConstants.TOTAL_PARCIAL(fmtBRL(total))
        + MessagesConstants.ADICIONAR_MAIS_OU_FINALIZAR
    ));
  }
}

// ── "📄 Ver cardápio completo" ───────────────────────────────────────────────
// Opção na lista de categorias (id menu:pdf) ou pedido escrito ("cardápio completo", "pdf").
// Manda o PDF gerado pela API e ensina a pedir escrevendo ou por áudio.
const MENU_PDF_REQUEST = /\bpdf\b|\b(cardapio|menu)\s+(completo|inteiro|todo)\b/;

class MenuPdfHandler extends BaseHandler {
  async handle(): Promise<boolean> {
    const tapped = texto === 'menu:pdf';
    const typedRequest = !tapped
      && (TEXT_ORDER_BROWSE_STATES.includes(currentState) || !expectingRawInput)
      && MENU_PDF_REQUEST.test(normalizeFreeText(texto));
    if (!tapped && !typedRequest) return false;

    if (!menuPdfUrl) {
      if (!tapped) return false;
      newState = BotState.ORDERING_CAT;
      newCart.browse_cat_page = 0;
      respostas.push(categoryList('order'));
      return true;
    }

    respostas.push(menuPdfMessage());
    // No meio de uma escolha ou confirmação do pedido escrito, repete a pergunta depois do PDF.
    const draft = newCart.text_order;
    if (currentState === BotState.AWAITING_TEXT_ORDER_CHOICE && draft && draft.pending[0]) {
      respostas.push(textOrderChoiceMessage(draft.pending[0]));
      return true;
    }
    if (currentState === BotState.AWAITING_TEXT_ORDER_CONFIRM && draft) {
      respostas.push(textOrderConfirmMessage(draft));
      return true;
    }
    if (!TEXT_ORDER_BROWSE_STATES.includes(currentState)) return true;

    newState = BotState.START;
    const buttons: Array<{ id: string; title: string }> = [{ id: '2', title: MessagesConstants.CARDAPIO_PDF_BOTAO_CATEGORIAS }];
    if (newCart.items.length > 0) buttons.push({ id: 'finalizar', title: '✅ Finalizar' });
    respostas.push({ type: 'buttons', body: MessagesConstants.CARDAPIO_PDF_DICA(orderExample()), buttons });
    return true;
  }
}

// Nota de voz que não deu para transcrever (ou sem transcrição configurada): pede de novo ou por escrito.
class UnclearAudioHandler extends BaseHandler {
  async handle(): Promise<boolean> {
    if (texto !== AUDIO_UNCLEAR_TEXT) return false;
    respostas.push(MessagesConstants.AUDIO_NAO_ENTENDI(orderExample()));
    return true;
  }
}
