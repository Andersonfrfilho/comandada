class MiscHandler extends BaseHandler {
  async handle(): Promise<boolean> {
    // Atalhos de navegação (protegidos por !expectingRawInput)
    if (!expectingRawInput && (texto === '5' || texto.startsWith('meu pedido') || texto.startsWith('meus pedido') || texto === 'pedidos')) {
      return this._handleMyOrders();
    }

    if (!expectingRawInput && (texto === '4' || texto.includes('atendente') || texto.includes('humano'))) {
      newState = BotState.HUMAN_HANDOFF;
      request_human_handoff = true;
      handoffCustomerName = customerName || '';
      respostas.push(MessagesConstants.CONECTANDO_ATENDENTE);
      return true;
    }

    if (!expectingRawInput && (texto === '6' || texto === 'notificacoes' || texto === 'notificações')) {
      respostas.push(notifBtn(marketingOptIn));
      newState = BotState.NOTIFICATIONS_MENU;
      return true;
    }

    if (!expectingRawInput && (texto === '0' || texto === 'voltar')) {
      newState = BotState.START;
      respostas.push(MessagesConstants.VOLTAR_MENU);
      respostas.push(mainMenu());
      return true;
    }

    // Estados de atendimento humano e pedido
    if (currentState === BotState.HUMAN_HANDOFF) {
      respostas.push(MessagesConstants.EM_ATENDIMENTO_HUMANO);
      return true;
    }

    if (currentState === BotState.AWAITING_ORDER_DETAIL) {
      return this._handleOrderDetail();
    }

    if (currentState === BotState.NOTIFICATIONS_MENU) {
      return this._handleNotificationsMenu();
    }

    if (currentState === BotState.AWAITING_NAME) {
      return this._handleName();
    }

    if (currentState === BotState.AWAITING_COMPLEMENT) {
      if (texto === 'ok' || texto === 'nao' || texto === 'não' || texto === 'sem complemento') {
        newCart.complement = '';
      } else {
        newCart.complement = texto.trim();
      }
      newState = BotState.AWAITING_PAYMENT;
      respostas.push(paymentList(newCart.split_count));
      return true;
    }

    // Keyword handlers — status do último pedido
    if (texto === 'status' || texto === 'meu pedido' || texto === 'pedido') {
      return this._handleLastOrderStatus();
    }

    // Keyword handlers — notificações inline
    if (texto === 'notificações' || texto === 'notificacoes' || texto === 'promoções' || texto === 'promocoes') {
      return this._handleNotifInfo();
    }

    if (texto.includes('desativar notifica') || texto.includes('desativar promoç')) {
      save_marketing_opt_in = true;
      marketing_opt_in_value = false;
      respostas.push(MessagesConstants.NOTIF_DESATIVADAS_OK);
      return true;
    }

    if (texto.includes('ativar notifica') || texto.includes('ativar promoç')) {
      save_marketing_opt_in = true;
      marketing_opt_in_value = true;
      respostas.push(MessagesConstants.NOTIF_ATIVADAS_OK);
      return true;
    }

    if (currentState === BotState.AWAITING_MARKETING_OPT_IN) {
      return this._handleMarketingOptIn();
    }

    return false;
  }

  private _statusLabel(status: string, orderType: string): string {
    const isDelivery = orderType === 'delivery';
    const statusMap: Record<string, string> = {
      received:          MessagesConstants.STATUS_MAP.received,
      confirmed:         MessagesConstants.STATUS_MAP.confirmed,
      preparing:         MessagesConstants.STATUS_MAP.preparing,
      ready:             isDelivery ? MessagesConstants.STATUS_MAP.ready_delivery : MessagesConstants.STATUS_MAP.ready_pickup,
      out_for_delivery:  MessagesConstants.STATUS_MAP.out_for_delivery,
      delivered:         MessagesConstants.STATUS_MAP.delivered,
      cancelled:         MessagesConstants.STATUS_MAP.cancelled,
    };
    return statusMap[status] || status;
  }

  private _handleMyOrders(): boolean {
    if (!recentOrders || recentOrders.length === 0) {
      respostas.push(MessagesConstants.SEM_PEDIDOS);
      return true;
    }

    let msg = MessagesConstants.PEDIDOS_HEADER;
    recentOrders.forEach((order: RecentOrder, index: number) => {
      const statusText = this._statusLabel(order.status, order.order_type);
      const tipoLabel = order.order_type === 'delivery'
        ? MessagesConstants.PEDIDO_DETALHE_TIPO_DELIVERY
        : order.order_type === 'retirada'
          ? MessagesConstants.PEDIDO_DETALHE_TIPO_RETIRADA
          : MessagesConstants.PEDIDO_DETALHE_TIPO_MESA;
      msg += '*' + (index + 1) + '. #' + order.code + '*\n'
           + '   ' + tipoLabel + ' — R$ ' + fmtBRL(order.total) + '\n'
           + '   ' + statusText + ' — ' + order.created_at + '\n\n';
    });
    msg += MessagesConstants.PEDIDOS_FOOTER;
    respostas.push(msg);
    newState = BotState.AWAITING_ORDER_DETAIL;
    return true;
  }

  private _handleOrderDetail(): boolean {
    const codeInput = texto.replace(/^#/, '').toUpperCase();
    const foundOrder = recentOrders.find((order: RecentOrder) => order.code.toUpperCase() === codeInput);

    if (foundOrder) {
      const tipoLabel = foundOrder.order_type === 'delivery'
        ? MessagesConstants.PEDIDO_DETALHE_TIPO_DELIVERY
        : foundOrder.order_type === 'retirada'
          ? MessagesConstants.PEDIDO_DETALHE_TIPO_RETIRADA
          : MessagesConstants.PEDIDO_DETALHE_TIPO_MESA;
      const statusText = this._statusLabel(foundOrder.status, foundOrder.order_type);
      respostas.push(
        MessagesConstants.PEDIDO_DETALHE_HEADER(foundOrder.code)
        + tipoLabel + ' — R$ ' + fmtBRL(foundOrder.total) + '\n'
        + statusText + ' — ' + foundOrder.created_at + '\n'
        + (foundOrder.payment_method ? '💳 ' + foundOrder.payment_method + '\n' : '')
        + '\n_' + (foundOrder.items_count || 0) + ' item(s)_\n\n'
        + MessagesConstants.PEDIDO_DETALHE_FOOTER
      );
    } else if (texto === '0' || texto === 'voltar' || texto === 'menu') {
      newState = BotState.START;
      respostas.push(MessagesConstants.VOLTAR_MENU);
      respostas.push(mainMenu());
    } else {
      respostas.push(MessagesConstants.PEDIDO_CODIGO_NAO_ENCONTRADO(texto));
    }
    return true;
  }

  private _handleNotificationsMenu(): boolean {
    if (texto === 'ativar' || texto === 'sim') {
      save_marketing_opt_in = true;
      marketing_opt_in_value = true;
      newState = BotState.START;
      respostas.push(MessagesConstants.NOTIF_ATIVADAS);
      respostas.push(mainMenu());
    } else if (texto === 'desativar' || texto === 'nao' || texto === 'não') {
      save_marketing_opt_in = true;
      marketing_opt_in_value = false;
      newState = BotState.START;
      respostas.push(MessagesConstants.NOTIF_DESATIVADAS);
      respostas.push(mainMenu());
    } else if (texto === '0' || texto === 'voltar') {
      newState = BotState.START;
      respostas.push(MessagesConstants.VOLTAR_MENU.trim());
      respostas.push(mainMenu());
    } else {
      respostas.push(MessagesConstants.NOTIF_MENU_PROMPT);
    }
    return true;
  }

  private _handleName(): boolean {
    const validation = validateName(texto);
    if (!validation.valid) {
      respostas.push(validation.reason === 'bad_word'
        ? MessagesConstants.NOME_INVALIDO_PALAVRAO
        : MessagesConstants.NOME_INVALIDO_GENERICO
      );
      newState = BotState.AWAITING_NAME;
      return true;
    }

    const nameFormatted = capitalizeName(texto);
    customerNameToSave = nameFormatted;
    save_customer_name = true;
    newState = BotState.START;

    if (lastOrder && Array.isArray(lastOrder.items) && lastOrder.items.length > 0) {
      const lines = buildRepeatOrderLines({ lastOrder, products, header: MessagesConstants.ULTIMO_PEDIDO_HEADER });
      newState = BotState.REPEAT_ORDER;
      respostas.push(MessagesConstants.SAUDACAO_APOS_NOME(nameFormatted) + msgWelcome);
      respostas.push(lines.join('\n'));
      respostas.push(yesNo(MessagesConstants.SAUDACAO_REPEAT_PERGUNTA));
    } else {
      respostas.push(MessagesConstants.SAUDACAO_APOS_NOME(nameFormatted) + msgWelcome);
      respostas.push(mainMenu());
    }
    return true;
  }

  private _handleLastOrderStatus(): boolean {
    if (!lastOrder || !lastOrder.code) {
      respostas.push(MessagesConstants.NENHUM_PEDIDO_ENCONTRADO);
      return true;
    }
    const statusMap: Record<string, string> = MessagesConstants.STATUS_MAP;
    const statusLabel = statusMap[lastOrder.status || ''] || lastOrder.status || MessagesConstants.STATUS_MAP.received;
    const { lines } = cartSummary(lastOrder.items || []);
    respostas.push(MessagesConstants.ULTIMO_PEDIDO_DETALHE(lastOrder.code, lines.join('\n'), fmtBRL(lastOrder.total), statusLabel));
    return true;
  }

  private _handleNotifInfo(): boolean {
    if (marketingOptIn === true) {
      respostas.push(MessagesConstants.NOTIF_ATIVAS_INFO);
    } else if (marketingOptIn === false) {
      respostas.push(MessagesConstants.NOTIF_INATIVAS_INFO);
    } else {
      respostas.push(MessagesConstants.NOTIF_NAO_CONFIGURADAS);
    }
    return true;
  }

  private _handleMarketingOptIn(): boolean {
    if (texto === 'sim') {
      save_marketing_opt_in = true;
      marketing_opt_in_value = true;
      newState = BotState.START;
      respostas.push(MessagesConstants.OPT_IN_SIM);
    } else if (texto === 'não' || texto === 'nao') {
      save_marketing_opt_in = true;
      marketing_opt_in_value = false;
      newState = BotState.START;
      respostas.push(MessagesConstants.OPT_IN_NAO);
    } else {
      respostas.push(MessagesConstants.OPT_IN_REPROMPT);
    }
    return true;
  }
}
