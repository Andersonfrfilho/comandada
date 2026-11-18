class DeliveryHandler extends BaseHandler {
  async handle(): Promise<boolean> {
    if (currentState === BotState.AWAITING_TYPE) {
      if (texto === MENU_BACK_ID || texto === 'voltar') {
        showOrderConfirmation();
        return true;
      }
      let choiceIndex = parseInt(texto) - 1;
      if (isNaN(choiceIndex) || choiceIndex < 0)
        choiceIndex = orderTypes.findIndex((orderType: OrderType) => orderType.name === texto || orderType.label.toLowerCase() === texto.toLowerCase());
      if (choiceIndex >= 0 && choiceIndex < orderTypes.length) {
        const selectedType = orderTypes[choiceIndex];
        newCart.order_type = selectedType.name;
        if (selectedType.name === 'delivery') {
          askDeliveryAddress();
        } else {
          newCart.delivery_fee = 0;
          newState = BotState.AWAITING_PAYMENT;
          respostas.push(MessagesConstants.TIPO_CONFIRMADO(selectedType.label));
          goToPayment();
        }
      } else {
        respostas.push(orderTypeBtn());
      }
      return true;
    }

    if (currentState === BotState.AWAITING_SAVED_ADDRESS) {
      if (texto === MENU_BACK_ID || texto === 'voltar') {
        this._backToOrderType();
      } else if (texto === SAVED_ADDRESS_USE_ID || texto === 'sim' || texto === 'usar') {
        await this._useSavedAddress();
      } else if (texto === SAVED_ADDRESS_OTHER_ID || texto === 'outro' || texto === 'não' || texto === 'nao') {
        newState = BotState.AWAITING_ADDRESS;
        respostas.push(MessagesConstants.SOLICITAR_ENDERECO);
      } else {
        // Escreveu outro endereço (ou CEP, ou mandou a localização) direto: segue como endereço novo.
        newState = BotState.AWAITING_ADDRESS;
        await this._handleAddress();
      }
      return true;
    }

    if (currentState === BotState.AWAITING_ADDRESS && texto === 'voltar') {
      this._backToOrderType();
      return true;
    }

    if (currentState === BotState.AWAITING_COMPLEMENT && (texto === MENU_BACK_ID || texto === 'voltar')) {
      this._backToOrderType();
      return true;
    }

    if (currentState === BotState.AWAITING_COMPLEMENT && (texto === ADDRESS_FIX_ID || texto === 'corrigir' || texto === 'corrigir endereço' || texto === 'corrigir endereco')) {
      newCart.address = '';
      newCart.complement = '';
      newCart.delivery_fee = 0;
      newState = BotState.AWAITING_ADDRESS;
      respostas.push(MessagesConstants.SOLICITAR_ENDERECO);
      return true;
    }

    if (currentState === BotState.AWAITING_ADDRESS) {
      await this._handleAddress();
      return true;
    }

    if (currentState === BotState.AWAITING_ADDRESS_NUMBER) {
      await this._handleAddressNumber();
      return true;
    }

    if (currentState === BotState.OFFER_PICKUP) {
      if (texto === 'sim') {
        newCart.order_type = 'retirada';
        newCart.delivery_fee = 0;
        newState = BotState.AWAITING_PAYMENT;
        respostas.push(MessagesConstants.RETIRADA_CONFIRMADA);
        goToPayment();
      } else {
        newState = BotState.AWAITING_ADDRESS;
        respostas.push(MessagesConstants.OUTRO_ENDERECO(estCity || ''));
      }
      return true;
    }

    return false;
  }

  private _backToOrderType(): void {
    newCart.order_type = '';
    newCart.address = '';
    newCart.complement = '';
    newCart.delivery_fee = 0;
    if (orderTypes.length > 1) {
      newState = BotState.AWAITING_TYPE;
      respostas.push(orderTypeBtn());
      return;
    }
    showOrderConfirmation();
  }

  // Mesmo endereço da última entrega (já com complemento): recalcula a taxa e vai direto ao pagamento.
  private async _useSavedAddress(): Promise<void> {
    const address = lastDeliveryAddress;
    const { total: cartSubtotal } = cartSummary(newCart.items);
    let routeKm = 0;
    let routeMin = 0;
    if (this._coordsConfigured()) {
      const streetAndNum = (address.match(/^(.+?\s+\d+)/) || [])[1];
      const geoResult = await geocodingProvider.search(address + ', Brasil')
        || (streetAndNum && estCity ? await geocodingProvider.search(streetAndNum.trim() + ', ' + estCity + ', Brasil') : null);
      if (geoResult) {
        const lat = parseFloat(geoResult.lat);
        const lng = parseFloat(geoResult.lon);
        if (haversine(estLat, estLng, lat, lng) > maxRadiusKm) {
          newCart.address = address;
          newState = BotState.OFFER_PICKUP;
          respostas.push(offerPickupBtn(MessagesConstants.ENDERECO_FORA_AREA(maxRadiusKm)));
          return;
        }
        const route = await routingProvider.route(estLat, estLng, lat, lng);
        if (route) { routeKm = route.km; routeMin = route.min; }
      }
    }
    const calcFee = calcDeliveryFee(routeKm, routeMin, cartSubtotal);
    newCart.address = address;
    newCart.complement = '';
    newCart.delivery_fee = calcFee;
    newState = BotState.AWAITING_PAYMENT;
    const feeLine = this._buildEtaLine(calcFee, routeMin, routeKm)
      || (calcFee === 0 ? MessagesConstants.FRETE_GRATIS : MessagesConstants.TAXA_ENTREGA(fmtBRL(calcFee)));
    respostas.push(MessagesConstants.ENDERECO_SALVO_CONFIRMADO(address, feeLine.trim()));
    goToPayment();
  }

  private _coordsConfigured(): boolean {
    return estLat !== 0 || estLng !== 0;
  }

  private _buildEtaLine(calcFee: number, routeMin: number, routeKm: number): string {
    if (routeMin <= 0) return '';
    return calcFee === 0
      ? MessagesConstants.ETA_LINE_GRATIS(routeMin, routeKm.toFixed(1))
      : MessagesConstants.ETA_LINE(fmtBRL(calcFee), routeMin, routeKm.toFixed(1));
  }

  private async _applyRoute(lat: number, lng: number, addressLabel: string): Promise<void> {
    const distance = haversine(estLat, estLng, lat, lng);

    if (this._coordsConfigured() && distance > maxRadiusKm) {
      newCart.address = addressLabel;
      newState = BotState.OFFER_PICKUP;
      respostas.push(offerPickupBtn(MessagesConstants.ENDERECO_FORA_AREA(maxRadiusKm)));
      return;
    }

    let routeKm = 0;
    let routeMin = 0;
    if (this._coordsConfigured()) {
      const route = await routingProvider.route(estLat, estLng, lat, lng);
      if (route) { routeKm = route.km; routeMin = route.min; }
    }

    const { total: cartSubtotal } = cartSummary(newCart.items);
    const calcFee = calcDeliveryFee(routeKm, routeMin, cartSubtotal);
    newCart.address = addressLabel;
    newCart.delivery_fee = calcFee;
    newState = BotState.AWAITING_COMPLEMENT;
    respostas.push(locationMsg(lat, lng, MessagesConstants.ENDERECO_ENTREGA_TITULO, addressLabel));
    respostas.push(complementButtons(MessagesConstants.ENDERECO_ENCONTRADO(addressLabel, this._buildEtaLine(calcFee, routeMin, routeKm))));
  }

  private async _handleAddress(): Promise<void> {
    const estCityName = estCity.split(',')[0].trim().toLowerCase();

    if (texto === '__location__' && location_lat != null && location_lng != null) {
      const lat = Number(location_lat);
      const lng = Number(location_lng);
      const distance = haversine(estLat, estLng, lat, lng);

      if (this._coordsConfigured() && distance > maxRadiusKm) {
        newCart.address = MessagesConstants.LOCALIZACAO_COMPARTILHADA;
        newState = BotState.OFFER_PICKUP;
        respostas.push(offerPickupBtn(MessagesConstants.ENDERECO_FORA_AREA(maxRadiusKm)));
        return;
      }

      let routeKm = 0;
      let routeMin = 0;
      if (this._coordsConfigured()) {
        const route = await routingProvider.route(estLat, estLng, lat, lng);
        if (route) { routeKm = route.km; routeMin = route.min; }
      }

      let addressLabel: string = MessagesConstants.LOCALIZACAO_COMPARTILHADA;
      const reverseResult = await geocodingProvider.reverse(lat, lng);
      if (reverseResult?.address) {
        const addr = reverseResult.address;
        const parts = [addr.road, addr.house_number, addr.suburb || addr.neighbourhood, addr.city || addr.town || addr.village, addr.state_code || addr.state].filter(Boolean);
        if (parts.length > 0) addressLabel = parts.join(', ');
      }

      const { total: cartSubtotal } = cartSummary(newCart.items);
      const calcFee = calcDeliveryFee(routeKm, routeMin, cartSubtotal);
      newCart.address = addressLabel;
      newCart.delivery_fee = calcFee;
      newState = BotState.AWAITING_COMPLEMENT;
      respostas.push(locationMsg(lat, lng, MessagesConstants.ENDERECO_ENTREGA_TITULO, addressLabel));
      respostas.push(complementButtons(MessagesConstants.LOCALIZACAO_RECEBIDA(addressLabel, this._buildEtaLine(calcFee, routeMin, routeKm))));
      return;
    }

    const input = texto.trim();
    const cepDigits = input.replace(/\D/g, '');
    let addressToGeocode = input;
    let cepInfo: CepResponse | null = null;

    if (cepDigits.length === 8) {
      cepInfo = await cepProvider.lookup(cepDigits);

      const nonFormattingChars = input.replace(/[\d\s.\-]/g, '');
      const isCepOnly = nonFormattingChars.length === 0;

      if (isCepOnly && cepInfo) {
        const streetLabel = [cepInfo.logradouro, cepInfo.bairro, cepInfo.localidade, cepInfo.uf].filter(Boolean).join(', ');
        newCart.address_street_temp = JSON.stringify({
          logradouro: cepInfo.logradouro || '',
          bairro: cepInfo.bairro || '',
          localidade: cepInfo.localidade || '',
          uf: cepInfo.uf || '',
          cep: cepInfo.cep || '',
        });
        newState = BotState.AWAITING_ADDRESS_NUMBER;
        respostas.push(MessagesConstants.CEP_ENCONTRADO(cepInfo.cep, streetLabel));
        _earlyResponse = buildPayload();
        return;
      }

      if (cepInfo) {
        const parts = [cepInfo.logradouro, cepInfo.bairro, cepInfo.localidade, cepInfo.uf].filter(Boolean);
        if (parts.length > 0) addressToGeocode = parts.join(', ');
      }
    }

    const streetAndNumMatch = input.match(/^(.+?\s+\d+)/);
    const streetAndNum = streetAndNumMatch ? streetAndNumMatch[1].trim() : input;

    let geoResult = await geocodingProvider.search(addressToGeocode + ', Brasil');

    if (!geoResult && estCity && !addressToGeocode.toLowerCase().includes(estCityName)) {
      const withCity = addressToGeocode + ', ' + estCity;
      geoResult = await geocodingProvider.search(withCity + ', Brasil');
      if (geoResult) addressToGeocode = withCity;
    }

    if (!geoResult && estCity && streetAndNum !== addressToGeocode) {
      const stripped = streetAndNum + ', ' + estCity;
      geoResult = await geocodingProvider.search(stripped + ', Brasil');
      if (geoResult) addressToGeocode = stripped;
    }

    if (!geoResult) {
      const hint = cepInfo
        ? MessagesConstants.ENDERECO_HINT_CEP(cepInfo.cep, addressToGeocode)
        : MessagesConstants.ENDERECO_HINT(estCity);
      respostas.push(MessagesConstants.ENDERECO_NAO_ENCONTRADO(hint));
      return;
    }

    await this._applyRoute(parseFloat(geoResult.lat), parseFloat(geoResult.lon), addressToGeocode);
  }

  private async _handleAddressNumber(): Promise<void> {
    const numberInput = texto.trim();
    let streetInfo: Record<string, string> = {};
    try { streetInfo = JSON.parse(newCart.address_street_temp || '{}'); } catch(error) {}

    if (!streetInfo['localidade']) {
      newState = BotState.AWAITING_ADDRESS;
      respostas.push(MessagesConstants.ENDERECO_INVALIDO_RETRY(estCity || ''));
      return;
    }

    const numLabel = numberInput === 's/n' ? 'S/N' : numberInput;
    const fullAddress = [streetInfo['logradouro'], numLabel, streetInfo['bairro'], streetInfo['localidade'], streetInfo['uf']].filter(Boolean).join(', ');
    newCart.address_street_temp = null;

    // O bairro do CEP às vezes não existe no mapa (ex.: "Franca Pólo Club"): tenta de novo só com rua, número e cidade.
    const withoutDistrict = [streetInfo['logradouro'], numLabel, streetInfo['localidade'], streetInfo['uf']].filter(Boolean).join(', ');
    const geoResult = await geocodingProvider.search(fullAddress + ', Brasil')
      || (streetInfo['bairro'] ? await geocodingProvider.search(withoutDistrict + ', Brasil') : null);

    if (!geoResult) {
      const { total: cartSubtotal } = cartSummary(newCart.items);
      const fee = calcDeliveryFee(0, 0, cartSubtotal);
      const mapsLink = 'https://maps.google.com/?q=' + encodeURIComponent(fullAddress);
      newCart.address = fullAddress;
      newCart.delivery_fee = fee;
      const feeMsg = fee === 0 ? MessagesConstants.FRETE_GRATIS : MessagesConstants.TAXA_ENTREGA(fmtBRL(fee));
      newState = BotState.AWAITING_COMPLEMENT;
      // Sem coordenadas: o link do mapa vai em texto (a Meta mostra a prévia) e a pergunta vem em botões.
      respostas.push(MessagesConstants.ENDERECO_CONFIRMADO_CEP(fullAddress, mapsLink, feeMsg));
      respostas.push(complementButtons());
      return;
    }

    await this._applyRoute(parseFloat(geoResult.lat), parseFloat(geoResult.lon), fullAddress);
  }
}
