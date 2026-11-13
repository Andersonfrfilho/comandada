// Confirmação parcial: a equipe avisou pelo painel que itens acabaram e perguntou se o cliente segue
// sem eles. O SIM/NÃO vem aqui (antes do "cancelar" global, que encerraria a conversa sem responder
// à equipe). A API aplica a resposta; se ela falhar, o nó de gravação troca a resposta por um aviso.
class PartialConfirmationHandler extends BaseHandler {
  async handle(): Promise<boolean> {
    if (!partialConfirmation) return false;
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
}
