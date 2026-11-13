class ReservationHandler extends BaseHandler {
  async handle(): Promise<boolean> {
    if (currentState === BotState.RESERVING) {
      return this._handleReserving();
    }
    if (currentState === BotState.CONFIRMING_RESERVATION && texto === 'sim') {
      return this._handleConfirmReservation();
    }
    if (currentState === BotState.CONFIRMING_RESERVATION && (texto === 'não' || texto === 'nao')) {
      newReservationTemp = {};
      newState = BotState.START;
      respostas.push(MessagesConstants.RESERVA_CANCELADA);
      respostas.push(mainMenu());
      return true;
    }
    return false;
  }

  private _handleReserving(): boolean {
    const dateValue = parseDate(texto);
    const timeValue = parseTime(texto);
    const sizeValue = parsePeople(texto);
    const missing: string[] = [];
    if (!dateValue) missing.push('📆 data');
    if (!timeValue) missing.push('🕗 horário');
    if (!sizeValue) missing.push(MessagesConstants.RESERVA_FALTA_PESSOAS);

    if (missing.length > 0) {
      respostas.push(MessagesConstants.RESERVA_FALTANDO(missing.join(', ')));
      return true;
    }

    // Qual mesa está livre no horário quem decide é a agenda da API, ao gravar.
    const hasTableForParty = restaurantTables.some((table: RestaurantTable) => table.capacity >= sizeValue!);
    if (!hasTableForParty) {
      respostas.push(MessagesConstants.RESERVA_SEM_MESA(sizeValue!, fmtDate(dateValue!), timeValue!));
      return true;
    }
    newReservationTemp = { date: dateValue!, time: timeValue!, party_size: sizeValue! };
    newState = BotState.CONFIRMING_RESERVATION;
    respostas.push(confirmBtn(MessagesConstants.RESERVA_RESUMO(fmtDate(dateValue!), timeValue!, sizeValue!)));
    return true;
  }

  private _handleConfirmReservation(): boolean {
    const reservationData = newReservationTemp;
    if (!reservationData || !reservationData.date) {
      newState = BotState.START;
      respostas.push(MessagesConstants.RESERVA_DADOS_INVALIDOS);
      return true;
    }

    const reservationCode = generateReservationCode(tel);
    save_reservation = true;
    finalReservation = {
      tel,
      code: reservationCode,
      customer_name: customerName,
      date: reservationData.date,
      time: reservationData.time!,
      party_size: reservationData.party_size!,
    };
    newReservationTemp = {};
    newState = BotState.START;

    const estabAddr = estAddress;
    const mapsLink = estabAddr ? MessagesConstants.RESERVA_MAPS_LINE(estabAddr) : '';
    const addrLine = estabAddr ? MessagesConstants.RESERVA_ADDR_LINE(estabAddr, mapsLink) : '';

    respostas.push(MessagesConstants.RESERVA_CONFIRMADA(
      fmtDate(reservationData.date),
      reservationData.time!,
      reservationData.party_size!,
      reservationCode,
      addrLine
    ));
    return true;
  }
}
