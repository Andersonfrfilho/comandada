class SchedulingHandler extends BaseHandler {
  async handle(): Promise<boolean> {
    if (currentState === BotState.AWAITING_WHEN) return this._handleWhen();
    if (currentState === BotState.AWAITING_SCHEDULE_DAY) return this._handleDay();
    if (currentState === BotState.AWAITING_SCHEDULE_TIME) return this._handleTime();
    return false;
  }

  private _handleWhen(): boolean {
    if (texto === 'when:now' || texto.includes('agora')) {
      startCheckout();
      return true;
    }
    if (texto === 'when:schedule' || texto.includes('agend')) {
      newState = BotState.AWAITING_SCHEDULE_DAY;
      respostas.push(scheduleDayMenu());
      return true;
    }
    respostas.push(whenBtn());
    return true;
  }

  private _handleDay(): boolean {
    const typedDate = texto.startsWith('day:') ? texto.slice('day:'.length) : parseDate(texto);
    const day = scheduleSlots.find((slotDay: ScheduleDay) => slotDay.date === typedDate);
    if (!day) {
      respostas.push(scheduleDayMenu());
      return true;
    }
    newCart.scheduled_date = day.date;
    newState = BotState.AWAITING_SCHEDULE_TIME;
    respostas.push(scheduleTimeMenu(day.date));
    return true;
  }

  private _handleTime(): boolean {
    if (texto === '0' || texto === 'voltar') {
      newState = BotState.AWAITING_SCHEDULE_DAY;
      respostas.push(scheduleDayMenu());
      return true;
    }
    const day = scheduleSlots.find((slotDay: ScheduleDay) => slotDay.date === newCart.scheduled_date);
    if (!day) {
      respostas.push(MessagesConstants.AGENDAR_SEM_HORARIOS);
      newCart.scheduled_date = '';
      startCheckout();
      return true;
    }
    const chosen = texto.startsWith('time:') ? texto.slice('time:'.length) : parseTime(texto);
    if (!chosen || !day.times.includes(chosen)) {
      respostas.push(MessagesConstants.AGENDAR_HORA_INDISPONIVEL(chosen || texto));
      respostas.push(scheduleTimeMenu(day.date));
      return true;
    }
    newCart.scheduled_time = chosen;
    respostas.push(MessagesConstants.AGENDADO_PARA(fmtScheduleDay(day.date), chosen));
    startCheckout();
    return true;
  }
}
