// Atendimento humano segue a inbox do painel (meta_whatsapp.sessions), não só o estado do bot:
//  - atendente assumiu (mode 'human')  → o bot fica calado, quem responde é a equipe;
//  - cliente pediu e ninguém assumiu   → o bot avisa que a equipe já foi chamada;
//  - atendente liberou a conversa      → o bot volta a atender, sem esperar a sessão expirar.
class HandoffHandler extends BaseHandler {
  async handle(): Promise<boolean> {
    if (conversation.mode === 'human') {
      newState = BotState.HUMAN_HANDOFF;
      return true;
    }
    if (currentState !== BotState.HUMAN_HANDOFF) return false;
    if (conversation.human_requested && texto !== 'sair' && texto !== 'cancelar') {
      respostas.push(MessagesConstants.EM_ATENDIMENTO_HUMANO);
      return true;
    }
    // Liberada no painel (ou "sair"): segue como uma conversa nova.
    currentState = BotState.START;
    newState = BotState.START;
    return false;
  }
}
