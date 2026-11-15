// Confirmação parcial: a equipe avisou pelo painel que itens acabaram e perguntou se o cliente segue
// sem eles. O SIM/NÃO vem aqui (antes do "cancelar" global, que encerraria a conversa sem responder
// à equipe). A API aplica a resposta; se ela falhar, o nó de gravação troca a resposta por um aviso.
//
// Com troca sugerida (a equipe escolheu um produto do mesmo tipo no lugar): 1 aceita a troca,
// 2 abre a lista de opções de cada item em falta (um por vez), 3 segue sem o item, NÃO cancela.
const PARTIAL_PICK_PREFIX = 'partial:pick:';
const PARTIAL_PICK_NONE = 'partial:none';

function partialSubstitutions(): PartialSubstitution[] {
  return (partialConfirmation && partialConfirmation.substitutions) || [];
}

function partialChoiceList(index: number): ListMessage {
  const substitutions = partialSubstitutions();
  const substitution = substitutions[index];
  const rows: ListRow[] = substitution.alternatives.slice(0, 9).map((option: PartialSubstituteOption, optionIndex: number) => ({
    id: PARTIAL_PICK_PREFIX + optionIndex,
    title: option.name,
    description: 'R$ ' + fmtBRL(option.price)
      + (option.product_id === substitution.suggested.product_id ? ' · ' + MessagesConstants.PARCIAL_ESCOLHA_SUGERIDO : ''),
  }));
  rows.push({ id: PARTIAL_PICK_NONE, title: MessagesConstants.PARCIAL_ESCOLHA_SEM, description: MessagesConstants.PARCIAL_ESCOLHA_SEM_DESC });
  const step = substitutions.length > 1 ? MessagesConstants.PARCIAL_ESCOLHA_PASSO(index + 1, substitutions.length) : '';
  return {
    type: 'list',
    body: MessagesConstants.PARCIAL_ESCOLHA(substitution.quantity + '× ' + substitution.item_name, step),
    button: MessagesConstants.PARCIAL_ESCOLHA_BOTAO,
    sections: [{ title: MessagesConstants.PARCIAL_ESCOLHA_SECAO, rows }],
  };
}

class PartialConfirmationHandler extends BaseHandler {
  async handle(): Promise<boolean> {
    if (!partialConfirmation) return false;
    if (partialSubstitutions().length > 0) return this._handleSubstitutes();

    const accept = partialAnswerOf(texto);
    if (accept === null) return false;

    save_partial_answer = true;
    partialAnswer = { order_code: partialConfirmation.order_code, accept };
    newState = BotState.START;
    respostas.push(accept
      ? MessagesConstants.PARCIAL_ACEITO(partialConfirmation.order_code, fmtBRL(partialConfirmation.new_total))
      : MessagesConstants.PARCIAL_RECUSADO(partialConfirmation.order_code));
    return true;
  }

  private _handleSubstitutes(): boolean {
    if (currentState === BotState.AWAITING_PARTIAL_CHOICE) return this._pick();

    const reply = partialSubstituteReplyOf(texto);
    if (reply === null) return false;
    const substitutions = partialSubstitutions();

    if (reply === 'decline') return this._finish(false);
    if (reply === 'accept') {
      const picks: Record<string, string | null> = {};
      substitutions.forEach((substitution: PartialSubstitution) => { picks[substitution.item_id] = substitution.suggested.product_id; });
      return this._finish(true, picks);
    }
    if (reply === 'without') {
      const picks: Record<string, string | null> = {};
      substitutions.forEach((substitution: PartialSubstitution) => { picks[substitution.item_id] = null; });
      return this._finish(true, picks);
    }
    // Escolher outro: uma lista por item em falta, na ordem.
    newCart.partial_picks = {};
    newCart.partial_pick_index = 0;
    newState = BotState.AWAITING_PARTIAL_CHOICE;
    respostas.push(partialChoiceList(0));
    return true;
  }

  private _pick(): boolean {
    const substitutions = partialSubstitutions();
    const index = typeof newCart.partial_pick_index === 'number' ? newCart.partial_pick_index : 0;
    const substitution = substitutions[index];
    if (!substitution) return this._restart();

    const answer = texto.trim();
    let productId: string | null | undefined;
    if (answer === PARTIAL_PICK_NONE || partialSubstituteReplyOf(answer) === 'without') {
      productId = null;
    } else if (answer.startsWith(PARTIAL_PICK_PREFIX)) {
      const option = substitution.alternatives[Number(answer.slice(PARTIAL_PICK_PREFIX.length))];
      productId = option ? option.product_id : undefined;
    } else if (partialSubstituteReplyOf(answer) === 'decline') {
      return this._finish(false);
    }
    if (productId === undefined) {
      respostas.push(partialChoiceList(index));
      return true;
    }

    const picks: Record<string, string | null> = { ...(newCart.partial_picks || {}) };
    picks[substitution.item_id] = productId;
    if (index + 1 < substitutions.length) {
      newCart.partial_picks = picks;
      newCart.partial_pick_index = index + 1;
      newState = BotState.AWAITING_PARTIAL_CHOICE;
      respostas.push(partialChoiceList(index + 1));
      return true;
    }
    return this._finish(true, picks);
  }

  // Lista sumiu (a equipe mandou outra pergunta): começa a escolha de novo.
  private _restart(): boolean {
    newCart.partial_picks = {};
    newCart.partial_pick_index = 0;
    newState = BotState.AWAITING_PARTIAL_CHOICE;
    respostas.push(partialChoiceList(0));
    return true;
  }

  private _finish(accept: boolean, picks?: Record<string, string | null>): boolean {
    const confirmation = partialConfirmation as PartialConfirmation;
    newCart.partial_picks = null;
    newCart.partial_pick_index = null;
    newState = BotState.START;
    save_partial_answer = true;

    const substitutions = partialSubstitutions();
    const swapped = substitutions.filter((substitution: PartialSubstitution) => picks && picks[substitution.item_id]);
    // Tudo faltou e o cliente não quis troca: não sobra nada para entregar, a API cancela.
    const nothingLeft = (confirmation.items_kept ?? 1) === 0 && swapped.length === 0;
    if (!accept || nothingLeft) {
      partialAnswer = { order_code: confirmation.order_code, accept: false };
      respostas.push(MessagesConstants.PARCIAL_RECUSADO(confirmation.order_code));
      return true;
    }

    partialAnswer = { order_code: confirmation.order_code, accept: true, replacements: picks };
    const optionOf = (substitution: PartialSubstitution): PartialSubstituteOption | undefined =>
      substitution.alternatives.find((option: PartialSubstituteOption) => option.product_id === (picks || {})[substitution.item_id])
      || (substitution.suggested.product_id === (picks || {})[substitution.item_id] ? substitution.suggested : undefined);
    const total = (confirmation.total_without ?? confirmation.new_total) + swapped.reduce(
      (sum: number, substitution: PartialSubstitution) => sum + ((optionOf(substitution)?.price || 0) * substitution.quantity), 0);

    if (swapped.length === 0) {
      respostas.push(MessagesConstants.PARCIAL_SEM_ITEM(confirmation.order_code, fmtBRL(total)));
      return true;
    }
    const lines = substitutions.map((substitution: PartialSubstitution) => {
      const option = optionOf(substitution);
      return option
        ? MessagesConstants.PARCIAL_TROCA_LINHA(substitution.quantity, substitution.item_name, option.name)
        : MessagesConstants.PARCIAL_SEM_LINHA(substitution.quantity, substitution.item_name);
    });
    respostas.push(MessagesConstants.PARCIAL_TROCA_ACEITA(confirmation.order_code, lines.join('\n'), fmtBRL(total)));
    return true;
  }
}
