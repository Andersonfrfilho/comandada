class PaymentHandler extends BaseHandler {
  async handle(): Promise<boolean> {
    if (currentState === BotState.AWAITING_MIXED_METHOD) {
      return this._handleMixedMethod();
    }
    if (currentState === BotState.AWAITING_MIXED_AMOUNT) {
      return this._handleMixedAmount();
    }
    if (currentState === BotState.AWAITING_SPLIT_COUNT) {
      return this._handleSplitCount();
    }
    if (currentState === BotState.AWAITING_SPLIT_PAYMENT) {
      return this._handleSplitPayment();
    }
    if (currentState === BotState.AWAITING_SPLIT_CHANGE) {
      return this._handleSplitChange();
    }
    if (currentState === BotState.AWAITING_MIXED_CHANGE) {
      return this._handleMixedChange();
    }
    if (currentState === BotState.AWAITING_PAYMENT) {
      return this._handlePayment();
    }
    if (currentState === BotState.AWAITING_CHANGE) {
      return this._handleChange();
    }
    return false;
  }

  private _nonCashTypes(): PaymentType[] {
    return splitPaymentTypes.filter((paymentType: PaymentType) => paymentType.name !== 'dinheiro');
  }

  private _resolveOrderTypeLabel(): string {
    return (orderTypes.find((orderType: OrderType) => orderType.name === newCart.order_type) || { label: 'Retirada' }).label;
  }

  private _buildDeliveryLines(): { typeLabel: string; feeLine: string; addrFull: string } {
    const addrFull = newCart.address + (newCart.complement ? ', ' + newCart.complement : '');
    const mapsLine = newCart.order_type === 'delivery' ? MessagesConstants.MAPS_LINE(addrFull) : '';
    const typeLabel = newCart.order_type === 'delivery'
      ? MessagesConstants.ENTREGA_LABEL(addrFull, mapsLine)
      : '🏃 *' + this._resolveOrderTypeLabel() + '*';
    const feeLine = newCart.delivery_fee > 0
      ? MessagesConstants.ENTREGA_LINE(fmtBRL(newCart.delivery_fee))
      : MessagesConstants.FRETE_LINE;
    return { typeLabel, feeLine, addrFull };
  }

  private _finalizeOrder(total: number, paymentName: string, paymentMethodLabel: string, changeFor: number | null): void {
    const orderCode = generateOrderCode(tel);
    const { lines, total: subtotal } = cartSummary(newCart.items);
    const { typeLabel, feeLine, addrFull } = this._buildDeliveryLines();

    respostas.push(
      MessagesConstants.PEDIDO_CONFIRMADO_PREFIX
      + lines.join('\n')
      + '\n\n' + MessagesConstants.SUBTOTAL_LINE(fmtBRL(subtotal))
      + feeLine
      + '\n' + MessagesConstants.TOTAL_LINE(fmtBRL(total))
      + '\n\n' + typeLabel
      + MessagesConstants.PAGAMENTO_LINE(paymentMethodLabel, paymentEmoji(paymentName))
      + (changeFor ? MessagesConstants.TROCO_LINE(fmtBRL(changeFor)) : '')
      + orderFooter(orderCode)
    );

    save_order = true;
    finalOrder = {
      tel,
      customer_name: customerName,
      code: orderCode,
      items: newCart.items,
      subtotal,
      delivery_fee: newCart.delivery_fee,
      total,
      order_type: newCart.order_type,
      address: newCart.order_type === 'delivery' ? addrFull : '',
      maps_link: newCart.order_type === 'delivery' ? ('https://maps.google.com/?q=' + encodeURIComponent(addrFull)) : '',
      payment_method: paymentName,
      change_for: changeFor,
      payments: [{ method: paymentName, amount: total, change_for: changeFor, split_label: null }],
    };
    newState = BotState.START;
    newCart = CartConstants.EMPTY();
    maybeAskOptIn();
  }

  private _handleMixedMethod(): boolean {
    const nonCashTypes = this._nonCashTypes();
    let choiceIndex = parseInt(texto) - 1;
    if (isNaN(choiceIndex) || choiceIndex < 0)
      choiceIndex = nonCashTypes.findIndex((paymentType: PaymentType) => paymentType.name === texto);
    if (choiceIndex >= 0 && choiceIndex < nonCashTypes.length) {
      newCart.mixed_method = nonCashTypes[choiceIndex].name;
      newCart.mixed_label  = nonCashTypes[choiceIndex].label;
      const { total: subtotal } = cartSummary(newCart.items);
      const total = subtotal + newCart.delivery_fee;
      newState = BotState.AWAITING_MIXED_AMOUNT;
      respostas.push(MessagesConstants.MISTO_VALOR(fmtBRL(total), nonCashTypes[choiceIndex].label));
    } else {
      respostas.push(MessagesConstants.OPCAO_INVALIDA + '\n\n' + nonCashOptions() + MessagesConstants.DIGITAR_NUMERO);
    }
    return true;
  }

  private _handleMixedAmount(): boolean {
    const entered = parseFloat(texto.replace(',', '.'));
    const { total: subtotal } = cartSummary(newCart.items);
    const total = subtotal + newCart.delivery_fee;
    if (isNaN(entered) || entered <= 0) {
      respostas.push(MessagesConstants.MISTO_VALOR_INVALIDO(newCart.mixed_label || 'cartão'));
    } else if (entered >= total) {
      respostas.push(MessagesConstants.MISTO_VALOR_EXCEDE(newCart.mixed_label || 'cartão', fmtBRL(entered), fmtBRL(total)));
    } else {
      newCart.mixed_amount = entered;
      const cashPart = total - entered;
      newState = BotState.AWAITING_MIXED_CHANGE;
      respostas.push(MessagesConstants.MISTO_PARTE_DINHEIRO(fmtBRL(cashPart)));
    }
    return true;
  }

  private _handleSplitCount(): boolean {
    const splitCount = parseInt(texto);
    if (!splitCount || splitCount < 2 || splitCount > 30) {
      respostas.push(MessagesConstants.DIVIDIR_INVALIDO);
    } else {
      newCart.split_count = splitCount;
      newCart.split_current = 1;
      newCart.split_payments = [];
      const { total: subtotal } = cartSummary(newCart.items);
      const total = subtotal + newCart.delivery_fee;
      const perPerson = fmtBRL(total / splitCount);
      newState = BotState.AWAITING_SPLIT_PAYMENT;
      respostas.push(splitPersonPaymentList(1, splitCount, perPerson));
    }
    return true;
  }

  private _handleSplitPayment(): boolean {
    let choiceIndex = parseInt(texto) - 1;
    if (isNaN(choiceIndex) || choiceIndex < 0)
      choiceIndex = splitPaymentTypes.findIndex((paymentType: PaymentType) => paymentType.name === texto);

    const { total: subtotal } = cartSummary(newCart.items);
    const total = subtotal + newCart.delivery_fee;
    const splitTotal = newCart.split_count;
    const perPerson = total / splitTotal;

    if (choiceIndex < 0 || choiceIndex >= splitPaymentTypes.length) {
      respostas.push(splitPersonPaymentList(newCart.split_current, splitTotal, fmtBRL(perPerson)));
      return true;
    }

    const selectedPayment = splitPaymentTypes[choiceIndex];

    if (selectedPayment.name === 'dinheiro') {
      newCart.payment_method = 'dinheiro';
      newState = BotState.AWAITING_SPLIT_CHANGE;
      respostas.push(MessagesConstants.DIVIDIR_TROCO(newCart.split_current, fmtBRL(perPerson)));
    } else {
      const payments = Array.isArray(newCart.split_payments) ? newCart.split_payments : [];
      payments.push({ person: newCart.split_current, method: selectedPayment.name, label: paymentEmoji(selectedPayment.name) + ' ' + selectedPayment.label, change_for: null });
      newCart.split_payments = payments;

      if (newCart.split_current >= splitTotal) {
        this._finalizeSplitOrder(total, subtotal, splitTotal, perPerson, payments);
      } else {
        newCart.split_current = newCart.split_current + 1;
        newState = BotState.AWAITING_SPLIT_PAYMENT;
        respostas.push(splitPersonPaymentList(newCart.split_current, splitTotal, fmtBRL(perPerson)));
      }
    }
    return true;
  }

  private _handleSplitChange(): boolean {
    const { total: subtotal } = cartSummary(newCart.items);
    const total = subtotal + newCart.delivery_fee;
    const splitTotal = newCart.split_count;
    const perPerson = total / splitTotal;

    let changeFor: number | null = null;
    if (texto !== 'não' && texto !== 'nao') {
      const changeValue = parseTrocoInput(texto, perPerson);
      if (changeValue === null || changeValue <= perPerson) {
        respostas.push(MessagesConstants.DIVIDIR_TROCO_INVALIDO(fmtBRL(perPerson)));
        _earlyResponse = buildPayload();
        return true;
      }
      changeFor = changeValue;
    }

    const payments = Array.isArray(newCart.split_payments) ? newCart.split_payments : [];
    payments.push({ person: newCart.split_current, method: 'dinheiro', label: '💵 Dinheiro', change_for: changeFor });
    newCart.split_payments = payments;

    if (newCart.split_current >= splitTotal) {
      this._finalizeSplitOrder(total, subtotal, splitTotal, perPerson, payments);
    } else {
      newCart.split_current = newCart.split_current + 1;
      newState = BotState.AWAITING_SPLIT_PAYMENT;
      respostas.push(splitPersonPaymentList(newCart.split_current, splitTotal, fmtBRL(perPerson)));
    }
    return true;
  }

  private _finalizeSplitOrder(total: number, subtotal: number, splitTotal: number, perPerson: number, payments: SplitPayment[]): void {
    const orderCode = generateOrderCode(tel);
    const { typeLabel, feeLine, addrFull } = this._buildDeliveryLines();
    const splitLines = payments.map((splitPayment: SplitPayment) =>
      MessagesConstants.SPLIT_PERSON_LINE(splitPayment.person, splitPayment.label, splitPayment.change_for ? fmtBRL(splitPayment.change_for) : null)
    ).join('\n');

    respostas.push(
      MessagesConstants.PEDIDO_CONFIRMADO_PREFIX
      + cartSummary(newCart.items).lines.join('\n')
      + '\n\n' + MessagesConstants.SUBTOTAL_LINE(fmtBRL(subtotal))
      + feeLine
      + '\n' + MessagesConstants.TOTAL_LINE(fmtBRL(total))
      + '\n\n' + typeLabel
      + MessagesConstants.DIVISAO_HEADER(splitTotal, fmtBRL(perPerson))
      + splitLines
      + orderFooter(orderCode)
    );

    save_order = true;
    finalOrder = {
      tel,
      customer_name: customerName,
      code: orderCode,
      items: newCart.items,
      subtotal,
      delivery_fee: newCart.delivery_fee,
      total,
      order_type: newCart.order_type,
      address: newCart.order_type === 'delivery' ? addrFull : '',
      maps_link: newCart.order_type === 'delivery' ? ('https://maps.google.com/?q=' + encodeURIComponent(addrFull)) : '',
      payment_method: 'dividido: ' + payments.map((splitPayment: SplitPayment) => splitPayment.label).join(', '),
      change_for: null,
      split_count: splitTotal,
      split_payments: payments,
      payments: payments.map((splitPayment: SplitPayment) => ({
        method: splitPayment.method || 'dinheiro',
        amount: perPerson,
        change_for: splitPayment.change_for,
        split_label: 'Pessoa ' + splitPayment.person,
      })),
    };
    newState = BotState.START;
    newCart = CartConstants.EMPTY();
    maybeAskOptIn();
  }

  private _handleMixedChange(): boolean {
    const { total: subtotal } = cartSummary(newCart.items);
    const total = subtotal + newCart.delivery_fee;
    const entered = newCart.mixed_amount;
    const cashPart = total - entered;

    let changeFor: number | null = null;
    if (texto !== 'não' && texto !== 'nao') {
      const changeValue = parseTrocoInput(texto, cashPart);
      if (changeValue === null || changeValue <= cashPart) {
        respostas.push(MessagesConstants.DIVIDIR_TROCO_INVALIDO(fmtBRL(cashPart)));
        _earlyResponse = buildPayload();
        return true;
      }
      changeFor = changeValue;
    }

    const orderCode = generateOrderCode(tel);
    const { typeLabel, feeLine, addrFull } = this._buildDeliveryLines();
    const changeInfo = changeFor ? MessagesConstants.TROCO_PARA(fmtBRL(changeFor)) : '';

    respostas.push(
      MessagesConstants.PEDIDO_CONFIRMADO_PREFIX
      + cartSummary(newCart.items).lines.join('\n')
      + '\n\n' + MessagesConstants.SUBTOTAL_LINE(fmtBRL(subtotal))
      + feeLine
      + '\n' + MessagesConstants.TOTAL_LINE(fmtBRL(total))
      + '\n\n' + typeLabel
      + '\n' + paymentEmoji(newCart.mixed_method || '') + ' *' + (newCart.mixed_label || 'Cartão') + ':* R$ ' + fmtBRL(entered)
      + '\n💵 *Dinheiro:* R$ ' + fmtBRL(cashPart) + changeInfo
      + orderFooter(orderCode)
    );

    save_order = true;
    finalOrder = {
      tel, customer_name: customerName, code: orderCode, items: newCart.items,
      subtotal, delivery_fee: newCart.delivery_fee, total, order_type: newCart.order_type,
      address: newCart.order_type === 'delivery' ? addrFull : '',
      maps_link: newCart.order_type === 'delivery' ? ('https://maps.google.com/?q=' + encodeURIComponent(addrFull)) : '',
      payment_method: (newCart.mixed_method || 'misto') + '+dinheiro',
      change_for: changeFor,
      payments: [
        { method: newCart.mixed_method || 'cartao', amount: entered, change_for: null, split_label: null },
        { method: 'dinheiro', amount: cashPart, change_for: changeFor, split_label: null },
      ],
    };
    newState = BotState.START;
    newCart = CartConstants.EMPTY();
    maybeAskOptIn();
    return true;
  }

  private _handlePayment(): boolean {
    let choiceIndex = parseInt(texto) - 1;
    if (isNaN(choiceIndex) || choiceIndex < 0)
      choiceIndex = paymentTypes.findIndex((paymentType: PaymentType) => paymentType.name === texto);

    if (choiceIndex >= 0 && choiceIndex < paymentTypes.length) {
      const selectedPayment = paymentTypes[choiceIndex];
      newCart.payment_method = selectedPayment.name;
      const { total: subtotal } = cartSummary(newCart.items);
      const total = subtotal + newCart.delivery_fee;

      if (selectedPayment.name === 'dinheiro') {
        newState = BotState.AWAITING_CHANGE;
        respostas.push(MessagesConstants.PAGAMENTO_DINHEIRO(fmtBRL(total)));
      } else {
        const online = isOnlinePayment(selectedPayment);
        const pixInfo = online
          ? MessagesConstants.PAGAMENTO_ONLINE_A_SEGUIR
          : (selectedPayment.name === 'pix' && pixKey)
            ? MessagesConstants.PIX_INFO(pixKey, pixName)
            : '';
        const splitLine = newCart.split_count > 1
          ? MessagesConstants.SPLIT_LINE(newCart.split_count, fmtBRL(total / newCart.split_count))
          : '';
        const orderCode = generateOrderCode(tel);
        const { typeLabel, feeLine, addrFull } = this._buildDeliveryLines();

        respostas.push(
          MessagesConstants.PEDIDO_CONFIRMADO_PREFIX
          + cartSummary(newCart.items).lines.join('\n')
          + '\n\n' + MessagesConstants.SUBTOTAL_LINE(fmtBRL(subtotal))
          + feeLine
          + '\n' + MessagesConstants.TOTAL_LINE(fmtBRL(total))
          + splitLine
          + '\n\n' + typeLabel
          + MessagesConstants.PAGAMENTO_LINE(selectedPayment.label, paymentEmoji(selectedPayment.name))
          + pixInfo
          + orderFooter(orderCode)
        );

        save_order = true;
        finalOrder = {
          tel, customer_name: customerName, code: orderCode, items: newCart.items,
          subtotal, delivery_fee: newCart.delivery_fee, total, order_type: newCart.order_type,
          address: newCart.order_type === 'delivery' ? addrFull : '',
          maps_link: newCart.order_type === 'delivery' ? ('https://maps.google.com/?q=' + encodeURIComponent(addrFull)) : '',
          payment_method: selectedPayment.name,
          change_for: null,
          payments: [{ method: selectedPayment.name, amount: total, change_for: null, split_label: null }],
        };
        newState = BotState.START;
        newCart = CartConstants.EMPTY();
        maybeAskOptIn();
      }
      return true;
    }

    if (texto === 'dividir' || parseInt(texto) === paymentTypes.length + 1 || texto.toLowerCase().includes('dividir')) {
      newState = BotState.AWAITING_SPLIT_COUNT;
      respostas.push(MessagesConstants.DIVIDIR_CONTA);
      return true;
    }

    if (texto === 'misto' || parseInt(texto) === paymentTypes.length + 2 || texto.toLowerCase().includes('misto')) {
      const nonCashTypes = this._nonCashTypes();
      if (nonCashTypes.length === 0) {
        respostas.push(MessagesConstants.SEM_FORMAS_MISTO);
      } else if (nonCashTypes.length === 1) {
        newCart.mixed_method = nonCashTypes[0].name;
        newCart.mixed_label  = nonCashTypes[0].label;
        const { total: subtotal } = cartSummary(newCart.items);
        const total = subtotal + newCart.delivery_fee;
        newState = BotState.AWAITING_MIXED_AMOUNT;
        respostas.push(MessagesConstants.MISTO_VALOR(fmtBRL(total), nonCashTypes[0].label));
      } else {
        newState = BotState.AWAITING_MIXED_METHOD;
        respostas.push(MessagesConstants.MISTO_ESCOLHER_METODO(nonCashOptions()));
      }
      return true;
    }

    respostas.push(paymentList(newCart.split_count));
    return true;
  }

  private _handleChange(): boolean {
    const { total: subtotal } = cartSummary(newCart.items);
    const total = subtotal + newCart.delivery_fee;

    let changeValue: number | null = null;
    if (texto !== 'não' && texto !== 'nao') {
      changeValue = parseTrocoInput(texto, total);
      if (changeValue === null || changeValue <= total) {
        respostas.push(MessagesConstants.TROCO_INVALIDO(fmtBRL(total)));
        _earlyResponse = buildPayload();
        return true;
      }
    }

    this._finalizeOrder(total, 'dinheiro', 'Dinheiro', changeValue);
    return true;
  }
}
