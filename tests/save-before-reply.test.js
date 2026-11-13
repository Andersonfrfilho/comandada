#!/usr/bin/env node
// O nó "Gravar Pedido e Reserva" só deixa o cliente ler "confirmado" depois que a API gravou.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const workflow = JSON.parse(fs.readFileSync(path.join(__dirname, '../n8n/workflows/01-receber-mensagem.json'), 'utf8'));
const CODE = workflow.nodes.find((node) => node.name === 'Gravar Pedido e Reserva').parameters.jsCode;

const ORDER = { code: 'PED-1', items: [{ id: 'p1', qty: 2 }], order_type: 'retirada', payment_method: 'pix', payments: [], scheduled_for: null };
const PREVIOUS_SESSION = { state: 'awaiting_payment', cart: { items: [{ id: 'p1', qty: 2 }], order_type: 'retirada' } };

async function run({ routed, httpRequest }) {
  const nodes = {
    'Rotear e Responder': routed,
    'Buscar Dados': { establishment: { id: 'est-1' }, session: PREVIOUS_SESSION },
  };
  const wrapped = `(async function(helpers) { const self = { helpers }; return (async function() { ${CODE} }).call(self); })`;
  const fn = vm.runInNewContext(wrapped, {
    $: (name) => ({ first: () => ({ json: nodes[name] }) }),
    $env: {},
    JSON, Date, Intl, Number, String, encodeURIComponent,
  });
  const result = await fn({ httpRequest });
  return result[0].json;
}

const baseRouted = () => ({
  tel: '5516999990000',
  state: 'start',
  cart: {},
  respostas: ['✅ *Pedido confirmado!*\n\n• Temaki', 'Quer receber promoções?'],
  save_order: true,
  order: { ...ORDER },
  save_reservation: false,
});

let failed = 0;
async function test(name, body) {
  try { await body(); console.log('  ✅ ' + name); }
  catch (error) { failed += 1; console.log('  ❌ ' + name + '\n     ' + error.message); }
}
function assert(condition, message) { if (!condition) throw new Error(message); }

(async () => {
  await test('gravou: mantém a confirmação e acrescenta a previsão', async () => {
    const out = await run({ routed: baseRouted(), httpRequest: async () => ({ id: 'o1', code: 'PED-1', estimatedAt: '2026-11-13T23:40:00Z', estimatedMinutes: 35 }) });
    assert(out.order_saved === true, 'order_saved deve ser true');
    assert(out.respostas[0].includes('Previsão para ficar pronto: 20:40'), out.respostas[0]);
    assert(out.respostas[0].includes('cerca de 35 min'), out.respostas[0]);
  });

  await test('falhou: não confirma, devolve o carrinho e o passo anterior', async () => {
    const out = await run({ routed: baseRouted(), httpRequest: async () => { throw new Error('ECONNREFUSED'); } });
    assert(out.order_saved === false, 'order_saved deve ser false');
    assert(!out.respostas.some((message) => String(message).includes('Pedido confirmado')), 'não pode confirmar');
    assert(out.respostas[0].includes('não consegui registrar seu pedido'), out.respostas[0]);
    assert(out.state === 'awaiting_payment', 'estado volta: ' + out.state);
    assert(out.cart.items.length === 1, 'carrinho volta');
  });

  await test('horário da encomenda ocupado: pede outro horário', async () => {
    const routed = baseRouted();
    routed.order.scheduled_for = '2026-11-14T19:00:00-03:00';
    const error = Object.assign(new Error('409'), { response: { body: { error: { code: 'agenda_slot_unavailable' } } } });
    const out = await run({ routed, httpRequest: async () => { throw error; } });
    assert(out.state === 'confirming', 'estado: ' + out.state);
    assert(out.respostas[0].includes('acabou de ser preenchido'), out.respostas[0]);
  });

  await test('reserva gravada mostra a mesa escolhida pela agenda', async () => {
    const routed = { ...baseRouted(), save_order: false, order: null, save_reservation: true,
      reservation: { code: 'RES-1', date: '2026-11-14', time: '20:00', party_size: 2 },
      respostas: ['✅ *Reserva confirmada!*\n\n📆 14/11 às 20:00'] };
    const out = await run({ routed, httpRequest: async () => ({ id: 'r1', code: 'RES-1', tableNumber: 3 }) });
    assert(out.respostas[0].includes('Mesa 3'), out.respostas[0]);
  });

  console.log(failed === 0 ? '✅ save-before-reply ok' : `❌ ${failed} falharam`);
  process.exit(failed === 0 ? 0 : 1);
})();
