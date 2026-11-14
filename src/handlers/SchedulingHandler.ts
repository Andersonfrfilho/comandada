// Encomenda: o cliente agenda pelo menu principal da saudação ("📅 Agendar pedido") ou escrevendo "agendar",
// antes de escolher os itens. Dia → horário → categorias com o horário marcado. No fim do pedido não há mais pergunta
// "agora ou agendar": sem agendamento, o pedido é para agora.
const SCHEDULE_TYPED_COMMANDS: ReadonlyArray<string> = ['agendar', 'agendar pedido', 'agendar encomenda', 'encomenda'];

class SchedulingHandler extends BaseHandler {
  async handle(): Promise<boolean> {
    if (currentState === BotState.AWAITING_WHEN) return this._handleWhen();
    if (currentState === BotState.AWAITING_SCHEDULE_DAY) return this._handleDay();
    if (currentState === BotState.AWAITING_SCHEDULE_TIME) return this._handleTime();
    if (texto === SCHEDULE_START_ID || ((currentState === BotState.ORDERING_CAT || !expectingRawInput) && SCHEDULE_TYPED_COMMANDS.includes(texto.trim()))) {
      return this._start();
    }
    return false;
  }

  private _start(): boolean {
    newCart.schedule_from_menu = currentState !== BotState.ORDERING_CAT;
    if (scheduleSlots.length === 0) {
      respostas.push(MessagesConstants.AGENDAR_SEM_HORARIOS_LISTA);
      this._backToCategories();
      return true;
    }
    newState = BotState.AWAITING_SCHEDULE_DAY;
    respostas.push(scheduleDayMenu());
    return true;
  }

  private _backFromDays(): void {
    if (newCart.schedule_from_menu) {
      newCart.schedule_from_menu = false;
      newState = BotState.START;
      respostas.push(mainMenu());
      return;
    }
    this._backToCategories();
  }

  private _backToCategories(): void {
    newCart.schedule_from_menu = false;
    newState = BotState.ORDERING_CAT;
    newCart.browse_cat_page = 0;
    respostas.push(categoryList('order', 0, true));
  }

  // Sessões antigas paradas na pergunta "agora ou agendar?" (fluxo anterior).
  private _handleWhen(): boolean {
    if (texto === 'when:schedule' || texto.includes('agend')) return this._start();
    startCheckout();
    return true;
  }

  private _handleDay(): boolean {
    if (texto === MENU_BACK_ID || texto === 'voltar') {
      this._backFromDays();
      return true;
    }
    if (texto === SCHEDULE_NOW_ID || texto.includes('agora')) {
      newCart.scheduled_date = '';
      newCart.scheduled_time = '';
      respostas.push(MessagesConstants.AGENDAR_AGORA_OK);
      this._backToCategories();
      return true;
    }
    const typedDate = texto.startsWith('day:') ? texto.slice('day:'.length) : parseDate(texto);
    const day = scheduleSlots.find((slotDay: ScheduleDay) => slotDay.date === typedDate);
    if (!day) {
      respostas.push(scheduleDayMenu());
      return true;
    }
    newCart.scheduled_date = day.date;
    newCart.scheduled_time = '';
    newState = BotState.AWAITING_SCHEDULE_TIME;
    respostas.push(scheduleTimeMenu(day.date));
    return true;
  }

  private _handleTime(): boolean {
    if (texto === MENU_BACK_ID || texto === 'voltar') {
      newState = BotState.AWAITING_SCHEDULE_DAY;
      respostas.push(scheduleDayMenu());
      return true;
    }
    const day = scheduleSlots.find((slotDay: ScheduleDay) => slotDay.date === newCart.scheduled_date);
    if (!day) {
      newCart.scheduled_date = '';
      newCart.scheduled_time = '';
      respostas.push(MessagesConstants.AGENDAR_SEM_HORARIOS_LISTA);
      this._backToCategories();
      return true;
    }
    const chosen = texto.startsWith('time:') ? texto.slice('time:'.length) : parseTime(texto);
    if (!chosen || !day.times.includes(chosen)) {
      respostas.push(MessagesConstants.AGENDAR_HORA_INDISPONIVEL(chosen || texto));
      respostas.push(scheduleTimeMenu(day.date));
      return true;
    }
    newCart.scheduled_time = chosen;
    respostas.push(MessagesConstants.AGENDADO_PARA(fmtScheduleDay(day.date), chosen) + MessagesConstants.AGENDADO_ESCOLHA_ITENS);
    // Com itens já no carrinho, a lista de categorias traz o "🛒 Finalizar pedido".
    newState = BotState.ORDERING_CAT;
    newCart.browse_cat_page = 0;
    respostas.push(categoryList('order', 0, true));
    return true;
  }
}
