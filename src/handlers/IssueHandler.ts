interface HelpOption {
  id: string;
  title: string;
}

// Ajuda com o pedido. As opções seguem o momento do pedido:
//  - em andamento: onde está, atrasado (só depois da previsão), alterar/cancelar (só antes do preparo);
//  - entregue há poucas horas: faltou item, item errado, qualidade, entrega, pagamento, outro;
//  - sem pedido: fazer pedido, ver cardápio.
// "Falar com atendente" aparece sempre. Problema relatado vira métrica no painel e, se o cliente
// não ficar satisfeito, passa para atendente.
// Vem antes dos atalhos de menu: "problema com o pedido" contém "pedido" e abriria o cardápio.
class IssueHandler extends BaseHandler {
  async handle(): Promise<boolean> {
    if (currentState === BotState.AWAITING_HELP_OPTION) return this._handleHelpOption();
    if (currentState === BotState.AWAITING_ISSUE_DETAIL) return this._handleDetail();
    if (currentState === BotState.AWAITING_ISSUE_FOLLOWUP) return this._handleFollowup();

    if (expectingRawInput) return false;
    const asked = IssueConstants.KEYWORDS.some((keyword: string) => texto.includes(keyword));
    if (!asked) return false;
    return this._showMenu();
  }

  // ── Contexto do pedido ────────────────────────────────────────────────────
  private _activeOrders(): RecentOrder[] {
    return recentOrders.filter((order: RecentOrder) => (IssueConstants.OPEN_STATUSES as readonly string[]).includes(order.status));
  }

  private _recentlyDelivered(): RecentOrder | undefined {
    const limit = Date.now() - IssueConstants.AFTER_DELIVERY_HOURS * 60 * 60 * 1000;
    return recentOrders.find((order: RecentOrder) =>
      order.status === IssueConstants.DONE_STATUS && !!order.completed_at && new Date(order.completed_at).getTime() >= limit
    );
  }

  // Pedido de que se trata a ajuda: o em andamento mais recente; senão o entregue há pouco.
  private _focusOrder(): { order: RecentOrder | undefined; delivered: boolean } {
    const active = this._activeOrders()[0];
    if (active) return { order: active, delivered: false };
    const delivered = this._recentlyDelivered();
    return { order: delivered, delivered: !!delivered };
  }

  private _isLate(order: RecentOrder): boolean {
    const target = order.scheduled_for || order.estimated_at;
    return !!target && new Date(target).getTime() < Date.now();
  }

  private _options(): HelpOption[] {
    const { order, delivered } = this._focusOrder();
    const human = { id: IssueConstants.OPTION.HUMAN, title: IssueConstants.ROW_HUMAN };
    if (!order) {
      return [
        { id: IssueConstants.OPTION.NEW_ORDER, title: IssueConstants.ROW_NEW_ORDER },
        { id: IssueConstants.OPTION.MENU, title: IssueConstants.ROW_MENU },
        human,
      ];
    }
    if (delivered) {
      const categories = IssueConstants.AFTER_DELIVERY_CATEGORIES.filter(
        (category) => !('deliveryOnly' in category) || order.order_type === 'delivery'
      );
      return [
        ...categories.map((category) => ({ id: IssueConstants.ISSUE_PREFIX + category.id, title: category.title })),
        human,
      ];
    }
    const options: HelpOption[] = [{ id: IssueConstants.OPTION.STATUS, title: IssueConstants.ROW_STATUS }];
    if (this._isLate(order)) options.push({ id: IssueConstants.OPTION.LATE, title: IssueConstants.ROW_LATE });
    if ((IssueConstants.CHANGEABLE_STATUSES as readonly string[]).includes(order.status)) {
      options.push({ id: IssueConstants.OPTION.CHANGE, title: IssueConstants.ROW_CHANGE });
    }
    options.push(human);
    return options;
  }

  // ── Menu ──────────────────────────────────────────────────────────────────
  private _showMenu(): boolean {
    const { order, delivered } = this._focusOrder();
    newCart.issue_order_code = order ? order.code : '';
    newCart.issue_category = '';
    const body = !order
      ? IssueConstants.MENU_CORPO_SEM_PEDIDO
      : delivered
        ? IssueConstants.MENU_CORPO_ENTREGUE(order.code)
        : IssueConstants.MENU_CORPO_ANDAMENTO(order.code, this._statusLabel(order));
    respostas.push({
      type: 'list',
      body,
      button: IssueConstants.MENU_BOTAO,
      sections: [{ title: IssueConstants.MENU_SECAO, rows: this._options() }],
    });
    newState = BotState.AWAITING_HELP_OPTION;
    return true;
  }

  private _handleHelpOption(): boolean {
    const options = this._options();
    const byNumber = /^\d+$/.test(texto) && !options.some((option: HelpOption) => option.id === texto)
      ? options[parseInt(texto, 10) - 1]
      : undefined;
    const chosen = byNumber || options.find((option: HelpOption) => option.id === texto)
      || (texto.includes('atendente') ? options.find((option: HelpOption) => option.id === IssueConstants.OPTION.HUMAN) : undefined);
    if (!chosen) {
      respostas.push(IssueConstants.OPCAO_INVALIDA_MENU);
      return this._showMenu();
    }

    const orderCode = newCart.issue_order_code || '';
    if (chosen.id === IssueConstants.OPTION.HUMAN) return this._handoff();
    if (chosen.id === IssueConstants.OPTION.STATUS) return this._showStatus();
    if (chosen.id === IssueConstants.OPTION.CHANGE) {
      respostas.push(IssueConstants.ALTERAR_PEDIDO(orderCode));
      return this._handoff(true);
    }
    if (chosen.id === IssueConstants.OPTION.NEW_ORDER || chosen.id === IssueConstants.OPTION.MENU) {
      newState = BotState.ORDERING_CAT;
      respostas.push(categoryList('order'));
      return true;
    }
    newCart.issue_category = chosen.id.replace(IssueConstants.ISSUE_PREFIX, '');
    // Atraso: registra direto, o detalhe é o próprio atraso.
    if (newCart.issue_category === 'atraso') return this._register(null);
    respostas.push(IssueConstants.PEDIR_DETALHE);
    newState = BotState.AWAITING_ISSUE_DETAIL;
    return true;
  }

  private _showStatus(): boolean {
    newState = BotState.START;
    const lines = this._activeOrders().map((order: RecentOrder) =>
      IssueConstants.STATUS_LINHA(order.code, this._statusLabel(order), this._estimateText(order))
    );
    respostas.push(IssueConstants.STATUS_CABECALHO + lines.join('\n\n'));
    return true;
  }

  private _statusLabel(order: RecentOrder): string {
    const labels = MessagesConstants.STATUS_MAP;
    if (order.status === 'ready') return order.order_type === 'delivery' ? labels.ready_delivery : labels.ready_pickup;
    const known: Record<string, string> = {
      received: labels.received,
      confirmed: labels.confirmed,
      preparing: labels.preparing,
      out_for_delivery: labels.out_for_delivery,
      delivered: labels.delivered,
    };
    return known[order.status] || order.status;
  }

  private _estimateText(order: RecentOrder): string {
    const target = order.scheduled_for || order.estimated_at;
    if (!target) return '';
    const time = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' }).format(new Date(target));
    if (order.scheduled_for) return IssueConstants.AGENDADO_PARA(time);
    return this._isLate(order) ? IssueConstants.PREVISAO_PASSOU(time) : IssueConstants.PREVISAO(time);
  }

  // ── Registro e acompanhamento ─────────────────────────────────────────────
  private _handleDetail(): boolean {
    const skipped = (IssueConstants.SKIP_DETAIL as readonly string[]).includes(texto.trim());
    return this._register(skipped ? null : rawText.trim().slice(0, IssueConstants.DESCRIPTION_MAX_LENGTH));
  }

  private _register(description: string | null): boolean {
    const orderCode = newCart.issue_order_code || null;
    const category = newCart.issue_category || 'outro';
    save_issue = true;
    finalIssue = { order_code: orderCode, category, description };
    newCart.issue_order_code = '';
    newCart.issue_category = '';

    let registered: string = IssueConstants.REGISTRADO(orderCode);
    const order = orderCode ? recentOrders.find((candidate: RecentOrder) => candidate.code === orderCode) : undefined;
    if (order && category === 'atraso') {
      registered += '\n\n' + IssueConstants.STATUS_LINHA(order.code, this._statusLabel(order), this._estimateText(order));
    }
    respostas.push(registered);
    respostas.push({
      type: 'buttons',
      body: IssueConstants.RESOLVEU_PERGUNTA,
      buttons: [
        { id: 'issue_resolvido', title: IssueConstants.RESOLVIDO_BOTAO },
        { id: 'issue_atendente', title: IssueConstants.ATENDENTE_BOTAO },
      ],
    });
    newState = BotState.AWAITING_ISSUE_FOLLOWUP;
    return true;
  }

  private _handleFollowup(): boolean {
    if ((IssueConstants.HUMAN_ANSWERS as readonly string[]).some((answer: string) => texto.includes(answer))) {
      return this._handoff();
    }
    newState = BotState.START;
    if ((IssueConstants.RESOLVED_ANSWERS as readonly string[]).includes(texto)) {
      respostas.push(IssueConstants.OBRIGADO);
      return true;
    }
    // Qualquer outra coisa: encerra a ajuda e deixa os outros handlers tratarem a mensagem.
    currentState = BotState.START;
    return false;
  }

  private _handoff(silent?: boolean): boolean {
    newState = BotState.HUMAN_HANDOFF;
    request_human_handoff = true;
    handoffCustomerName = customerName || '';
    if (!silent) respostas.push(MessagesConstants.CONECTANDO_ATENDENTE);
    return true;
  }
}
