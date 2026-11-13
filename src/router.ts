// ── Fechado? Retorno antecipado ───────────────────────────────────────────────
// Resposta à confirmação parcial passa mesmo fora do horário: o pedido já está em andamento.
if (!isOpen && !(partialConfirmation && partialAnswerOf(texto) !== null)) {
  _earlyResponse = {
    tel, instancia,
    respostas: [msgClosed],
    state: currentState,
    cart: currentCart,
    reservation_temp: newReservationTemp,
    save_order: false, order: null,
    save_reservation: false, reservation: null,
    save_customer_name: false, customer_name_to_save: null,
    save_marketing_opt_in: false, marketing_opt_in_value: null,
    kitchen_phone: '',
    request_human_handoff: false,
    handoff_customer_name: customerName || '',
    save_issue: false, issue: null,
    save_partial_answer: false, partial_answer: null,
  };
}

// ── Chain of Responsibility ───────────────────────────────────────────────────
async function runHandlers(): Promise<void> {
  if (_earlyResponse) return;

  const handlers: BaseHandler[] = [
    new HandoffHandler(),
    new PartialConfirmationHandler(),
    new GlobalHandler(),
    new GreetingHandler(),
    new IssueHandler(),
    new CartHandler(),
    new SchedulingHandler(),
    new DeliveryHandler(),
    new PaymentHandler(),
    new MenuShortcutsHandler(),
    new ReservationHandler(),
    new MiscHandler(),
    new OrderingHandler(),
    new FallbackHandler(),
  ];

  for (const handler of handlers) {
    if (_earlyResponse) break;
    const handled = await handler.handle();
    if (handled) break;
  }
}

// @ts-ignore — n8n executa jsCode dentro de uma async function; await é válido em runtime
await runHandlers();
