// ── Leitura de contexto do n8n ───────────────────────────────────────────────
const msgData = ($("Calcular Hora") as { first(): { json: MsgData } }).first().json;
const { tel, instancia, texto: incomingText, horaAtual, diaSemana, location_lat, location_lng } = msgData;

const inputData = $json as N8nInputData;
const establishment: EstablishmentConfig = inputData.establishment || {} as EstablishmentConfig;
const config: Record<string, string>     = inputData.config || {};
const products: Product[]                = inputData.products || [];
const recentOrders: RecentOrder[]        = inputData.recent_orders || [];
const sessionRaw: SessionRaw             = inputData.session || {};
const lastOrder: LastOrder | null        = inputData.last_order || null;
const paymentTypes: PaymentType[]        = inputData.payment_types || [];
const orderTypes: OrderType[]            = inputData.order_types || [];
const conversation: ConversationInfo     = inputData.conversation || { mode: 'bot', human_requested: false };
const partialConfirmation: PartialConfirmation | null = inputData.partial_confirmation || null;
const lastDeliveryAddress: string = (inputData.last_delivery_address || '').trim();

// ── TTL de sessão ────────────────────────────────────────────────────────────
const sessionTtlMin = establishment.session_ttl_min ?? parseInt(config['session_ttl_min'] || '60', 10);
const lastActivity  = sessionRaw.last_activity_at ? new Date(sessionRaw.last_activity_at) : null;
const sessionExpired = lastActivity
  ? (Date.now() - lastActivity.getTime()) > sessionTtlMin * 60 * 1000
  : false;
const idleStates = ['start', 'ordering', 'repeat_order', 'awaiting_name', 'awaiting_marketing_opt_in'];
let currentState = sessionExpired && !idleStates.includes(sessionRaw.state || 'start')
  ? BotState.START
  : ((sessionRaw.state || BotState.START) as BotState);
const sessionWasReset = sessionExpired && !!sessionRaw.state && !idleStates.includes(sessionRaw.state);

// ── Provedor do WhatsApp → formato de toda resposta (ChannelMessageStrategy) ──
const channelProvider: string = msgData.provider || WhatsAppProvider.META_CLOUD;
const channelStrategy: ChannelMessageStrategy = channelStrategyFor(channelProvider);

// Evolution: "2" digitado vira o id da opção 2 da última lista/botões (fora dos passos de número livre).
function resolveMenuChoice(input: string): string {
  if (channelProvider !== WhatsAppProvider.EVOLUTION || !/^\d+$/.test(input.trim())) return input;
  if (NumericInputStates.includes(currentState)) return input;
  // Troca de item em falta: "1", "2", "3" respondem à mensagem da equipe, não ao último menu do bot.
  if (partialConfirmation && (partialConfirmation.substitutions || []).length > 0
    && currentState !== BotState.AWAITING_PARTIAL_CHOICE) return input;
  const savedCart = sessionRaw.cart && !Array.isArray(sessionRaw.cart) ? sessionRaw.cart : null;
  const choices = (savedCart && savedCart.menu_choices) || {};
  return choices[input.trim()] || input;
}
const texto: string = resolveMenuChoice(incomingText);
const rawText: string = msgData.texto_original || incomingText;

// ── Nome do cliente ──────────────────────────────────────────────────────────
const customerNameFromDB: string | null = inputData.customer_name || null;
const pushName: string = msgData.push_name || '';
const pushNameValidation = (!customerNameFromDB && pushName) ? validateName(pushName) : { valid: false };
const pushNameFormatted: string | null  = pushNameValidation.valid ? capitalizeName(pushName) : null;
const customerName: string | null       = customerNameFromDB || pushNameFormatted || null;
const marketingOptIn: boolean | null    = inputData.marketing_opt_in !== undefined && inputData.marketing_opt_in !== null
  ? Boolean(inputData.marketing_opt_in) : null;

// ── Carrinho ─────────────────────────────────────────────────────────────────
const rawCart: Partial<Cart> | CartItem[] | undefined = sessionRaw.cart;
let currentCart: Cart;
if (Array.isArray(rawCart)) {
  currentCart = { ...CartConstants.EMPTY(), items: rawCart };
} else if (rawCart && typeof rawCart === 'object') {
  currentCart = {
    items:              Array.isArray(rawCart.items) ? rawCart.items : [],
    order_type:         rawCart.order_type || '',
    address:            rawCart.address || '',
    complement:         rawCart.complement || '',
    delivery_fee:       rawCart.delivery_fee || 0,
    payment_method:     rawCart.payment_method || '',
    change_for:         rawCart.change_for != null ? rawCart.change_for : null,
    split_count:        rawCart.split_count || 0,
    split_current:      rawCart.split_current || 0,
    split_payments:     Array.isArray(rawCart.split_payments) ? rawCart.split_payments : [],
    mixed_method:       rawCart.mixed_method || '',
    mixed_label:        rawCart.mixed_label || '',
    mixed_amount:       rawCart.mixed_amount || 0,
    address_street_temp: rawCart.address_street_temp || null,
    browse_category:    rawCart.browse_category || '',
    browse_page:        rawCart.browse_page || 0,
    browse_cat_page:    rawCart.browse_cat_page || 0,
    pending_item_id:    rawCart.pending_item_id || null,
    pending_item_name:  rawCart.pending_item_name || '',
    pending_item_note:  rawCart.pending_item_note || '',
    pending_group:      rawCart.pending_group || '',
    last_item_id:       rawCart.last_item_id || null,
    scheduled_date:     rawCart.scheduled_date || '',
    scheduled_time:     rawCart.scheduled_time || '',
    schedule_from_menu: rawCart.schedule_from_menu === true,
    issue_order_code:   rawCart.issue_order_code || '',
    issue_category:     rawCart.issue_category || '',
    text_order:         rawCart.text_order || null,
    edit_index:         typeof rawCart.edit_index === 'number' ? rawCart.edit_index : null,
    partial_picks:      rawCart.partial_picks && typeof rawCart.partial_picks === 'object' ? rawCart.partial_picks : null,
    partial_pick_index: typeof rawCart.partial_pick_index === 'number' ? rawCart.partial_pick_index : null,
    order_note:         rawCart.order_note || '',
    order_note_asked:   rawCart.order_note_asked === true,
  };
} else {
  currentCart = CartConstants.EMPTY();
}

// ── Configurações de negócio ─────────────────────────────────────────────────
const openingTime    = establishment.opening_time  || config['opening_time']  || '18:00';
const closingTime    = establishment.closing_time  || config['closing_time']  || '23:00';
const workingDays    = (establishment.working_days || config['working_days'] || 'ter,qua,qui,sex,sab,dom').split(',');
const ignoreHours    = establishment.ignore_hours  ?? config['ignore_hours'] === 'true';
const estName        = establishment.name          || config['establishment_name']    || 'nosso estabelecimento';
const customClosed   = establishment.msg_closed   || config['msg_closed'];
const msgClosed      = customClosed
  ? customClosed.replace(/\\n/g, '\n')
  : MessagesConstants.FECHADO(estName, formatWorkingDays(workingDays), formatHour(openingTime), formatHour(closingTime));
const msgWelcome     = (establishment.msg_welcome  || config['msg_welcome']  || MessagesConstants.BOAS_VINDAS(estName)).replace(/\\n/g, '\n');
const estCity        = establishment.city          || config['establishment_city']    || '';
const estAddress     = establishment.address       || config['establishment_address'] || '';
const estInstagram   = establishment.instagram     || config['establishment_instagram'] || '';
const estWebsite     = establishment.website       || config['establishment_website']   || '';
const minOrderValue  = establishment.min_order_value != null ? establishment.min_order_value : parseFloat(config['min_order_value'] || '0');
const brandSticker: StickerMessage | null = establishment.sticker_url
  ? { type: 'sticker', link: establishment.sticker_url }
  : null;
// Logo na faixa da cor da marca: topo da mensagem única da saudação na Meta.
const brandHeaderImage: string = establishment.header_image_url || '';
// "📄 Ver cardápio completo": PDF que a API gera do cadastro. Sem URL pública a opção não aparece.
const menuPdfUrl: string = establishment.menu_pdf_url || '';
// Mensagem que chegou como áudio: o texto é a transcrição, e a resposta abre mostrando o que foi ouvido.
const fromAudio: boolean = !!msgData.from_audio;
// Pedido por áudio (FEATURE_AUDIO_ORDERS na API): desligado, o bot não fala em áudio e pede para escrever.
const audioOrdersEnabled: boolean = config['feature_audio_orders'] === 'true';
const kitchenPhone   = establishment.kitchen_phone  || config['kitchen_phone']           || '';

// ── Tipos de pedido / entrega ────────────────────────────────────────────────
const featureDelivery = orderTypes.some((orderType: OrderType) => orderType.name === 'delivery');
const featureRetirada = orderTypes.some((orderType: OrderType) => orderType.name === 'retirada');
const feeRule         = inputData.delivery_fee_rule || {} as DeliveryFeeRule;
const feeMode         = feeRule.mode          || 'fixed';
const baseFee         = Number(feeRule.base_fee      ?? 0);
const feePerKm        = Number(feeRule.per_km_rate   ?? 0);
const feePerMin       = Number(feeRule.per_min_rate  ?? 0);
const freeDeliveryAbove = Number(feeRule.free_above  ?? 0);
const maxRadiusKm     = Number(feeRule.max_radius_km ?? 10);
const estLat          = establishment.lat ?? Number(config['establishment_lat'] || 0);
const estLng          = establishment.lng ?? Number(config['establishment_lng'] || 0);

// ── PAGAMENTO ONLINE ─────────────────────────────────────────────────────────
// Com a conta de pagamento ligada (API), Pix vem com config.online e entra "cartão pelo link":
// a API gera a cobrança e o pedido só vai para a cozinha depois de pago. Só vale para pagamento
// de uma parte: divisão e misto usam as formas de sempre.
const ONLINE_ONLY_PAYMENT_TYPES = ['link_cartao'];
function isOnlinePayment(paymentType: PaymentType): boolean {
  return !!paymentType && !!paymentType.config && paymentType.config['online'] === 'true';
}
const splitPaymentTypes: PaymentType[] = paymentTypes.filter((paymentType: PaymentType) => !ONLINE_ONLY_PAYMENT_TYPES.includes(paymentType.name));

// ── PIX ──────────────────────────────────────────────────────────────────────
const pixType   = paymentTypes.find((paymentType: PaymentType) => paymentType.name === 'pix') || {} as PaymentType;
const pixConfig = pixType.config || {} as Record<string, string>;
const pixKey    = pixConfig['chave'] || '';
const pixName   = pixConfig['nome']  || '';

// ── Reservas ─────────────────────────────────────────────────────────────────
const restaurantTables: RestaurantTable[]         = inputData.restaurant_tables || [];

// ── Encomendas (horários livres vindos da agenda da API) ─────────────────────
const scheduleSlots: ScheduleDay[]                 = (inputData.schedule_slots || []).filter((day: ScheduleDay) => day.times.length > 0);
const upcomingReservations: UpcomingReservation[] = inputData.upcoming_reservations || [];
let newReservationTemp: ReservationTemp = sessionRaw.reservation_temp || {};

// ── Estado mutable ───────────────────────────────────────────────────────────
let respostas: OutgoingMessage[]    = [];
let newState: BotState              = currentState;
let newCart: Cart                   = JSON.parse(JSON.stringify(currentCart));
let save_order                      = false;
let orderScheduledFor: string | null = null;
let finalOrder: Order | null        = null;
let save_reservation                = false;
let finalReservation: Reservation | null = null;
let save_customer_name              = false;
let customerNameToSave: string | null = null;
let save_marketing_opt_in           = false;
let marketing_opt_in_value: boolean | null = null;
let request_human_handoff            = false;
let handoffCustomerName              = '';
let save_issue                      = false;
let finalIssue: CustomerIssue | null = null;
let save_partial_answer             = false;
let partialAnswer: PartialConfirmationAnswer | null = null;

// Usado pelos handlers para retorno antecipado (evita top-level return)
let _earlyResponse: N8nResponsePayload | null = null;

// ── HTTP helper global — captura o contexto do n8n via arrow (herda 'this' externo) ──
interface N8nRuntimeContext {
  helpers: { httpRequest: (options: Record<string, unknown>) => Promise<unknown> };
}
const _httpRequest = async (options: Record<string, unknown>): Promise<unknown> =>
  // @ts-ignore — arrow captura o 'this' do n8n Code node; TS7041 é falso-positivo em module:none
  (this as unknown as N8nRuntimeContext).helpers.httpRequest(options);

// ── Providers de integração externa ──────────────────────────────────────────
const httpClient: HttpClientProvider       = new N8nHttpClientProviderImplementation();
const cepProvider: CepProvider             = new ViaCepProviderImplementation(httpClient);
const geocodingProvider: GeocodingProvider = new NominatimProviderImplementation(httpClient);
const routingProvider: RoutingProvider     = new OsrmProviderImplementation(httpClient);

// ── Guard de input raw ───────────────────────────────────────────────────────
const expectingRawInput = ExpectingRawInputStates.includes(currentState);

// Resposta à troca sugerida pela equipe: 1 aceitar, 2 escolher outro, 3 sem o item, NÃO cancelar.
type PartialSubstituteReply = 'accept' | 'choose' | 'without' | 'decline';
function partialSubstituteReplyOf(input: string): PartialSubstituteReply | null {
  const answer = input.trim().toLowerCase().replace(/[!.]+$/, '');
  if (['1', 'sim', 's', 'aceito', 'aceitar', 'pode trocar', 'pode', 'ok', 'partial:accept', 'partial:yes'].includes(answer)) return 'accept';
  if (['2', 'outro', 'escolher outro', 'quero outro', 'trocar', 'partial:choose'].includes(answer)) return 'choose';
  if (['3', 'sem', 'sem o item', 'sem item', 'tira', 'tirar', 'remover', 'partial:without'].includes(answer)) return 'without';
  if (['não', 'nao', 'n', 'cancela', 'cancelar', 'pode cancelar', 'partial:no'].includes(answer)) return 'decline';
  return null;
}

// Mensagem que pertence à confirmação parcial pendente (passa mesmo com a loja fechada).
function isPartialReply(input: string): boolean {
  if (!partialConfirmation) return false;
  if ((partialConfirmation.substitutions || []).length === 0) return partialAnswerOf(input) !== null;
  return currentState === BotState.AWAITING_PARTIAL_CHOICE || partialSubstituteReplyOf(input) !== null;
}

// SIM/NÃO da confirmação parcial; null quando a mensagem é outra coisa.
function partialAnswerOf(input: string): boolean | null {
  const answer = input.trim().replace(/[!.]+$/, '');
  if (['sim', 's', 'pode', 'pode seguir', 'confirmo', 'ok', 'partial:yes'].includes(answer)) return true;
  if (['não', 'nao', 'n', 'cancela', 'cancelar', 'pode cancelar', 'partial:no'].includes(answer)) return false;
  return null;
}

// ── Funções de formatação ────────────────────────────────────────────────────
function fmtBRL(value: number): string {
  return Number(value).toFixed(2).replace('.', ',');
}

// "ter,qua,qui,sex,sab,dom" → "de terça a domingo"; dias soltos viram lista ("segunda, quarta e sexta").
// As tabelas ficam dentro da função porque ela é chamada no topo do script, antes destas linhas.
function formatWorkingDays(days: string[]): string {
  const WEEKDAY_ORDER = ['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom'];
  const WEEKDAY_FULL_NAME: Record<string, string> = {
    seg: 'segunda', ter: 'terça', qua: 'quarta', qui: 'quinta', sex: 'sexta', sab: 'sábado', dom: 'domingo',
  };
  const indexes = days
    .map((day: string) => WEEKDAY_ORDER.indexOf(day.trim().toLowerCase().replace('á', 'a')))
    .filter((index: number) => index >= 0)
    .sort((first: number, second: number) => first - second);
  if (indexes.length === 0) return 'todos os dias';
  if (indexes.length === 7) return 'todos os dias';
  const names = indexes.map((index: number) => WEEKDAY_FULL_NAME[WEEKDAY_ORDER[index]]);
  const isSequence = indexes.every((index: number, position: number) => position === 0 || index === indexes[position - 1] + 1);
  if (isSequence && indexes.length >= 3) return 'de ' + names[0] + ' a ' + names[names.length - 1];
  if (names.length === 1) return names[0];
  return names.slice(0, -1).join(', ') + ' e ' + names[names.length - 1];
}

// "18:00" → "18h"; "18:30" → "18h30".
function formatHour(time: string): string {
  const [hours, minutes] = time.split(':');
  return parseInt(hours, 10) + 'h' + (minutes && minutes !== '00' ? minutes : '');
}

function fmtDuration(minutes: number): string {
  if (minutes < 60) return minutes + ' min';
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return hours + 'h' + (mins > 0 ? ' ' + mins + 'min' : '');
}

function fmtDate(iso: string): string {
  return iso ? iso.split('-').reverse().join('/') : '';
}

function validateName(raw: string): ValidarNomeResult {
  const name = raw.trim();
  if (name.length < 2) return { valid: false, reason: 'short' };
  if (/\d/.test(name)) return { valid: false, reason: 'numbers' };
  if (!/^[\p{L}\s'\-]+$/u.test(name)) return { valid: false, reason: 'invalid_chars' };
  if (/^(.)\1{3,}$/u.test(name.replace(/\s/g, ''))) return { valid: false, reason: 'repeated' };
  const bad = ['merda','porra','caralho','buceta','viado','puta','fdp','cuzão','cuza','cuzao','fuder','foder','foda','arrombado','babaca','idiota','imbecil','cretino','otario','otário','lixo','vagabundo','vagabunda','piranha','safado','safada','desgraça','desgraca','bosta','pau','cacete','xoxota','pentelho','prostituta'];
  const lower = name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  for (const word of bad) {
    const wordNorm = word.normalize('NFD').replace(/[̀-ͯ]/g, '');
    if (lower === wordNorm || lower.split(/\s+/).includes(wordNorm)) return { valid: false, reason: 'bad_word' };
  }
  return { valid: true };
}

function capitalizeName(name: string): string {
  return name.trim().replace(/\b\p{L}/gu, (char: string) => char.toUpperCase());
}

/** Maior quantidade de um mesmo item no carrinho (a API recusa acima disso). */
const MAX_ITEM_QTY = 99;
/** Maior valor em dinheiro aceito do cliente (troco, parte do pagamento misto). */
const MAX_MONEY_INPUT = 10000;

/** Quantidade digitada: só número inteiro de 1 a 99 ("5abc", "0", "-2", "2.5" e vazio não valem). */
function parseQuantityInput(text: string): number | null {
  const trimmed = String(text ?? '').trim();
  if (!/^\d{1,3}$/.test(trimmed)) return null;
  const quantity = Number(trimmed);
  return quantity >= 1 && quantity <= MAX_ITEM_QTY ? quantity : null;
}

/**
 * Valor em reais digitado: "100", "100,50", "100.50", "1.000", "1.000,50", "R$ 50". Recusa
 * zero, negativo, letra no meio, "Infinity", mais de 2 casas e acima de R$ 10.000.
 */
function parseMoneyInput(text: string): number | null {
  let normalized = String(text ?? '').trim().toLowerCase().replace(/^r\$\s*/, '').replace(/\s+/g, '');
  const withThousands = /^\d{1,3}(\.\d{3})+(,\d{1,2})?$/;
  const plain = /^\d{1,7}([.,]\d{1,2})?$/;
  if (withThousands.test(normalized)) normalized = normalized.replace(/\./g, '').replace(',', '.');
  else if (plain.test(normalized)) normalized = normalized.replace(',', '.');
  else return null;
  const value = Number(normalized);
  return Number.isFinite(value) && value > 0 && value <= MAX_MONEY_INPUT ? value : null;
}

function parseTrocoInput(texto: string, amountToPay: number): number | null {
  const normalized = String(texto ?? '').trim().toLowerCase();
  const trocoMatch = normalized.match(/^(?:r\$\s*)?([\d.,]+)\s*(?:de\s*)?troco$/) || normalized.match(/^troco\s*(?:de\s*)?(?:r\$\s*)?([\d.,]+)$/);
  if (trocoMatch) {
    const troco = parseMoneyInput(trocoMatch[1]);
    return troco === null ? null : amountToPay + troco;
  }
  return parseMoneyInput(normalized);
}

/**
 * Põe o item no carrinho somando com o que já existe, sem passar de 99 unidades.
 * Devolve true quando precisou parar no limite, para o handler avisar o cliente.
 */
function mergeCartItem(items: CartItem[], item: CartItem): boolean {
  const addedQty = Math.max(0, Math.floor(Number(item.qty) || 0));
  if (addedQty < 1) return false;
  // Mesmo produto com observação diferente é outra linha: "1 sem cebolinha" e "1 normal" não se misturam.
  const noteKey = (note?: string) => (note || '').trim().toLowerCase();
  const existing = items.find((cartItem: CartItem) => String(cartItem.id) === String(item.id) && noteKey(cartItem.note) === noteKey(item.note));
  const wanted = (existing ? existing.qty : 0) + addedQty;
  const accepted = Math.min(wanted, MAX_ITEM_QTY);
  if (existing) existing.qty = accepted;
  else items.push({ ...item, qty: accepted });
  return accepted < wanted;
}

/**
 * Uma linha de item igual em todo resumo (carrinho, confirmação, texto livre, repetir pedido):
 * quantidade e nome em cima, valores embaixo com recuo. O WhatsApp não tem fonte monoespaçada,
 * então alinhar em coluna não funciona; duas linhas por item ficam alinhadas em qualquer celular.
 */
function orderItemLine(name: string, qty: number, unitPrice: number, note?: string): string {
  const subtotal = unitPrice * qty;
  const values = qty > 1
    ? MessagesConstants.ITEM_VALORES_VARIOS(fmtBRL(unitPrice), fmtBRL(subtotal))
    : MessagesConstants.ITEM_VALORES_UM(fmtBRL(subtotal));
  return MessagesConstants.ITEM_LINHA(qty, name) + '\n' + values + (note ? '\n' + MessagesConstants.ITEM_OBSERVACAO(note) : '');
}

/** Largura da tabela do pedido em caracteres: cabe na tela de um celular pequeno sem quebrar linha. */
const ORDER_TABLE_WIDTH = 30;
const ORDER_TABLE_INDENT = '  ';
const ORDER_TABLE_QTY_WIDTH = 3;
const ORDER_TABLE_UNIT_WIDTH = 6;

function wrapWords(text: string, width: number): string[] {
  const wrapped: string[] = [];
  let current = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    let remaining = word;
    while (remaining.length > width) {
      if (current) { wrapped.push(current); current = ''; }
      wrapped.push(remaining.slice(0, width));
      remaining = remaining.slice(width);
    }
    if (!remaining) continue;
    if (!current) current = remaining;
    else if (current.length + 1 + remaining.length <= width) current += ' ' + remaining;
    else { wrapped.push(current); current = remaining; }
  }
  if (current) wrapped.push(current);
  return wrapped.length > 0 ? wrapped : [''];
}

/**
 * Itens do pedido como tabela em bloco monoespaçado do WhatsApp (```), o único jeito de as
 * colunas ficarem alinhadas em qualquer celular. O nome ocupa a linha inteira (quebra se for
 * comprido) e embaixo vem a conta do item: quantidade × valor unitário, com o total alinhado à
 * direita. A observação fica na linha seguinte.
 */
function orderTable(items: CartItem[]): string {
  // Pontilhado guia o olho da conta até o total ("13 x  43,00 ...... 559,00"); o cabeçalho usa espaço.
  const calculation = (qty: string, unit: string, total: string, filler: string): string => {
    const left = ORDER_TABLE_INDENT + qty.padStart(ORDER_TABLE_QTY_WIDTH) + ' x ' + unit.padStart(ORDER_TABLE_UNIT_WIDTH) + ' ';
    const right = ' ' + total;
    return left + filler.repeat(Math.max(0, ORDER_TABLE_WIDTH - left.length - right.length)) + right;
  };
  const rows: string[] = [
    MessagesConstants.TABELA_ITEM,
    calculation(MessagesConstants.TABELA_QTD, MessagesConstants.TABELA_UNITARIO, MessagesConstants.TABELA_TOTAL, ' '),
    '-'.repeat(ORDER_TABLE_WIDTH),
  ];
  items.forEach((item: CartItem, index: number) => {
    // Linha em branco entre os itens: cada item vira um bloco fácil de achar.
    if (index > 0) rows.push('');
    rows.push(...wrapWords(item.name, ORDER_TABLE_WIDTH));
    // A observação fica colada no nome, antes da conta: fica claro que é só deste item.
    if (item.note) {
      for (const noteLine of wrapWords(MessagesConstants.TABELA_OBS(item.note), ORDER_TABLE_WIDTH - ORDER_TABLE_INDENT.length)) {
        rows.push(ORDER_TABLE_INDENT + noteLine);
      }
    }
    rows.push(calculation(String(item.qty), fmtBRL(item.price), fmtBRL(item.price * item.qty), '.'));
  });
  return '```\n' + rows.join('\n') + '\n```';
}

/** `lines` traz a tabela inteira num item só: quem junta com '\n' recebe a tabela pronta. */
function cartSummary(items: CartItem[]): CartSummarioResult {
  let total = 0;
  let itemCount = 0;
  for (const item of items) {
    total += item.price * item.qty;
    itemCount += item.qty;
  }
  return { lines: items.length > 0 ? [orderTable(items)] : [], total, itemCount };
}

function calcDeliveryFee(km: number, min: number, subtotal: number): number {
  if (freeDeliveryAbove > 0 && subtotal >= freeDeliveryAbove) return 0;
  let fee: number;
  if (feeMode === 'per_km')            fee = baseFee + km * feePerKm;
  else if (feeMode === 'per_route_min') fee = baseFee + min * feePerMin;
  else if (feeMode === 'zones_km' || feeMode === 'zones_min') {
    const value = feeMode === 'zones_km' ? km : min;
    const zone = (feeRule.zones || []).find((feeZone: FeeZone) => feeZone.type === (feeMode === 'zones_km' ? 'km' : 'min') && value >= feeZone.min && value < feeZone.max);
    fee = zone ? zone.fee : baseFee;
  } else fee = baseFee;
  return Math.ceil(fee * 10) / 10;
}

function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function generateReservationCode(phone: string): string {
  return generateOrderCode(phone).replace(/^PED-/, 'RES-');
}

function generateOrderCode(phone: string): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return 'PED-' + now.getFullYear() + pad(now.getMonth()+1) + pad(now.getDate()) + pad(now.getHours()) + pad(now.getMinutes()) + pad(now.getSeconds()) + '-' + phone.slice(-4);
}

// Datas em hora de São Paulo: toISOString() é UTC e, depois das 21h, "hoje" virava amanhã.
function todayLocalIso(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

function shiftIsoDate(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split('-').map((part: string) => parseInt(part, 10));
  return new Date(Date.UTC(year, month - 1, day + days, 12)).toISOString().split('T')[0];
}

function parseDate(text: string): string | null {
  const today = todayLocalIso();
  const normalized = text.toLowerCase();
  if (normalized.includes('hoje')) return today;
  if (normalized.includes('amanhã') || normalized.includes('amanha')) return shiftIsoDate(today, 1);
  const ddmm = normalized.match(/(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{4}))?/);
  if (ddmm) {
    const year = ddmm[3] ? parseInt(ddmm[3]) : parseInt(today.slice(0, 4));
    let candidate = year + '-' + ddmm[2].padStart(2, '0') + '-' + ddmm[1].padStart(2, '0');
    if (!ddmm[3] && candidate < today) candidate = (year + 1) + candidate.slice(4);
    return candidate;
  }
  const dayMap: Record<string, number> = {'segunda':1,'terça':2,'terca':2,'quarta':3,'quinta':4,'sexta':5,'sábado':6,'sabado':6,'domingo':0};
  const [todayYear, todayMonth, todayDay] = today.split('-').map((part: string) => parseInt(part, 10));
  const todayWeekday = new Date(Date.UTC(todayYear, todayMonth - 1, todayDay, 12)).getUTCDay();
  for (const [dayName, dayNum] of Object.entries(dayMap)) {
    if (normalized.includes(dayName)) {
      let diff = (dayNum - todayWeekday + 7) % 7;
      if (diff === 0) diff = 7;
      return shiftIsoDate(today, diff);
    }
  }
  return null;
}

function parseTime(text: string): string | null {
  const match = text.match(/(\d{1,2})\s*[hH]\s*(\d{2})?|(\d{1,2}):(\d{2})/);
  if (!match) return null;
  if (match[1] !== undefined) return match[1].padStart(2,'0') + ':' + (match[2] || '00');
  return match[3].padStart(2,'0') + ':' + match[4];
}

function parsePeople(text: string): number | null {
  const match1 = text.match(/para\s+(\d{1,2})\s*(?:pessoas?|pax)?/i);
  if (match1) { const count = parseInt(match1[1]); if (count>=1 && count<=30) return count; }
  const match2 = text.match(/(\d{1,2})\s*(?:pessoas?|pax|adultos?)/i);
  if (match2) { const count = parseInt(match2[1]); if (count>=1 && count<=30) return count; }
  return null;
}

// ── Builders de mensagens UI ─────────────────────────────────────────────────
// Pedido do cliente que ainda não foi entregue nem cancelado.
function hasOrderInProgress(): boolean {
  return recentOrders.some((order: RecentOrder) => (IssueConstants.OPEN_STATUSES as readonly string[]).includes(order.status));
}

// Menu principal em 3 botões. Com pedido em andamento troca para "Meu pedido", "Ajuda com o pedido"
// (que também leva ao atendente) e "Fazer pedido"; sem pedido, nada de "meu pedido"/"ajuda".
function mainMenu(): ButtonMessage {
  const newOrder = { id: '2', title: MessagesConstants.MENU_FAZER_PEDIDO };
  if (hasOrderInProgress()) {
    return {
      type: 'buttons',
      body: MessagesConstants.MENU_PRINCIPAL_COM_PEDIDO,
      buttons: [
        { id: 'meu pedido', title: MessagesConstants.MENU_MEU_PEDIDO },
        { id: 'ajuda', title: MessagesConstants.MENU_AJUDA_PEDIDO },
        newOrder,
      ],
    };
  }
  // Com horários livres na agenda, "Agendar pedido" entra no lugar de "Reservar mesa" (a Meta aceita 3 botões
  // e o 4º viraria lista, sem o logo no topo); reservar continua por escrito.
  if (scheduleSlots.length > 0) {
    return {
      type: 'buttons',
      body: MessagesConstants.MENU_PRINCIPAL + MessagesConstants.MENU_RESERVAR_DICA,
      buttons: [
        newOrder,
        { id: SCHEDULE_START_ID, title: MessagesConstants.MENU_AGENDAR_PEDIDO },
        { id: '4', title: MessagesConstants.MENU_ATENDENTE },
      ],
    };
  }
  return {
    type: 'buttons',
    body: MessagesConstants.MENU_PRINCIPAL,
    buttons: [
      newOrder,
      { id: '3', title: MessagesConstants.MENU_RESERVAR_MESA },
      { id: '4', title: MessagesConstants.MENU_ATENDENTE },
    ],
  };
}

function yesNo(body: string): ButtonMessage {
  return { type: 'buttons', body, buttons: [{ id: 'sim', title: 'Sim ✅' }, { id: 'não', title: 'Não ❌' }] };
}

function confirmBtn(body: string): ButtonMessage {
  return {
    type: 'buttons',
    body,
    buttons: [{ id: 'sim', title: '✅ Confirmar' }, { id: 'cart:edit', title: MessagesConstants.EDITAR_BOTAO_CURTO }, { id: 'não', title: '❌ Cancelar' }],
  };
}

function offerPickupBtn(body: string): ButtonMessage {
  return { type: 'buttons', body, buttons: [{ id: 'sim', title: '✅ Sim, retirar' }, { id: 'não', title: '📍 Outro endereço' }] };
}

function orderTypeBtn(): ButtonMessage {
  return {
    type: 'buttons',
    body: MessagesConstants.SOLICITAR_TIPO_PEDIDO,
    // Até 2 formas cabem com o "Voltar" (3 botões); com 3 formas a Meta vira lista e o Voltar entra junto.
    buttons: [
      ...orderTypes.filter((orderType: OrderType) => orderType.active !== false).slice(0, 3).map((orderType: OrderType) => ({ id: orderType.name, title: orderType.label })),
      { id: MENU_BACK_ID, title: MessagesConstants.VOLTAR_RESUMO },
    ],
  };
}

function paymentEmoji(name: string): string {
  if (name === 'pix') return '🔷';
  if (name === 'dinheiro') return '💵';
  return '💳';
}

function paymentList(splitCount: number, hideMixed?: boolean): ListMessage {
  const rows = paymentTypes.map((paymentType: PaymentType) => ({ id: paymentType.name, title: paymentEmoji(paymentType.name) + ' ' + paymentType.label }));
  if (!splitCount || splitCount < 2) rows.push({ id: 'dividir', title: '👥 Dividir entre pessoas' });
  if (!hideMixed && paymentTypes.length > 1) rows.push({ id: 'misto', title: '💰 Pagamento misto' });
  rows.push({ id: MENU_BACK_ID, title: orderTypes.length > 1 ? MessagesConstants.VOLTAR_FORMA_RECEBER : MessagesConstants.VOLTAR_RESUMO });
  return { type: 'list', body: MessagesConstants.SOLICITAR_PAGAMENTO, button: MessagesConstants.VER_OPCOES, sections: [{ title: MessagesConstants.FORMA_PAGAMENTO_TITULO, rows }] };
}

function splitPersonPaymentList(personNum: number, totalPersons: number, perPersonStr: string): ListMessage {
  const rows = splitPaymentTypes.map((paymentType: PaymentType) => ({ id: paymentType.name, title: paymentEmoji(paymentType.name) + ' ' + paymentType.label }));
  return {
    type: 'list',
    body: MessagesConstants.DIVIDIR_PESSOA_LISTA(totalPersons, perPersonStr, personNum),
    button: MessagesConstants.VER_OPCOES,
    sections: [{ title: MessagesConstants.FORMA_PAGAMENTO_TITULO, rows }],
  };
}

function notifBtn(currentOptIn: boolean | null): ButtonMessage {
  const status = currentOptIn === true
    ? MessagesConstants.NOTIF_STATUS_ATIVAS
    : currentOptIn === false
      ? MessagesConstants.NOTIF_STATUS_DESATIVADAS
      : MessagesConstants.NOTIF_STATUS_CONFIGURAR;
  if (currentOptIn === true) return { type: 'buttons', body: status, buttons: [{ id: 'desativar', title: '🔕 Desativar' }, { id: '0', title: '↩️ Voltar' }] };
  return { type: 'buttons', body: status, buttons: [{ id: 'ativar', title: '🔔 Ativar' }, { id: '0', title: '↩️ Voltar' }] };
}

function isNextPageCommand(input: string): boolean {
  return ['próxima', 'proxima', 'próximo', 'proximo', 'mais', 'ver mais'].includes(input.trim());
}

function menuCategories(): string[] {
  return [...new Set(products.map((product: Product) => product.category || 'Outros'))] as string[];
}

function menuTotalPages(count: number): number {
  return Math.max(1, Math.ceil(count / MENU_PAGE_SIZE));
}

function categoryEmoji(categoryName: string): string {
  const withEmoji = products.find((product: Product) => (product.category || 'Outros') === categoryName && !!product.emoji);
  return withEmoji?.emoji || menuEmojiFor(categoryName);
}

// Com o PDF do cardápio, cada página de categorias guarda uma linha para "📄 Ver cardápio completo".
function categoryPageSize(): number {
  return itemsPageSize() - (menuPdfUrl ? 1 : 0);
}

const SCHEDULE_START_ID = 'schedule:start';
const SCHEDULE_NOW_ID = 'schedule:now';
// Voltar dos menus usa o id "0": na Evolution ele aparece sempre como opção 0.
const MENU_BACK_ID = '0';

// Com itens no carrinho, cada lista do cardápio guarda uma linha para "🛒 Finalizar pedido":
// o cliente não fica obrigado a escolher mais nada para fechar.
function itemsPageSize(): number {
  return newCart.items.length > 0 ? MENU_PAGE_SIZE - 1 : MENU_PAGE_SIZE;
}

function checkoutShortcut(): MenuCheckout | undefined {
  if (newCart.items.length === 0) return undefined;
  const { total, itemCount } = cartSummary(newCart.items);
  return {
    id: 'finalizar',
    title: MessagesConstants.MENU_FINALIZAR,
    description: MessagesConstants.MENU_FINALIZAR_DESCRICAO(itemCount, fmtBRL(total)),
  };
}

function menuPdfMessage(): DocumentMessage {
  return {
    type: 'document',
    link: menuPdfUrl,
    filename: MessagesConstants.CARDAPIO_PDF_ARQUIVO(estName),
    caption: MessagesConstants.CARDAPIO_PDF_LEGENDA(estName),
  };
}

// returning: voltou de uma categoria; a dica de escrever/mandar áudio só aparece na primeira vez.
function categoryList(context: string, page?: number, returning?: boolean): ListMessage | TextMenuMessage | string {
  if (!products || products.length === 0) return MessagesConstants.CARDAPIO_INDISPONIVEL;
  const categories = menuCategories();
  const pageSize = categoryPageSize();
  const totalPages = Math.max(1, Math.ceil(categories.length / pageSize));
  const currentPage = Math.min(Math.max(page || 0, 0), totalPages - 1);
  const start = currentPage * pageSize;
  const prefix = context === 'order' ? 'order_cat:' : 'cat:';
  const options: MenuOption[] = categories.slice(start, start + pageSize).map((categoryName: string, index: number) => {
    const itemCount = menuEntries(categoryName).length;
    return {
      id: prefix + categoryName.toLowerCase(),
      number: start + index + 1,
      emoji: categoryEmoji(categoryName),
      title: categoryName,
      description: MessagesConstants.MENU_CATEGORIA_ITENS(itemCount),
    };
  });
  if (menuPdfUrl) {
    options.push({
      id: 'menu:pdf',
      number: options.length + 1,
      emoji: '📄',
      title: MessagesConstants.CARDAPIO_PDF_OPCAO,
      description: MessagesConstants.CARDAPIO_PDF_OPCAO_DESCRICAO,
    });
  }
  const [heading, defaultSubtitle] = (context === 'order' ? MessagesConstants.CARDAPIO_PEDIDO_TITULO : MessagesConstants.CARDAPIO_TITULO).split('\n\n');
  const showHint = context === 'order' && currentPage === 0 && !returning && newCart.items.length === 0;
  const subtitle = showHint ? MessagesConstants.CARDAPIO_PEDIDO_DICA(orderExample(), audioOrdersEnabled) : defaultSubtitle;
  const scheduledNote = context === 'order' && newCart.scheduled_date && newCart.scheduled_time
    ? MessagesConstants.AGENDADO_PARA(fmtScheduleDay(newCart.scheduled_date), newCart.scheduled_time) + MessagesConstants.AGENDADO_MUDAR_DICA + '\n\n'
    : '';
  return channelStrategy.renderMenu({
    heading,
    subtitle: scheduledNote + (subtitle || ''),
    button: MessagesConstants.VER_CATEGORIAS,
    sectionTitle: MessagesConstants.CATEGORIAS_TITULO,
    options,
    page: currentPage,
    totalPages,
    hasMore: categories.length > start + pageSize,
    nextId: 'próxima',
    backId: '0',
    backLabel: MessagesConstants.MENU_VOLTAR_INICIO,
    checkout: context === 'order' ? checkoutShortcut() : undefined,
  });
}

interface MenuEntry {
  product: Product;
  variants: Product[];
  title: string;
}

// "Temaki de Salmão (Médio)" e "(Grande)" viram uma linha só; o tamanho é perguntado depois.
function variantBaseName(product: Product): string {
  return product.variant_label ? product.name.replace(/\s*\([^)]*\)\s*$/, '') : product.name;
}

function menuEntries(categoryName: string): MenuEntry[] {
  const entries: MenuEntry[] = [];
  const entryByGroup: Record<string, MenuEntry> = {};
  products
    .filter((product: Product) => (product.category || 'Outros') === categoryName)
    .forEach((product: Product) => {
      const group = product.variant_group;
      if (group && entryByGroup[group]) {
        entryByGroup[group].variants.push(product);
        return;
      }
      const entry: MenuEntry = { product, variants: [product], title: variantBaseName(product) };
      if (group) entryByGroup[group] = entry;
      entries.push(entry);
    });
  return entries;
}

// Exemplo de pedido escrito com itens do próprio cardápio: "2 combo tradicional e 1 carpaccio de salmão".
function orderExample(): string {
  const categories = menuCategories();
  const firstEntries = categories.map((categoryName: string) => menuEntries(categoryName)[0]).filter(Boolean);
  const picks = firstEntries.length >= 2 ? firstEntries.slice(0, 2) : menuEntries(categories[0] || '').slice(0, 2);
  if (picks.length === 0) return '2 itens do cardápio';
  const name = (entry: MenuEntry) => entry.title.toLowerCase();
  return picks.length === 1 ? '2 ' + name(picks[0]) : '2 ' + name(picks[0]) + ' e 1 ' + name(picks[1]);
}

function entryPriceText(entry: MenuEntry): string {
  if (entry.variants.length === 1) return 'R$ ' + fmtBRL(entry.product.price);
  return entry.variants
    .map((variant: Product) => (variant.variant_label || variant.name) + ' R$ ' + fmtBRL(variant.price))
    .join(' · ');
}

// Descrição no formato do cadastro: "32 unidades · 4 sashimi de salmão, 8 hot roll".
// O trecho antes do " · " é a porção; o resto é a composição (ou um texto corrido).
interface ProductDescriptionParts {
  head: string;
  parts: string[];
}

function splitDescription(description: string): ProductDescriptionParts {
  const text = String(description || '').trim();
  const separatorIndex = text.indexOf(' · ');
  let head = separatorIndex >= 0 ? text.slice(0, separatorIndex).trim() : '';
  let body = separatorIndex >= 0 ? text.slice(separatorIndex + 3).trim() : text;
  // "Camarão recheado ... (5 unidades)": a porção no fim vira cabeçalho, para não se perder no corte.
  const trailingPortion = !head ? body.match(/^(.*\S)\s*\(([^()]*\d[^()]*)\)\.?$/) : null;
  if (trailingPortion) {
    head = trailingPortion[2].trim();
    body = trailingPortion[1].trim();
  }
  return { head, parts: body.split(/,\s*/).map((part: string) => part.trim()).filter(Boolean) };
}

// Composição = lista de peças com quantidade ("4 sashimi de salmão, 8 hot roll").
function isComposition(parts: string[]): boolean {
  return parts.length > 1 && parts.every((part: string) => /^\d/.test(part));
}

function joinDescription(head: string, body: string): string {
  return [head, body].filter(Boolean).join(' · ');
}

// Linha de lista (limite da Meta): nunca corta no meio de uma palavra. Composição que não cabe
// termina em "+3 itens"; texto corrido termina na última palavra inteira com "…".
function compactDescription(description: string, maxLength: number): string {
  const { head, parts } = splitDescription(description);
  const full = joinDescription(head, parts.join(', '));
  const length = (value: string) => Array.from(value).length;
  if (length(full) <= maxLength) return full;
  if (isComposition(parts)) {
    for (let shown = parts.length - 1; shown >= 0; shown--) {
      const hidden = parts.length - shown;
      const rest = MessagesConstants.DESCRICAO_MAIS_ITENS(hidden);
      const candidate = shown > 0 ? joinDescription(head, parts.slice(0, shown).join(', ') + ' ' + rest) : joinDescription(head, rest);
      if (length(candidate) <= maxLength) return candidate;
    }
  }
  let fitted = '';
  for (const word of full.split(' ')) {
    const next = fitted ? fitted + ' ' + word : word;
    if (length(next) + 1 > maxLength) break;
    fitted = next;
  }
  // Sem terminar em conectivo solto ("cebolinha e…").
  const trimmed = fitted.replace(/[\s,·:;-]+$/, '').replace(/\s+(e|de|da|do|com|em|ou|a|o)$/i, '').replace(/[\s,·:;-]+$/, '');
  return trimmed ? trimmed + '…' : truncateText(full, maxLength);
}

// Tela do produto: porção em negrito e cada peça da composição numa linha; texto corrido em itálico.
function detailDescription(description: string): string {
  const { head, parts } = splitDescription(description);
  if (parts.length === 0 && !head) return '';
  if (isComposition(parts)) {
    return (head ? '\n\n📦 *' + head + '*' : '\n') + '\n' + parts.map((part: string) => '• ' + part).join('\n');
  }
  const prose = parts.join(', ');
  return '\n\n' + (head ? '📦 *' + head + '*' : '') + (head && prose ? '\n' : '') + (prose ? '_' + prose + '_' : '');
}

// Emoji do item: o cadastrado no produto ou o sugerido pelo nome e pela categoria.
function productEmoji(product: Product, categoryName?: string): string {
  return product.emoji || menuEmojiFor(product.name, categoryName || product.category || '');
}

const SIZE_EMOJI = '🔸';

// Tela do tamanho: emoji + nome em negrito, descrição em itálico, cada tamanho com preço e "↩️ Trocar item".
function variantMenu(entry: MenuEntry, categoryName?: string): ButtonMessage | ListMessage {
  const emoji = entry.product.emoji || menuEmojiFor(entry.title, categoryName || newCart.browse_category || entry.product.category || '');
  const body = MessagesConstants.ESCOLHER_TAMANHO(emoji, entry.title, entry.product.description ? String(entry.product.description) : '');
  const sizes = entry.variants.map((variant: Product) => ({
    id: 'size:' + variant.id,
    label: SIZE_EMOJI + ' ' + (variant.variant_label || variant.name),
    price: 'R$ ' + fmtBRL(variant.price),
  }));
  const back = { id: 'item:back', title: MessagesConstants.TROCAR_ITEM };
  const buttons = sizes.map((size) => ({ id: size.id, title: size.label + ' · ' + size.price }));
  // Até 2 tamanhos cabem em botões junto com o "Trocar item" (3 botões, 20 caracteres cada).
  if (buttons.length <= 2 && buttons.every((button) => Array.from(button.title).length <= 20)) {
    return { type: 'buttons', body, buttons: [...buttons, back] };
  }
  const rows: ListRow[] = sizes.slice(0, 9).map((size) => ({ id: size.id, title: size.label, description: '💰 ' + size.price }));
  rows.push(back);
  return { type: 'list', body, button: MessagesConstants.TAMANHO_BOTAO_LISTA, sections: [{ title: MessagesConstants.TAMANHO_SECAO, rows }] };
}

function itemsList(categoryName: string, context: string, page: number): ListMessage | TextMenuMessage {
  const allEntries = menuEntries(categoryName);
  const isText = channelProvider === WhatsAppProvider.EVOLUTION;
  const pageSize = itemsPageSize();
  const totalPages = Math.max(1, Math.ceil(allEntries.length / pageSize));
  const currentPage = Math.min(Math.max(page || 0, 0), totalPages - 1);
  const start = currentPage * pageSize;
  // id = número do item na categoria: tocar na lista ou digitar o número dá no mesmo.
  const options: MenuOption[] = allEntries.slice(start, start + pageSize).map((entry: MenuEntry, index: number) => ({
    id: String(start + index + 1),
    number: start + index + 1,
    emoji: entry.product.emoji || menuEmojiFor(entry.title, categoryName),
    title: entry.title,
    price: entryPriceText(entry),
    description: entry.product.description
      ? compactDescription(String(entry.product.description), isText
        ? MENU_TEXT_DESCRIPTION_MAX
        : MENU_ROW_DESCRIPTION_MAX - Array.from('💰 ' + entryPriceText(entry) + ' · ').length)
      : undefined,
  }));
  return channelStrategy.renderMenu({
    heading: categoryEmoji(categoryName) + ' *' + categoryName + '*',
    subtitle: isText ? MessagesConstants.MENU_ITENS_SUBTITULO_TEXTO(allEntries.length) : MessagesConstants.MENU_ITENS_SUBTITULO(allEntries.length),
    button: MessagesConstants.MENU_VER_ITENS,
    sectionTitle: truncateText(categoryName, 24),
    options,
    page: currentPage,
    totalPages,
    hasMore: allEntries.length > start + pageSize,
    nextId: 'próxima',
    backId: '0',
    backLabel: MessagesConstants.MENU_VOLTAR_CATEGORIAS,
    checkout: context === 'order' ? checkoutShortcut() : undefined,
  });
}

const WEEKDAY_SHORT = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const SCHEDULE_TIME_LIST_LIMIT = 9; // + "Voltar" = 10 linhas

function fmtScheduleDay(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map((part: string) => parseInt(part, 10));
  const weekday = new Date(Date.UTC(year, month - 1, day, 12)).getUTCDay();
  return WEEKDAY_SHORT[weekday] + ' ' + String(day).padStart(2, '0') + '/' + String(month).padStart(2, '0');
}

function scheduleDayMenu(): ListMessage {
  const rows: ListRow[] = scheduleSlots.slice(0, 7).map((day: ScheduleDay) => ({ id: 'day:' + day.date, title: '📅 ' + fmtScheduleDay(day.date) }));
  if (newCart.scheduled_date && newCart.scheduled_time) rows.push({ id: SCHEDULE_NOW_ID, title: MessagesConstants.AGENDAR_PARA_AGORA, description: MessagesConstants.AGENDAR_PARA_AGORA_DESCRICAO });
  rows.push({ id: MENU_BACK_ID, title: newCart.schedule_from_menu ? MessagesConstants.MENU_VOLTAR_INICIO : MessagesConstants.MENU_VOLTAR_CATEGORIAS });
  return { type: 'list', body: MessagesConstants.AGENDAR_DIA, button: MessagesConstants.AGENDAR_VER_DIAS, sections: [{ title: MessagesConstants.AGENDAR_SECAO_DIAS, rows }] };
}

// WhatsApp lists hold 10 rows: prefer round hours and half hours, the rest can be typed.
function scheduleTimeMenu(isoDate: string): ListMessage {
  const day = scheduleSlots.find((slotDay: ScheduleDay) => slotDay.date === isoDate);
  const times = day ? day.times : [];
  const preferred = times.filter((time: string) => time.endsWith(':00') || time.endsWith(':30'));
  const shown = (preferred.length > 0 ? preferred : times).slice(0, SCHEDULE_TIME_LIST_LIMIT);
  return {
    type: 'list',
    body: MessagesConstants.AGENDAR_HORA(fmtScheduleDay(isoDate)),
    button: 'Ver horários',
    sections: [{ title: 'Horários livres', rows: [
      ...shown.map((time: string) => ({ id: 'time:' + time, title: '🕒 ' + time })),
      { id: MENU_BACK_ID, title: MessagesConstants.AGENDAR_VOLTAR_DIAS },
    ] }],
  };
}

function scheduledLine(): string {
  if (!newCart.scheduled_date || !newCart.scheduled_time) return '';
  return '\n\n' + MessagesConstants.AGENDADO_PARA(fmtScheduleDay(newCart.scheduled_date), newCart.scheduled_time);
}

// Rodapé de todo pedido fechado; também fixa o horário agendado antes de o carrinho ser limpo.
function orderFooter(orderCode: string): string {
  orderScheduledFor = newCart.scheduled_date && newCart.scheduled_time
    ? newCart.scheduled_date + 'T' + newCart.scheduled_time + ':00-03:00'
    : null;
  return scheduledLine() + MessagesConstants.PEDIDO_CODIGO(orderCode);
}

// Depois do carrinho confirmado (e do "quando"), segue para como receber o pedido.
function startCheckout(): void {
  if (orderTypes.length > 1) {
    newState = BotState.AWAITING_TYPE;
    respostas.push(orderTypeBtn());
  } else if (featureDelivery) {
    newCart.order_type = 'delivery';
    askDeliveryAddress();
  } else {
    newCart.order_type = orderTypes[0] ? orderTypes[0].name : 'retirada';
    newCart.delivery_fee = 0;
    newState = BotState.AWAITING_PAYMENT;
    respostas.push(MessagesConstants.TIPO_CONFIRMADO(orderTypes[0] ? orderTypes[0].label : 'Retirada'));
    goToPayment();
  }
}

// Resumo do pedido para confirmar (com o horário, se agendado). Usado no "Finalizar" e no "Voltar" do checkout.
function showOrderConfirmation(): void {
  const { lines, total, itemCount } = cartSummary(newCart.items);
  newState = BotState.CONFIRMING;
  respostas.push(confirmBtn(MessagesConstants.CONFIRMAR_PEDIDO(lines.join('\n'), fmtBRL(total), itemCount) + scheduledLine()));
}

// Depois de adicionar: mais itens, editar o carrinho (tirar ou mudar quantidade) ou finalizar.
function moreItemsButtons(body: string): ButtonMessage {
  // A observação é pedida na escolha do item (botão "📝 Com observação"), não depois de adicionar.
  const buttons = [
    { id: '__add_more__', title: '➕ Adicionar mais' },
    { id: 'cart:edit', title: MessagesConstants.EDITAR_CARRINHO_BOTAO },
    { id: 'finalizar', title: '✅ Finalizar' },
  ];
  return { type: 'buttons', body, buttons };
}

const ORDER_NOTE_YES_ID = 'note:yes';
const ORDER_NOTE_NO_ID = 'note:no';
const SAVED_PAYMENT_USE_ID = 'pay:same';
const SAVED_PAYMENT_OTHER_ID = 'pay:other';

// Antes do pagamento: uma pergunta só de observação para o pedido inteiro (vai para a cozinha).
function goToPayment(): void {
  if (!newCart.order_note_asked) {
    newState = BotState.AWAITING_ORDER_NOTE_CHOICE;
    respostas.push({
      type: 'buttons',
      body: MessagesConstants.OBSERVACAO_PEDIDO_PERGUNTA,
      buttons: [
        { id: ORDER_NOTE_YES_ID, title: MessagesConstants.OBSERVACAO_PEDIDO_SIM },
        { id: ORDER_NOTE_NO_ID, title: MessagesConstants.OBSERVACAO_PEDIDO_NAO },
      ],
    });
    return;
  }
  askPaymentMethod();
}

// Forma de pagamento do último pedido, se ainda existe e foi uma parte só.
function savedPaymentType(): PaymentType | null {
  const lastMethod = recentOrders[0]?.payment_method;
  if (!lastMethod || newCart.split_count > 1) return null;
  return paymentTypes.find((paymentType: PaymentType) => paymentType.name === lastMethod) || null;
}

// Pagamento: com forma anterior, oferece usar a mesma; senão a lista de formas.
function askPaymentMethod(): void {
  const saved = savedPaymentType();
  if (saved) {
    newState = BotState.AWAITING_SAVED_PAYMENT;
    respostas.push({
      type: 'buttons',
      body: MessagesConstants.PAGAMENTO_SALVO_PERGUNTA(saved.label, paymentEmoji(saved.name)),
      buttons: [
        { id: SAVED_PAYMENT_USE_ID, title: MessagesConstants.PAGAMENTO_SALVO_USAR },
        { id: SAVED_PAYMENT_OTHER_ID, title: MessagesConstants.PAGAMENTO_SALVO_OUTRA },
        { id: MENU_BACK_ID, title: MessagesConstants.COMPLEMENTO_VOLTAR },
      ],
    });
    return;
  }
  newState = BotState.AWAITING_PAYMENT;
  respostas.push(paymentList(newCart.split_count));
}

// Observação do pedido para a confirmação final (vazia sem observação).
function orderNoteLine(): string {
  return newCart.order_note ? MessagesConstants.OBSERVACAO_PEDIDO_LINHA(newCart.order_note) : '';
}

const SAVED_ADDRESS_USE_ID = 'endereco:usar';
const SAVED_ADDRESS_OTHER_ID = 'endereco:outro';

// Entregar: com endereço de entrega anterior, oferece usar o mesmo; senão pede o endereço.
function askDeliveryAddress(): void {
  if (lastDeliveryAddress) {
    newState = BotState.AWAITING_SAVED_ADDRESS;
    respostas.push({
      type: 'buttons',
      body: MessagesConstants.ENDERECO_SALVO_PERGUNTA(lastDeliveryAddress),
      buttons: [
        { id: SAVED_ADDRESS_USE_ID, title: MessagesConstants.ENDERECO_SALVO_USAR },
        { id: SAVED_ADDRESS_OTHER_ID, title: MessagesConstants.ENDERECO_SALVO_OUTRO },
        { id: MENU_BACK_ID, title: MessagesConstants.COMPLEMENTO_VOLTAR },
      ],
    });
    return;
  }
  newState = BotState.AWAITING_ADDRESS;
  respostas.push(MessagesConstants.SOLICITAR_ENDERECO);
}

const COMPLEMENT_NONE_ID = 'sem complemento';
const ADDRESS_FIX_ID = 'endereco:corrigir';

// Pergunta do complemento com botões. body: o endereço anotado vai junto quando não precisa de prévia do link.
function complementButtons(body?: string): ButtonMessage {
  return {
    type: 'buttons',
    body: (body ? body + '\n\n' : '') + MessagesConstants.COMPLEMENTO_PERGUNTA,
    buttons: [
      { id: COMPLEMENT_NONE_ID, title: MessagesConstants.COMPLEMENTO_SEM },
      { id: ADDRESS_FIX_ID, title: MessagesConstants.COMPLEMENTO_CORRIGIR },
      { id: MENU_BACK_ID, title: MessagesConstants.COMPLEMENTO_VOLTAR },
    ],
  };
}

function locationMsg(lat: number, lng: number, name: string, address: string): LocationMessage {
  return { type: 'location', latitude: lat, longitude: lng, name: name || MessagesConstants.ENDERECO_ENTREGA_TITULO, address: address || '' };
}

function nonCashOptions(): string {
  return splitPaymentTypes
    .filter((paymentType: PaymentType) => paymentType.name !== 'dinheiro')
    .map((paymentType: PaymentType, index: number) => (index+1) + '. ' + paymentType.label)
    .join('\n');
}

function buildRepeatOrderLines(params: ConstruirLinhasPedidoParams): string[] {
  const { lastOrder: lastOrderParam, products: prods, header } = params;
  const items = lastOrderParam.items;
  const lines: string[] = [header + '\n'];
  let newTotal = 0;
  let hasChanges = false;
  const unavailable: string[] = [];

  for (const item of items) {
    const currentProduct = prods.find((product: Product) => product.id === item.id);
    if (!currentProduct) { unavailable.push(item.name); continue; }
    const oldUnitPrice = Number(item.price);
    const newUnitPrice = Number(currentProduct.price);
    const newLineTotal = newUnitPrice * item.qty;
    newTotal += newLineTotal;
    if (Math.abs(newUnitPrice - oldUnitPrice) >= 0.01) {
      hasChanges = true;
      const diff = newLineTotal - (oldUnitPrice * item.qty);
      const sign = diff > 0 ? '+' : '−';
      const icon = diff < 0 ? ' 🎉' : ' 📢';
      lines.push('• ' + item.name + ' × ' + item.qty + ' — *R$ ' + fmtBRL(newLineTotal) + '*' + icon
        + '\n  _era R$ ' + fmtBRL(oldUnitPrice * item.qty) + ' (' + sign + 'R$ ' + fmtBRL(Math.abs(diff)) + ')_');
    } else {
      lines.push(orderItemLine(item.name, item.qty, newUnitPrice));
    }
  }
  if (unavailable.length > 0) lines.push(MessagesConstants.FORA_DO_CARDAPIO(unavailable.join(', ')));
  const oldTotal = Number(lastOrderParam.total);
  if (hasChanges && Math.abs(newTotal - oldTotal) >= 0.01) {
    const totalDiff = newTotal - oldTotal;
    const sign = totalDiff > 0 ? '+' : '−';
    lines.push(MessagesConstants.TOTAL_COMPARADO(fmtBRL(newTotal), sign, fmtBRL(Math.abs(totalDiff))));
  } else {
    lines.push('\n*Total: R$ ' + fmtBRL(newTotal) + '*');
  }
  return lines;
}

function maybeAskOptIn(): void {
  if (marketingOptIn === null) {
    respostas.push(yesNo(MessagesConstants.OPT_IN_PERGUNTA));
    newState = BotState.AWAITING_MARKETING_OPT_IN;
  }
}

// Passada final: a resposta inteira no formato do provedor (lista/botões na Meta, texto numerado no Evolution).
function renderPayloadForChannel(payload: N8nResponsePayload): N8nResponsePayload {
  const numberedChoices = !NumericInputStates.includes(payload.state);
  const rendered = channelStrategy.renderOutgoing(payload.respostas, numberedChoices);
  const cart: Cart = { ...payload.cart, menu_choices: rendered.choices };
  return { ...payload, respostas: rendered.messages, cart };
}

// Resposta a um áudio abre com o que foi entendido, para o cliente conferir antes de seguir.
function withAudioEcho(payload: N8nResponsePayload): N8nResponsePayload {
  const transcript = rawText.trim();
  if (!fromAudio || incomingText === AUDIO_UNCLEAR_TEXT || !transcript || payload.respostas.length === 0) return payload;
  return { ...payload, respostas: [MessagesConstants.AUDIO_OUVI(transcript), ...payload.respostas] };
}

function buildPayload(): N8nResponsePayload {
  return {
    tel, instancia, respostas,
    state: newState,
    cart: newCart,
    reservation_temp: newReservationTemp,
    save_order, order: finalOrder ? { ...finalOrder, scheduled_for: orderScheduledFor } : null,
    save_reservation, reservation: finalReservation,
    save_customer_name, customer_name_to_save: customerNameToSave,
    save_marketing_opt_in, marketing_opt_in_value,
    kitchen_phone: kitchenPhone,
    request_human_handoff,
    handoff_customer_name: handoffCustomerName,
    save_issue, issue: finalIssue,
    save_partial_answer, partial_answer: partialAnswer,
  };
}

// Cartão de visita da saudação, tudo do cadastro do restaurante: só entra o bloco cujo dado existe.
// Blocos separados por linha em branco, para o cliente ter espaço para ler. Dentro da mensagem única
// (compact) vai sem título e com o endereço e o link do mapa no lugar do pin.
function buildCompanyInfo(compact?: boolean): string {
  const blocks: string[] = [];
  // 00:00 às 23:59 é "o dia todo": vira "24 horas" em vez de "das 0h às 23h59".
  const opensAllDay = openingTime <= '00:00' && closingTime >= '23:59';
  const hoursLine = opensAllDay
    ? MessagesConstants.INFO_HORARIO_24H_LINHA(formatWorkingDays(workingDays))
    : MessagesConstants.INFO_HORARIO_LINHA(formatWorkingDays(workingDays), formatHour(openingTime), formatHour(closingTime));
  blocks.push(MessagesConstants.INFO_HORARIO(isOpen && !ignoreHours, hoursLine));
  // Com o pin no mapa o WhatsApp já mostra o endereço: no cartão ele só entra quando não há pin.
  const fullAddress = fullEstablishmentAddress();
  const mapLink = establishmentMapLink();
  if (fullAddress && compact && mapLink) blocks.push(MessagesConstants.INFO_ENDERECO_COM_MAPA(fullAddress, mapLink));
  else if (fullAddress && (compact || !establishmentLocationCard())) blocks.push(MessagesConstants.INFO_ENDERECO(fullAddress));
  const feeText = describeDeliveryFee();
  if (featureDelivery && featureRetirada) blocks.push(MessagesConstants.INFO_ENTREGA_E_RETIRADA(feeText));
  else if (featureDelivery) blocks.push(MessagesConstants.INFO_SO_ENTREGA(feeText));
  else if (featureRetirada) blocks.push(MessagesConstants.INFO_SO_RETIRADA);
  const paymentLabels = paymentTypes
    .map((paymentType: PaymentType) => paymentType.label)
    .filter((label: string, index: number, labels: string[]) => !!label && labels.indexOf(label) === index);
  if (paymentLabels.length > 0) blocks.push(MessagesConstants.INFO_PAGAMENTO(joinWithAnd(paymentLabels)));
  const instagramLink = toInstagramLink(estInstagram);
  if (instagramLink) blocks.push(MessagesConstants.INFO_INSTAGRAM(instagramLink));
  const websiteLink = toWebsiteLink(estWebsite);
  if (websiteLink) blocks.push(MessagesConstants.INFO_SITE(websiteLink));
  return (compact ? blocks : [MessagesConstants.INFO_TITULO(estName), ...blocks]).join('\n\n');
}

function establishmentMapLink(): string {
  if (!estLat || !estLng) return '';
  return 'https://maps.google.com/?q=' + estLat + ',' + estLng;
}

// Saudação numa mensagem só (Meta): logo no topo, boas-vindas, cartão do restaurante e, no fim, a
// pergunta com os botões (menu, repetir pedido) ou o pedido do nome (foto com legenda, sem botões).
// Texto acima do limite da Meta → null, e a saudação volta a sair em mensagens separadas.
const GREETING_BODY_MAX = 1024;
function singleGreetingMessage(welcome: string, closing: ButtonMessage | string): ButtonMessage | ImageMessage | string | null {
  const closingText = typeof closing === 'string' ? closing : closing.body;
  const body = [welcome, buildCompanyInfo(true), closingText].filter(Boolean).join('\n\n');
  if (Array.from(body).length > GREETING_BODY_MAX) return null;
  if (typeof closing !== 'string') {
    const message: ButtonMessage = { ...closing, body };
    if (brandHeaderImage) message.headerImage = brandHeaderImage;
    return message;
  }
  return brandHeaderImage ? { type: 'image', link: brandHeaderImage, caption: body } : body;
}

function fullEstablishmentAddress(): string {
  return [estAddress, estCity].filter((part: string) => part && part.trim()).join(' · ');
}

// Pin do restaurante (card de localização do WhatsApp, abre no Maps) quando há coordenadas.
function establishmentLocationCard(): LocationMessage | null {
  if (!estLat || !estLng) return null;
  return locationMsg(estLat, estLng, estName, fullEstablishmentAddress());
}

// "@yuyaki", "yuyaki" ou o link inteiro → https://instagram.com/yuyaki (o WhatsApp deixa clicável).
function toInstagramLink(value: string): string {
  const handle = (value || '').trim().replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/^@/, '').replace(/\/+$/, '');
  return handle ? 'https://instagram.com/' + handle : '';
}

function toWebsiteLink(value: string): string {
  const site = (value || '').trim();
  if (!site) return '';
  return /^https?:\/\//i.test(site) ? site : 'https://' + site;
}

function describeDeliveryFee(): string {
  const hasZones = Array.isArray(feeRule.zones) && feeRule.zones.length > 0;
  let feeText: string;
  if (feeMode === 'fixed' && !hasZones) {
    feeText = baseFee > 0 ? MessagesConstants.INFO_TAXA_FIXA(fmtBRL(baseFee)) : MessagesConstants.INFO_TAXA_GRATIS;
  } else {
    feeText = MessagesConstants.INFO_TAXA_DISTANCIA;
  }
  if (freeDeliveryAbove > 0 && feeText !== MessagesConstants.INFO_TAXA_GRATIS) {
    feeText += MessagesConstants.INFO_FRETE_GRATIS_ACIMA(fmtBRL(freeDeliveryAbove));
  }
  return feeText;
}

function joinWithAnd(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return items.slice(0, -1).join(', ') + ' e ' + items[items.length - 1];
}

const greetings = ['oi', 'ola', 'bom dia', 'boa tarde', 'boa noite', 'inicio', 'menu', 'start', 'hello', 'hi'];

// ── Verificação de horário ───────────────────────────────────────────────────
const isOpen = ignoreHours || (
  workingDays.includes(diaSemana) &&
  horaAtual >= openingTime &&
  horaAtual <= closingTime
);

if (sessionWasReset && texto !== 'sair' && texto !== 'cancelar') {
  respostas.push(MessagesConstants.SESSION_EXPIRED);
}
