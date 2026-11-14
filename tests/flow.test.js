#!/usr/bin/env node
/**
 * Testes end-to-end do fluxo de conversa.
 * Simula a máquina de estados do nó "Rotear e Responder"
 * sem precisar do n8n, WhatsApp ou banco de dados.
 */

const fs   = require('fs');
const path = require('path');
const vm   = require('vm');

// ── Dados de teste ─────────────────────────────────────────────────────────
const PRODUCTS = [
  { id: 1, name: 'Temaki Salmão',          category: 'Temaki',   price: 23.90, emoji: '🌯' },
  { id: 2, name: 'Temaki Atum',            category: 'Temaki',   price: 25.90, emoji: '🌯' },
  { id: 3, name: 'Temaki Philadelphia',    category: 'Temaki',   price: 27.90, emoji: '🌯' },
  { id: 4, name: 'Temaki Camarão Grelhado',category: 'Temaki',   price: 28.90, emoji: '🌯' },
  { id: 5, name: 'Hot Roll Salmão (8 un)', category: 'Hot Roll', price: 39.90, emoji: '🔥' },
  { id: 6, name: 'Hot Roll Camarão (8 un)',category: 'Hot Roll', price: 43.90, emoji: '🔥' },
  { id: 7, name: 'Hot Roll Atum (8 un)',   category: 'Hot Roll', price: 41.90, emoji: '🔥' },
  { id: 8, name: 'Temaki Hot (Médio)',     category: 'Temakis',  price: 37.00, variant_group: 'temaki-hot', variant_label: 'Médio' },
  { id: 9, name: 'Temaki Hot (Grande)',    category: 'Temakis',  price: 49.00, variant_group: 'temaki-hot', variant_label: 'Grande' },
  { id: 10, name: 'Sashimi',               category: 'Temakis',  price: 60.00 },
];

const CONFIG = {
  establishment_name: 'Sakura',
  opening_time: '18:00',
  closing_time: '23:00',
  working_days: 'seg,ter,qua,qui,sex,sab,dom',
  msg_welcome: 'Olá! Bem-vindo ao Sakura 🌸',
  ignore_hours: 'true',
  session_ttl_min: '60',
  establishment_lat: '-21.8',
  establishment_lng: '-47.8',
  establishment_city: 'Ribeirão Preto, SP',
  min_order_value: '0',
  kitchen_phone: '5516999999999',
};

const PAYMENT_TYPES = [
  { name: 'pix',     label: 'PIX',            active: true, config: { chave: '11999999999', nome: 'Sakura' } },
  { name: 'credito', label: 'Cartão Crédito', active: true },
  { name: 'dinheiro',label: 'Dinheiro',       active: true },
];

const ORDER_TYPES = [
  { name: 'delivery', label: '🚗 Delivery',          active: true },
  { name: 'retirada', label: '📤 Retirada no local', active: true },
];

// ── Carregar jsCode do workflow ────────────────────────────────────────────
const wfPath = path.join(__dirname, '../n8n/workflows/01-receber-mensagem.json');
const wf     = JSON.parse(fs.readFileSync(wfPath, 'utf8'));
const roteadorNode = wf.nodes.find(n => n.name === 'Rotear e Responder');
if (!roteadorNode) { console.error('Node "Rotear e Responder" não encontrado'); process.exit(1); }
const RAW_CODE = roteadorNode.parameters.jsCode;

// ── Executor: simula uma mensagem e retorna o resultado ───────────────────
function runMessage({ texto, state = 'start', cart = null, customerName = 'Anderson', lastOrder = null }) {
  const session = {
    state,
    cart: cart || { items: [], order_type: '', address: '', complement: '',
      delivery_fee: 0, payment_method: '', change_for: null,
      split_count: 0, split_current: 0, split_payments: [],
      mixed_method: '', mixed_label: '', mixed_amount: 0,
      address_street_temp: null, browse_category: '', browse_page: 0,
      pending_item_id: null, pending_item_name: '' },
    last_activity_at: new Date().toISOString(),
  };

  // Mock $json (saída do Buscar Dados)
  const jsonData = {
    config: CONFIG,
    products: PRODUCTS,
    payment_types: PAYMENT_TYPES,
    order_types: ORDER_TYPES,
    session,
    last_order: lastOrder,
    recent_orders: [],
    restaurant_tables: [],
    upcoming_reservations: [],
    delivery_fee_rule: { mode: 'fixed', base_fee: 5, free_above: 0, max_radius_km: 10, zones: [] },
    customer_name: customerName,
    marketing_opt_in: null,
  };

  // Mock $() para "Calcular Hora"
  const calcHoraData = {
    tel: '5511999999999',
    instancia: 'test',
    texto: texto.toLowerCase().trim(),
    horaAtual: '19:00',
    diaSemana: 'seg',
    location_lat: null,
    location_lng: null,
    push_name: customerName || '',
  };

  // Adaptação: o código usa this.helpers.httpRequest (async)
  // Mockar como função que retorna imediatamente
  const mockHelpers = {
    httpRequest: async () => ({ routes: [{ distance: 3000, duration: 600 }] }),
  };

  // Wrap do código em async function para suportar await
  const wrappedCode = `
    (async function(__jsonData, __calcHoraData, __helpers) {
      // Mock das globals do n8n
      const $json = __jsonData;
      const $ = (nodeName) => ({ first: () => ({ json: __calcHoraData }) });
      const self = { helpers: __helpers };
      // Bind 'this' para httpRequest
      const origCode = async function() {
        ${RAW_CODE}
      };
      return origCode.call(self);
    })
  `;

  try {
    const fn = vm.runInNewContext(wrappedCode, {
      console, JSON, Date, Math, Array, Object, String, Number, Boolean,
      parseInt, parseFloat, isNaN, encodeURIComponent, Promise, Intl,
      setTimeout: (fn, ms) => fn(), // stub
    });
    // Run synchronously via a trick: we get the promise
    let result;
    let error;
    fn(jsonData, calcHoraData, mockHelpers).then(r => { result = r; }).catch(e => { error = e; });
    // Node.js microtask queue — drain it
    // Since we mocked all async calls to resolve immediately, this works
    return { result, error };
  } catch (e) {
    return { result: null, error: e };
  }
}

// ── Utilitários de teste ───────────────────────────────────────────────────
let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (e) {
    console.log(`  ❌ ${name}`);
    console.log(`     ${e.message}`);
    failed++;
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg || 'Assertion failed');
}

function assertState(result, expectedState) {
  const actual = result?.[0]?.json?.state;
  assert(actual === expectedState, `Estado esperado: '${expectedState}', recebido: '${actual}'`);
}

function assertResponseContains(result, text) {
  const resps = result?.[0]?.json?.respostas || [];
  const found = resps.some(r => {
    const body    = typeof r === 'string' ? r : (r?.body || '');
    const buttons = (r?.buttons || []).map(b => b.title || b.id || '').join(' ');
    const rows    = (r?.sections || []).flatMap(s => s.rows || []).map(row => row.title + ' ' + (row.description || '')).join(' ');
    return (body + ' ' + buttons + ' ' + rows).includes(text);
  });
  assert(found, `Resposta não contém "${text}". Respostas: ${JSON.stringify(resps).slice(0, 300)}`);
}

function assertResponseType(result, type) {
  const resps = result?.[0]?.json?.respostas || [];
  const found = resps.some(r => typeof r === 'object' && r?.type === type);
  assert(found, `Nenhuma resposta do tipo '${type}'. Tipos: ${resps.map(r => typeof r === 'object' ? r?.type : 'string').join(', ')}`);
}

function assertNoObjectObject(result) {
  const resps = result?.[0]?.json?.respostas || [];
  resps.forEach((r, i) => {
    const body = typeof r === 'string' ? r : (r?.body || '');
    assert(!body.includes('[object Object]'), `Resposta[${i}] contém [object Object]: ${body.slice(0,100)}`);
  });
}

// ── Execução síncrona simples para testes ─────────────────────────────────
// Node.js permite rodar Promises de forma síncrona via async IIFE
async function runTests() {
  const baseCartForNote = () => ({
    items: [{ id: 1, name: 'Temaki Salmão', qty: 1, price: 23.9, menuIdx: 1 }], order_type: '', address: '', complement: '',
    delivery_fee: 0, payment_method: '', change_for: null, split_count: 0, split_current: 0, split_payments: [],
    mixed_method: '', mixed_label: '', mixed_amount: 0, address_street_temp: null, browse_category: 'Temaki', browse_page: 0,
    pending_item_id: 1, pending_item_name: 'Temaki Salmão', pending_group: '',
  });
  const exec = (args) => {
    return new Promise((resolve) => {
      const jsonData = {
        config: CONFIG,
        products: args.products || PRODUCTS,
        payment_types: PAYMENT_TYPES,
        order_types: ORDER_TYPES,
        session: {
          state: args.state || 'start',
          cart: args.cart || {
            items: [], order_type: '', address: '', complement: '',
            delivery_fee: 0, payment_method: '', change_for: null,
            split_count: 0, split_current: 0, split_payments: [],
            mixed_method: '', mixed_label: '', mixed_amount: 0,
            address_street_temp: null, browse_category: args.browse_category || '',
            browse_page: args.browse_page || 0, browse_cat_page: args.browse_cat_page || 0,
            pending_item_id: args.pending_item_id || null,
            pending_item_name: args.pending_item_name || '',
          },
          reservation_temp: args.reservation_temp || {},
          last_activity_at: new Date().toISOString(),
        },
        last_order: args.lastOrder || null,
        recent_orders: args.recent_orders || [],
        restaurant_tables: [{ id: 1, number: 1, capacity: 4 }],
        upcoming_reservations: [],
        schedule_slots: args.schedule_slots || [],
        delivery_fee_rule: { mode: 'fixed', base_fee: 5, free_above: 0, max_radius_km: 10, zones: [] },
        customer_name: args.customerName !== undefined ? args.customerName : 'Anderson',
        marketing_opt_in: args.marketing_opt_in !== undefined ? args.marketing_opt_in : null,
        conversation: args.conversation,
        partial_confirmation: args.partial_confirmation || null,
        ...(args.establishment ? { establishment: args.establishment } : {}),
      };

      const calcHoraData = {
        tel: '5511999999999',
        instancia: 'test',
        texto: (args.texto || '').toLowerCase().trim(),
        texto_original: (args.texto || '').trim(),
        horaAtual: '19:00',
        diaSemana: 'seg',
        location_lat: args.location_lat || null,
        location_lng: args.location_lng || null,
        push_name: args.customerName || '',
        ...(args.provider ? { provider: args.provider } : {}),
        ...(args.from_audio ? { from_audio: true } : {}),
      };

      const mockHelpers = {
        httpRequest: async (opts) => {
          if (opts?.url?.includes('viacep')) return { cep: '14403-380', logradouro: 'Av Presidente Vargas', bairro: 'Centro', localidade: 'Franca', uf: 'SP' };
          if (opts?.url?.includes('nominatim') && opts?.url?.includes('search')) return [{ lat: '-20.5', lon: '-47.4', display_name: 'Av Presidente Vargas, Franca, SP' }];
          if (opts?.url?.includes('nominatim') && opts?.url?.includes('reverse')) return { address: { road: 'Av Presidente Vargas', house_number: '123', city: 'Franca', state_code: 'SP' } };
          if (opts?.url?.includes('osrm')) return { routes: [{ distance: 3000, duration: 600 }] };
          return {};
        },
      };

      const wrappedCode = `(async function(__json, __calcHora, __helpers) {
        const $json = __json;
        const $ = () => ({ first: () => ({ json: __calcHora }) });
        ${RAW_CODE}
      })`;

      const fn = vm.runInNewContext(wrappedCode, {
        console, JSON, Date, Math, Array, Object, String, Number, Boolean,
        parseInt, parseFloat, isNaN, encodeURIComponent, Promise, Intl,
        setTimeout: (fn) => fn(),
      });

      fn(jsonData, calcHoraData, mockHelpers).then(resolve).catch(e => resolve(null, e));
    });
  };

  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n🧪 Testes de Fluxo — Sakura Bot\n');

  // ── GRUPO 1: Entrada e menu ─────────────────────────────────────────────
  console.log('── Entrada e menu');

  await test('saudação → welcome + menu (3 botões)', async () => {
    const r = await exec({ texto: 'oi' });
    assertState(r, 'start');
    assertResponseType(r, 'buttons');
    assertNoObjectObject(r);
  });

  const HEADER_URL = 'https://api.exemplo.com/public/branding/abc/cabecalho.jpg?v=123';
  const STICKER_URL = 'https://api.exemplo.com/public/branding/abc/sticker.webp?v=123';
  const ESTABLISHMENT_WITH_LOGO = {
    sticker_url: STICKER_URL, header_image_url: HEADER_URL,
    address: 'Rua das Flores, 100', instagram: '@sakura.sushi', website: 'sakura.com.br',
  };

  await test('saudação na Meta → uma mensagem só: logo no topo, boas-vindas, cartão e menu em botões', async () => {
    const r = await exec({ texto: 'oi', establishment: ESTABLISHMENT_WITH_LOGO });
    const resps = r?.[0]?.json?.respostas || [];
    assert(resps.length === 1, 'uma mensagem só: ' + JSON.stringify(resps));
    const message = resps[0];
    assert(message.type === 'buttons' && message.headerImage === HEADER_URL, 'botões com o logo no topo: ' + JSON.stringify(message));
    const expectedBlocks = [
      'Olá! Bem-vindo ao Sakura 🌸',
      '🕒 *Horário*\nTodos os dias, das 18h às 23h',
      '📍 *Endereço*\nRua das Flores, 100 · Ribeirão Preto, SP\nhttps://maps.google.com/?q=-21.8,-47.8',
      '🛵 *Entrega e retirada*\nTaxa de entrega *R$ 5,00*',
      '💳 *Pagamento*\nPIX, Cartão Crédito e Dinheiro',
      '📸 *Instagram*\nhttps://instagram.com/sakura.sushi',
      '🌐 *Site*\nhttps://sakura.com.br',
      'O que vai ser hoje? 😋',
    ];
    for (const block of expectedBlocks) assert(message.body.includes(block), 'sem o bloco ' + JSON.stringify(block) + ':\n' + message.body);
    assert(message.body.endsWith('O que vai ser hoje? 😋'), 'pergunta do menu por último');
    assert(!message.body.includes('Sobre o'), 'sem título repetindo o nome');
    assert(!message.body.includes('digite'), 'sem instruções de digitar');
    assert(message.body.split('Rua das Flores').length === 2, 'endereço uma vez só');
    const ids = message.buttons.map((button) => button.id);
    assert(ids.join(',') === '2,3,4', 'sem pedido em andamento: fazer pedido, reservar, atendente: ' + ids);
    assertNoObjectObject(r);
  });

  await test('saudação 24h → "24 horas" em vez de "das 0h às 23h59"', async () => {
    const r = await exec({ texto: 'oi', establishment: { opening_time: '00:00', closing_time: '23:59' } });
    const body = String((r?.[0]?.json?.respostas || [])[0]?.body);
    assert(body.includes('🕒 *Horário*\nTodos os dias, 24 horas'), 'deve dizer 24 horas: ' + body);
    assert(!body.includes('0h às 23h59'), 'não deve mostrar 0h às 23h59');
  });

  await test('saudação sem coordenadas → endereço sem link do mapa', async () => {
    const r = await exec({ texto: 'oi', establishment: { lat: 0, lng: 0, address: 'Rua das Flores, 100' } });
    const body = String((r?.[0]?.json?.respostas || [])[0]?.body);
    assert(body.includes('📍 *Endereço*\nRua das Flores, 100'), 'endereço no texto: ' + body);
    assert(!body.includes('maps.google'), 'sem link do mapa');
  });

  await test('saudação sem logo → mesma mensagem, sem imagem no topo', async () => {
    const r = await exec({ texto: 'oi' });
    const resps = r?.[0]?.json?.respostas || [];
    assert(resps.length === 1 && resps[0].type === 'buttons' && !resps[0].headerImage, 'botões sem cabeçalho: ' + JSON.stringify(resps));
  });

  await test('saudação sem nome → logo com o texto na legenda e pede o nome (awaiting_name)', async () => {
    const r = await exec({ texto: 'oi', customerName: null, establishment: ESTABLISHMENT_WITH_LOGO });
    assertState(r, 'awaiting_name');
    const resps = r?.[0]?.json?.respostas || [];
    assert(resps.length === 1 && resps[0].type === 'image' && resps[0].link === HEADER_URL, 'foto do logo: ' + JSON.stringify(resps));
    assert(/nome/i.test(resps[0].caption) && resps[0].caption.includes('🕒 *Horário*'), 'legenda com cartão e pedido do nome: ' + resps[0].caption);
    assertNoObjectObject(r);
  });

  await test('saudação com pedido anterior → mesma mensagem pergunta se repete (repeat_order)', async () => {
    const r = await exec({ texto: 'oi', establishment: ESTABLISHMENT_WITH_LOGO, lastOrder: {
      items: [{ id: 1, name: 'Temaki Salmão', price: 23.90, qty: 2 }], total: 47.80
    }});
    assertState(r, 'repeat_order');
    const resps = r?.[0]?.json?.respostas || [];
    assert(resps.length === 1 && resps[0].type === 'buttons' && resps[0].headerImage === HEADER_URL, 'uma mensagem: ' + JSON.stringify(resps));
    assert(resps[0].body.includes('Temaki Salmão') && resps[0].body.includes('🕒 *Horário*'), 'cartão e pedido anterior: ' + resps[0].body);
    assertNoObjectObject(r);
  });

  await test('saudação com pedido em andamento → botões meu pedido, ajuda e fazer pedido, sem repetir pedido', async () => {
    const r = await exec({ texto: 'oi', establishment: ESTABLISHMENT_WITH_LOGO,
      recent_orders: [{ code: 'PED-9', status: 'preparing', order_type: 'delivery', total: 50, created_at: '13/11' }],
      lastOrder: { items: [{ id: 1, name: 'Temaki Salmão', price: 23.90, qty: 2 }], total: 47.80 } });
    assertState(r, 'start');
    const resps = r?.[0]?.json?.respostas || [];
    const message = resps[0];
    assert(resps.length === 1 && message.type === 'buttons', 'uma mensagem com botões: ' + JSON.stringify(resps));
    assert(message.buttons.map((button) => button.id).join(',') === 'meu pedido,ajuda,2', 'botões: ' + JSON.stringify(message.buttons));
    assert(message.body.includes('Seu pedido está em andamento'), 'avisa o pedido em andamento');
    assertNoObjectObject(r);
  });

  await test('botão "meu pedido" do menu mostra o pedido', async () => {
    const r = await exec({ texto: 'meu pedido',
      recent_orders: [{ code: 'PED-9', status: 'preparing', order_type: 'delivery', total: 50, created_at: '13/11' }] });
    assertResponseContains(r, 'PED-9');
  });

  await test('saudação no Evolution → figurinha, boas-vindas, cartão, pin e menu numerado em mensagens separadas', async () => {
    const r = await exec({ texto: 'oi', provider: 'evolution', establishment: ESTABLISHMENT_WITH_LOGO });
    const resps = r?.[0]?.json?.respostas || [];
    assert(resps[0] && resps[0].type === 'sticker' && resps[0].link === STICKER_URL, 'figurinha primeiro');
    assert(String(resps[2]).includes('📋 *Sobre o Sakura*'), 'cartão com título: ' + resps[2]);
    assert(resps[3] && resps[3].type === 'location', 'pin do mapa');
    assert(typeof resps[4] === 'string' && resps[4].includes('*1.*'), 'menu numerado: ' + resps[4]);
    assertNoObjectObject(r);
  });

  // ── GRUPO 2: Falha crítica — números interceptados fora do fluxo ────────
  console.log('\n── Interceptação de números (bug crítico)');

  await test('[BUG FIX] digitar "1" em ordering_items NÃO vai para cardápio', async () => {
    const r = await exec({
      texto: '1',
      state: 'ordering_items',
      browse_category: 'Temaki',
    });
    // Estado deve ser awaiting_qty (selecionou item 1), não ordering_cat
    assertState(r, 'awaiting_qty');
    assertNoObjectObject(r);
  });

  await test('[BUG FIX] digitar "2" em ordering_items NÃO vai para fazer pedido', async () => {
    const r = await exec({
      texto: '2',
      state: 'ordering_items',
      browse_category: 'Temaki',
    });
    assertState(r, 'awaiting_qty');
    assertNoObjectObject(r);
  });

  await test('[BUG FIX] digitar "4" em awaiting_qty NÃO vai para atendente', async () => {
    const r = await exec({
      texto: '4',
      state: 'awaiting_qty',
      pending_item_id: 1,
      pending_item_name: 'Temaki Salmão',
    });
    // Deve interpretar "4" como quantidade
    assertState(r, 'awaiting_more');
    assertNoObjectObject(r);
  });

  await test('[BUG FIX] digitar "3" em ordering_items seleciona item 3 (não reservar)', async () => {
    const r = await exec({
      texto: '3',
      state: 'ordering_items',
      browse_category: 'Temaki',
    });
    assertState(r, 'awaiting_qty');
    assertNoObjectObject(r);
  });

  // ── GRUPO 3: Fluxo de navegação de categorias ────────────────────────────
  console.log('\n── Navegação de categorias');

  await test('botão "🛒 Fazer Pedido" → lista de categorias', async () => {
    const r = await exec({ texto: '2', state: 'start' });
    assertState(r, 'ordering_cat');
    assertResponseType(r, 'list');
    assertNoObjectObject(r);
  });

  await test('selecionar categoria Temaki → lista de itens (text_menu)', async () => {
    const r = await exec({ texto: 'order_cat:temaki', state: 'ordering_cat' });
    assertState(r, 'ordering_items');
    assertResponseContains(r, 'Temaki Salmão');
    assertNoObjectObject(r);
  });

  await test('texto "0" em ordering_items → volta para categorias', async () => {
    const r = await exec({ texto: '0', state: 'ordering_items', browse_category: 'Temaki' });
    assertState(r, 'ordering_cat');
    assertNoObjectObject(r);
  });

  // ── GRUPO 4: Seleção e quantidade ────────────────────────────────────────
  console.log('\n── Seleção de item e quantidade');

  await test('número válido em ordering_items → botões de quantidade', async () => {
    const r = await exec({ texto: '1', state: 'ordering_items', browse_category: 'Temaki' });
    assertState(r, 'awaiting_qty');
    assertResponseType(r, 'buttons');
    assertResponseContains(r, 'Adicionar');
    assertNoObjectObject(r);
  });

  await test('qty:1 (botão) → item adicionado ao carrinho', async () => {
    const r = await exec({
      texto: 'qty:1',
      state: 'awaiting_qty',
      pending_item_id: 1,
      pending_item_name: 'Temaki Salmão',
    });
    assertState(r, 'awaiting_more');
    assertResponseContains(r, 'adicionado');
    assertNoObjectObject(r);
    const cart = r?.[0]?.json?.cart;
    assert(cart?.items?.length === 1, 'Carrinho deve ter 1 item');
    assert(cart.items[0].qty === 1, 'Quantidade deve ser 1');
  });

  await test('digitar "3" como qtd → 3 unidades adicionadas', async () => {
    const r = await exec({
      texto: '3',
      state: 'awaiting_qty',
      pending_item_id: 1,
      pending_item_name: 'Temaki Salmão',
    });
    assertState(r, 'awaiting_more');
    const cart = r?.[0]?.json?.cart;
    assert(cart?.items?.[0]?.qty === 3, `Qtd esperada: 3, recebida: ${cart?.items?.[0]?.qty}`);
    assertNoObjectObject(r);
  });

  await test('qty:more → pede número (texto simples)', async () => {
    const r = await exec({
      texto: 'qty:more',
      state: 'awaiting_qty',
      pending_item_id: 1,
      pending_item_name: 'Temaki Salmão',
    });
    // Deve permanecer em awaiting_qty e pedir a qtd
    assertState(r, 'awaiting_qty');
    assertResponseContains(r, 'Quantas');
    assertNoObjectObject(r);
  });

  await test('item:back → volta para lista de itens', async () => {
    const r = await exec({
      texto: 'item:back',
      state: 'awaiting_qty',
      pending_item_id: 1,
      pending_item_name: 'Temaki Salmão',
      browse_category: 'Temaki',
    });
    assertState(r, 'ordering_items');
    assertResponseContains(r, 'Temaki');
    assertNoObjectObject(r);
  });

  // ── GRUPO 5: Carrinho e finalização ──────────────────────────────────────
  console.log('\n── Carrinho e finalização');

  const cartWithItem = {
    items: [{ id: 1, name: 'Temaki Salmão', qty: 2, price: 23.90, menuIdx: 1 }],
    order_type: '', address: '', complement: '', delivery_fee: 0,
    payment_method: '', change_for: null, split_count: 0, split_current: 0,
    split_payments: [], mixed_method: '', mixed_label: '', mixed_amount: 0,
    address_street_temp: null, browse_category: 'Temaki', browse_page: 0,
    pending_item_id: null, pending_item_name: '',
  };

  await test('finalizar → resumo com confirmBtn', async () => {
    const r = await exec({ texto: 'finalizar', state: 'ordering', cart: cartWithItem });
    assertState(r, 'confirming');
    assertResponseType(r, 'buttons');
    assertResponseContains(r, 'R$ 47,80');  // 23.90 × 2
    assertNoObjectObject(r);
  });

  await test('resumo da confirmação: nome numa linha, quantidade × unitário ..... total embaixo', async () => {
    const cart = { ...cartWithItem, items: [
      { id: 1, name: 'Combo Individual Hot', qty: 13, price: 43, menuIdx: 1 },
      { id: 2, name: 'Combo Hot Top', qty: 1, price: 70, menuIdx: 2, note: 'sem cebolinha' },
    ] };
    const r = await exec({ texto: 'finalizar', state: 'ordering', cart });
    assertState(r, 'confirming');
    const table = [
      '```',
      'Item',
      '  Qtd x  Unit.           Total',
      '------------------------------',
      'Combo Individual Hot',
      '   13 x  43,00 ........ 559,00',
      '',
      'Combo Hot Top',
      '  ↳ obs: sem cebolinha',
      '    1 x  70,00 ......... 70,00',
      '```',
    ];
    table.slice(1, -1).forEach((row) => assert(row.length <= 30, 'linha passa de 30 caracteres: ' + row));
    assertResponseContains(r, table.join('\n'));
    assertResponseContains(r, '🧾 14 itens\n💰 *Total: R$ 629,00*');
  });

  await test('confirmar → pede tipo de entrega', async () => {
    const r = await exec({ texto: 'sim', state: 'confirming', cart: cartWithItem });
    assertState(r, 'awaiting_type');
    assertResponseType(r, 'buttons');
    assertNoObjectObject(r);
  });

  await test('retirada → pede pagamento diretamente', async () => {
    const r = await exec({ texto: 'retirada', state: 'awaiting_type', cart: { ...cartWithItem, order_type: '' } });
    assertState(r, 'awaiting_payment');
    assertResponseType(r, 'list');
    assertNoObjectObject(r);
  });

  // ── GRUPO 6: Formatação de moeda ─────────────────────────────────────────
  console.log('\n── Formatação de moeda');

  await test('preços usam vírgula como separador decimal (R$ 23,90)', async () => {
    const r = await exec({ texto: '1', state: 'ordering_items', browse_category: 'Temaki' });
    assertResponseContains(r, 'R$ 23,90');
    assertNoObjectObject(r);
    // Garantir que não tem ponto decimal americano nos preços visíveis
    const resps = r?.[0]?.json?.respostas || [];
    resps.forEach((resp, i) => {
      const body = typeof resp === 'string' ? resp : (resp?.body || '');
      const americanPrice = body.match(/R\$ \d+\.\d{2}/);
      assert(!americanPrice, `Resposta[${i}] usa formato americano: ${americanPrice?.[0]}`);
    });
  });

  // ── GRUPO 7: Repeat order ────────────────────────────────────────────────
  console.log('\n── Pedido repetido');

  await test('sim no repeat_order → itens carregados no carrinho', async () => {
    const r = await exec({
      texto: 'sim',
      state: 'repeat_order',
      lastOrder: { items: [{ id: 1, name: 'Temaki Salmão', price: 23.90, qty: 2 }], total: 47.80 },
    });
    assertState(r, 'ordering');
    const cart = r?.[0]?.json?.cart;
    assert(cart?.items?.length === 1, 'Carrinho deve ter 1 item do pedido anterior');
    assertNoObjectObject(r);
  });

  await test('não no repeat_order → vai para menu principal', async () => {
    const r = await exec({ texto: 'não', state: 'repeat_order' });
    assertState(r, 'start');
    assertResponseType(r, 'buttons');
    assertNoObjectObject(r);
  });

  // ── GRUPO 8: Tamanhos ────────────────────────────────────────────────────
  console.log('\n── Tamanhos');

  await test('lista mostra o item com tamanhos uma vez só, com os dois preços', async () => {
    const r = await exec({ texto: 'order_cat:temakis', state: 'ordering_cat' });
    assertResponseType(r, 'list');
    assertResponseContains(r, 'Temaki Hot 💰 Médio R$ 37,00 · Grande R$ 49,00');
    assertResponseContains(r, 'Sashimi 💰 R$ 60,00');
    assertNoObjectObject(r);
  });

  // ── GRUPO 8b: Cardápio por provedor e paginação ─────────────────────────
  console.log('\n── Cardápio: lista interativa (oficial), texto (Evolution) e paginação');

  const MANY_COMBOS = Array.from({ length: 11 }, (_, index) => ({
    id: 100 + index, name: 'Combo ' + (index + 1), category: 'Combinados', price: 50 + index,
    description: 'Peças variadas do chef número ' + (index + 1),
  }));
  const MANY_CATEGORIES = Array.from({ length: 10 }, (_, index) => ({
    id: 200 + index, name: 'Item ' + index, category: 'Categoria ' + (index + 1), price: 10,
  }));
  const rowsOf = (r) => (r?.[0]?.json?.respostas || []).flatMap((m) => (m?.sections || []).flatMap((section) => section.rows));

  const YUYAKI_COMBOS = [
    { id: 301, name: 'Combo Tradicional', category: 'Combinados', price: 95,
      description: '32 unidades · 4 sashimi de salmão, 4 hakusai de salmão, 8 hot roll, 8 uramaki de salmão, 8 hossomaki de salmão' },
    { id: 302, name: 'Combo Executivo', category: 'Combinados', price: 125,
      description: '42 unidades · 8 sashimi de salmão, 6 joe salmão, 4 hakusai camarão, 8 uramaki grelhado, 8 hot roll, 8 hot couve' },
    { id: 303, name: 'Ceviche Mix', category: 'Combinados', price: 60,
      description: 'Mix de peixes em cubos, cebola roxa, cebolinha, limão, tarê, pimenta e mais um monte de coisa boa' },
  ];

  await test('cardápio: descrição longa não corta palavra; composição termina em "+N itens" com a porção', async () => {
    const r = await exec({ texto: 'order_cat:combinados', state: 'ordering_cat', products: YUYAKI_COMBOS });
    const rows = rowsOf(r);
    const tradicional = rows.find((row) => row.title.includes('Combo Tradicional'));
    assert(tradicional.description.startsWith('💰 R$ 95,00 · 32 unidades · 4 sashimi de salmão'), tradicional.description);
    assert(/\+\d itens$/.test(tradicional.description), tradicional.description);
    assert(Array.from(tradicional.description).length <= 72, 'acima de 72');
    const ceviche = rows.find((row) => row.title.includes('Ceviche'));
    assert(ceviche.description.endsWith('…') && !/\s…$/.test(ceviche.description), ceviche.description);
    assert(rows.every((row) => !row.description || Array.from(row.description).length <= 72), 'linha fora do limite');
  });

  await test('tela do combo mostra a porção e cada peça numa linha, sem cortar', async () => {
    const r = await exec({ texto: '1', state: 'ordering_items', browse_category: 'Combinados', products: YUYAKI_COMBOS });
    const screen = r[0].json.respostas.find((message) => message && message.type === 'buttons');
    assert(screen.body.includes('📦 *32 unidades*'), screen.body);
    assert(screen.body.includes('• 8 hossomaki de salmão') && screen.body.includes('• 4 sashimi de salmão'), screen.body);
  });

  await test('oficial: itens viram lista interativa com ≤10 linhas, "Ver mais" e "Voltar"', async () => {
    const r = await exec({ texto: 'order_cat:combinados', state: 'ordering_cat', products: MANY_COMBOS });
    assertResponseType(r, 'list');
    const rows = rowsOf(r);
    assert(rows.length === 10, 'esperado 10 linhas, veio ' + rows.length);
    assert(rows[0].id === '1' && rows[0].title === '🍱 Combo 1', JSON.stringify(rows[0]));
    assert(rows[8].id === 'próxima' && rows[8].title === '➡️ Ver mais', JSON.stringify(rows[8]));
    assert(rows[9].id === '0', JSON.stringify(rows[9]));
    assert(rows.every((row) => Array.from(row.title).length <= 24 && Array.from(row.description || '').length <= 72), 'limites da Meta');
    assertResponseContains(r, '*Combinados*');
    assertResponseContains(r, 'Página 1 de 2');
  });

  await test('oficial: "próxima" mostra a página 2 numerada a partir do 9 e oferece voltar ao início', async () => {
    const r = await exec({ texto: 'próxima', state: 'ordering_items', browse_category: 'Combinados', products: MANY_COMBOS });
    const rows = rowsOf(r);
    assert(rows[0].id === '9' && rows[0].title.includes('Combo 9'), JSON.stringify(rows[0]));
    assert(rows.some((row) => row.title === '🔁 Ver do início'), 'sem "Ver do início"');
    assert(r[0].json.cart.browse_page === 1, 'browse_page não avançou');
  });

  await test('oficial: tocar no item 10 (página 2) abre a quantidade do Combo 10', async () => {
    const r = await exec({ texto: '10', state: 'ordering_items', browse_category: 'Combinados', browse_page: 1, products: MANY_COMBOS });
    assertState(r, 'awaiting_qty');
    assertResponseContains(r, 'Combo 10');
  });

  await test('oficial: categorias paginadas com emoji e "Ver mais"', async () => {
    const r = await exec({ texto: '2', state: 'start', products: MANY_CATEGORIES });
    const rows = rowsOf(r);
    assert(rows.length === 10, 'esperado 10 linhas, veio ' + rows.length);
    assert(rows[0].id === 'order_cat:categoria 1' && rows[0].description === '1 item', JSON.stringify(rows[0]));
    assert(rows[8].id === 'próxima', JSON.stringify(rows[8]));
    const next = await exec({ texto: 'próxima', state: 'ordering_cat', products: MANY_CATEGORIES });
    const nextRows = rowsOf(next);
    assert(nextRows[0].title.includes('Categoria 9'), JSON.stringify(nextRows[0]));
    assert(next[0].json.cart.browse_cat_page === 1, 'browse_cat_page não avançou');
  });

  await test('evolution: categorias e itens chegam como texto numerado em negrito', async () => {
    const categories = await exec({ texto: '2', state: 'start', provider: 'evolution' });
    const categoriesText = categories[0].json.respostas[0];
    assert(typeof categoriesText === 'string', 'categorias deveriam ser texto');
    assert(categoriesText.includes('*1.* 🌯 *Temaki* · _4 itens_'), categoriesText);
    assert(categoriesText.includes('*0*'), categoriesText);

    const items = await exec({ texto: '1', state: 'ordering_cat', provider: 'evolution' });
    assertState(items, 'ordering_items');
    const itemsText = items[0].json.respostas[0];
    assert(typeof itemsText === 'string', 'itens deveriam ser texto');
    assert(itemsText.includes('*1.* 🌯 *Temaki Salmão* — *R$ 23,90*'), itemsText);
  });

  await test('oficial: nenhuma resposta sai como texto numerado e tudo cabe nos limites da Meta', async () => {
    const steps = [
      { texto: 'oi', state: 'start' },
      { texto: '2', state: 'start', products: MANY_COMBOS },
      { texto: 'order_cat:combinados', state: 'ordering_cat', products: MANY_COMBOS },
      { texto: 'order_cat:temakis', state: 'ordering_cat' },
      { texto: '1', state: 'ordering_items', browse_category: 'Temakis' },
      { texto: 'issue_atraso', state: 'awaiting_help_option', recent_orders: [{ code: 'PED-1', status: 'preparing', order_type: 'delivery', total: 50, created_at: '13/11', estimated_at: new Date(Date.now() - 600000).toISOString() }], cart: { items: [], issue_order_code: 'PED-1' } },
    ];
    for (const step of steps) {
      const r = await exec(step);
      for (const message of r[0].json.respostas) {
        const body = typeof message === 'string' ? message : message.body || '';
        assert(!/\n\*?\d+\.\*? /.test(body), 'texto numerado na Meta (' + step.texto + '): ' + body.slice(0, 200));
        assert(!(message && message.type === 'text_menu'), 'text_menu na Meta');
        if (message && message.type === 'buttons') {
          assert(message.buttons.length <= 3 && message.buttons.every((button) => Array.from(button.title).length <= 20), 'botão fora do limite: ' + JSON.stringify(message.buttons));
        }
        if (message && message.type === 'list') {
          const rows = message.sections.flatMap((section) => section.rows);
          assert(rows.length <= 10, 'lista com ' + rows.length + ' linhas');
          assert(rows.every((row) => Array.from(row.title).length <= 24 && Array.from(row.description || '').length <= 72), 'linha fora do limite');
        }
      }
    }
  });

  await test('evolution: botões viram texto numerado e o número volta a ser o id da opção', async () => {
    const r = await exec({ texto: '1', state: 'ordering_items', browse_category: 'Temakis', provider: 'evolution' });
    assertState(r, 'awaiting_size');
    const text = r[0].json.respostas.find((message) => typeof message === 'string' && message.includes('Qual tamanho'));
    assert(text && text.includes('*1.* *🔸 Médio · R$ 37,00*') && text.includes('*2.* *🔸 Grande · R$ 49,00*') && text.includes('*3.* *↩️ Trocar item*'), String(text));
    const choices = r[0].json.cart.menu_choices;
    assert(choices['2'] === 'size:9', JSON.stringify(choices));
    const picked = await exec({ texto: '2', state: 'awaiting_size', provider: 'evolution',
      cart: { items: [], browse_category: 'Temakis', pending_group: 'temaki-hot', menu_choices: choices } });
    assertState(picked, 'awaiting_qty');
    assertResponseContains(picked, 'Temaki Hot (Grande)');
  });

  await test('evolution: em passo de número livre (quantidade) as opções saem sem número e "2" é quantidade', async () => {
    const r = await exec({ texto: 'size:9', state: 'awaiting_size', provider: 'evolution', cart: { items: [], browse_category: 'Temakis', pending_group: 'temaki-hot' } });
    assertState(r, 'awaiting_qty');
    const text = r[0].json.respostas.find((message) => typeof message === 'string' && message.includes('Adicionar'));
    assert(text && !/\*1\.\*/.test(text) && text.includes('• *✅ Adicionar 1*') && text.includes('• *📝 Com observação*'), String(text));
    assert(Object.keys(r[0].json.cart.menu_choices).length === 0, 'não deveria guardar números');
  });

  await test('observação na escolha do item: pede a nota, depois a quantidade, e entra só naquele item', async () => {
    const pending = baseCartForNote();
    const asked = await exec({ texto: 'qty:note', state: 'awaiting_qty', cart: pending });
    assertState(asked, 'awaiting_item_note');
    const noted = await exec({ texto: 'sem cebolinha', state: 'awaiting_item_note', cart: asked[0].json.cart });
    assertState(noted, 'awaiting_qty');
    assertResponseContains(noted, 'Anotado para o *Temaki Salmão*: _sem cebolinha_');
    const added = await exec({ texto: '2', state: 'awaiting_qty', cart: noted[0].json.cart });
    assertState(added, 'awaiting_more');
    const items = added[0].json.cart.items;
    assert(items.length === 2, 'itens: ' + JSON.stringify(items));
    assert(items[0].note === undefined && items[0].qty === 1, 'o item que já estava não ganha a observação');
    assert(items[1].note === 'sem cebolinha' && items[1].qty === 2, 'novo: ' + JSON.stringify(items[1]));
    assert(!JSON.stringify(added).includes('__item_note__'), 'não oferece mais observação depois de adicionar');
  });

  await test('"2 sem cebolinha" na quantidade: quantidade e observação de uma vez', async () => {
    const r = await exec({ texto: '2 sem cebolinha', state: 'awaiting_qty', cart: baseCartForNote() });
    const added = r[0].json.cart.items.find((item) => item.note === 'sem cebolinha');
    assert(added && added.qty === 2, JSON.stringify(r[0].json.cart.items));
  });

  await test('evolution: "obs" na quantidade abre a observação', async () => {
    const r = await exec({ texto: 'obs', state: 'awaiting_qty', provider: 'evolution', cart: baseCartForNote() });
    assertState(r, 'awaiting_item_note');
  });

  await test('tela do produto tem "Trocar item" e ele volta para a lista sem levar nada', async () => {
    const shown = await exec({ texto: 'qty:note', state: 'awaiting_qty', cart: baseCartForNote() });
    assert(JSON.stringify(shown).includes('↩️ Trocar item'), 'observação deve ter Trocar item');
    const back = await exec({ texto: 'item:back', state: 'awaiting_item_note', cart: shown[0].json.cart });
    assertState(back, 'ordering_items');
    assert(back[0].json.cart.pending_item_id === null, 'item pendente limpo');
    assert(back[0].json.cart.items.length === 1, 'carrinho igual');
  });

  await test('observação: "Sem observação" segue para a quantidade', async () => {
    const r = await exec({ texto: 'note:skip', state: 'awaiting_item_note', cart: baseCartForNote() });
    assertState(r, 'awaiting_qty');
    assertResponseContains(r, 'sem observação');
  });

  const editCart = () => ({ ...baseCartForNote(), pending_item_id: null, pending_item_name: '', items: [
    { id: 1, name: 'Temaki Salmão', qty: 2, price: 25, menuIdx: 1 },
    { id: 2, name: 'Hot Roll', qty: 1, price: 30, menuIdx: 2, note: 'sem cream cheese' },
  ] });

  await test('editar carrinho: lista as linhas e remove a escolhida', async () => {
    const list = await exec({ texto: 'cart:edit', state: 'awaiting_more', cart: editCart() });
    assertState(list, 'awaiting_cart_edit');
    assertResponseType(list, 'list');
    const picked = await exec({ texto: 'edit:item:1', state: 'awaiting_cart_edit', cart: list[0].json.cart });
    assertState(picked, 'awaiting_cart_edit_item');
    assertResponseContains(picked, '↳ obs: _sem cream cheese_');
    const removed = await exec({ texto: 'edit:remove', state: 'awaiting_cart_edit_item', cart: picked[0].json.cart });
    assertState(removed, 'awaiting_more');
    const items = removed[0].json.cart.items;
    assert(items.length === 1 && items[0].id === 1, JSON.stringify(items));
    assertResponseContains(removed, 'Tirei *Hot Roll* do carrinho');
  });

  await test('editar carrinho: muda a quantidade; 0 tira; texto estranho pede de novo', async () => {
    const picked = await exec({ texto: 'edit:item:0', state: 'awaiting_cart_edit', cart: editCart() });
    const asking = await exec({ texto: 'edit:qty', state: 'awaiting_cart_edit_item', cart: picked[0].json.cart });
    assertState(asking, 'awaiting_cart_edit_qty');
    const bad = await exec({ texto: '-3', state: 'awaiting_cart_edit_qty', cart: asking[0].json.cart });
    assertState(bad, 'awaiting_cart_edit_qty');
    const changed = await exec({ texto: '5', state: 'awaiting_cart_edit_qty', cart: asking[0].json.cart });
    assert(changed[0].json.cart.items[0].qty === 5, JSON.stringify(changed[0].json.cart.items));
    const zero = await exec({ texto: '0', state: 'awaiting_cart_edit_qty', cart: asking[0].json.cart });
    assert(zero[0].json.cart.items.length === 1 && zero[0].json.cart.items[0].id === 2, 'zero remove');
  });

  await test('confirmação tem Confirmar, Editar e Cancelar', async () => {
    const r = await exec({ texto: 'finalizar', state: 'awaiting_more', cart: editCart() });
    assertState(r, 'confirming');
    const body = JSON.stringify(r);
    assert(body.includes('✅ Confirmar') && body.includes('✏️ Editar') && body.includes('❌ Cancelar'), body.slice(-400));
    const edit = await exec({ texto: 'cart:edit', state: 'confirming', cart: editCart() });
    assertState(edit, 'awaiting_cart_edit');
  });

  await test('removendo o último item o carrinho vazio volta para as categorias', async () => {
    const cart = { ...editCart(), items: [{ id: 1, name: 'Temaki Salmão', qty: 1, price: 25, menuIdx: 1 }], edit_index: 0 };
    const r = await exec({ texto: 'edit:remove', state: 'awaiting_cart_edit_item', cart });
    assertState(r, 'ordering_cat');
    assertResponseContains(r, 'carrinho ficou vazio');
  });

  await test('evolution: lista longa mostra "próxima" e número da página', async () => {
    const r = await exec({ texto: 'order_cat:combinados', state: 'ordering_cat', provider: 'evolution', products: MANY_COMBOS });
    const text = r[0].json.respostas[0];
    assert(text.includes('*8.*') && !text.includes('*9.*'), text);
    assert(text.includes('Página 1 de 2') && text.includes('*próxima*'), text);
  });

  await test('escolher item com tamanhos pergunta o tamanho', async () => {
    const r = await exec({ texto: '1', state: 'ordering_items', browse_category: 'Temakis' });
    assertState(r, 'awaiting_size');
    assertResponseContains(r, 'Qual tamanho?');
    assertResponseContains(r, '🔸 Grande · R$ 49,00');
  });

  await test('tela de tamanho: emoji e nome em negrito, descrição em itálico e "Trocar item"', async () => {
    const r = await exec({ texto: '1', state: 'ordering_items', browse_category: 'Temakis' });
    const screen = r[0].json.respostas.find((message) => message && message.type === 'buttons');
    assert(/^\S+ \*Temaki Hot\*/.test(screen.body), screen.body);
    assert(screen.buttons.some((button) => button.id === 'item:back' && button.title === '↩️ Trocar item'), JSON.stringify(screen.buttons));
    assert(screen.buttons.every((button) => Array.from(button.title).length <= 20), 'botão acima de 20');
    const back = await exec({ texto: 'item:back', state: 'awaiting_size', cart: { items: [], browse_category: 'Temakis', pending_group: 'temaki-hot' } });
    assertState(back, 'ordering_items');
  });

  await test('com carrinho: categorias e itens trazem "🛒 Finalizar pedido" e ele fecha o pedido', async () => {
    const cart = { items: [{ id: 1, name: 'Combo Junior', qty: 2, price: 30 }], browse_category: 'Temakis' };
    const items = await exec({ texto: '__add_more__', state: 'awaiting_more', cart });
    const itemsListMsg = items[0].json.respostas.find((message) => message && message.type === 'list');
    const itemRows = itemsListMsg.sections.flatMap((section) => section.rows);
    const checkoutRow = itemRows[itemRows.length - 2];
    assert(checkoutRow.id === 'finalizar' && checkoutRow.title === '🛒 Finalizar pedido' && checkoutRow.description.includes('R$ 60,00'), JSON.stringify(itemRows));
    assert(itemRows[itemRows.length - 1].id === '0', 'voltar deveria ser a última');
    assert(itemRows.some((row) => row.id === '0'), 'sem voltar');
    const cats = await exec({ texto: '0', state: 'ordering_items', cart });
    assertState(cats, 'ordering_cat');
    const catList = cats[0].json.respostas.find((message) => message && message.type === 'list');
    const catRows = catList.sections[0].rows;
    assert(catRows[catRows.length - 2].id === 'finalizar' && catRows[catRows.length - 1].id === '0', JSON.stringify(catRows));
    assert(!catList.body.includes('áudio'), 'não deveria repetir a dica longa: ' + catList.body);
    const done = await exec({ texto: 'finalizar', state: 'ordering_cat', cart });
    assertState(done, 'confirming');
  });

  await test('sem carrinho: voltar às categorias não repete a dica de escrever/áudio e não tem finalizar', async () => {
    const cats = await exec({ texto: '0', state: 'ordering_items', browse_category: 'Temakis' });
    const catList = cats[0].json.respostas.find((message) => message && message.type === 'list');
    assert(!catList.body.includes('áudio'), catList.body);
    assert(!catList.sections[0].rows.some((row) => row.id === 'finalizar'), 'finalizar sem carrinho');
  });

  await test('evolution com carrinho: lista em texto mostra como finalizar', async () => {
    const cart = { items: [{ id: 1, name: 'Combo Junior', qty: 1, price: 30 }] };
    const r = await exec({ texto: '0', state: 'ordering_items', provider: 'evolution', cart });
    const text = r[0].json.respostas.find((message) => typeof message === 'string' && message.includes('Finalizar pedido'));
    assert(text && text.includes('digite *finalizar*') && text.includes('R$ 30,00'), String(text));
  });

  await test('botão de tamanho leva à quantidade do produto certo', async () => {
    const cart = { items: [], browse_category: 'Temakis', pending_group: 'temaki-hot' };
    const r = await exec({ texto: 'size:9', state: 'awaiting_size', cart });
    assertState(r, 'awaiting_qty');
    assert(String(r?.[0]?.json?.cart?.pending_item_id) === '9', 'Deve aguardar quantidade do Grande');
  });

  await test('tamanho digitado por extenso também vale', async () => {
    const cart = { items: [], browse_category: 'Temakis', pending_group: 'temaki-hot' };
    const r = await exec({ texto: 'medio', state: 'awaiting_size', cart });
    assert(String(r?.[0]?.json?.cart?.pending_item_id) === '8', 'Deve aguardar quantidade do Médio');
  });

  await test('item sem tamanho vai direto para a quantidade', async () => {
    const r = await exec({ texto: '2', state: 'ordering_items', browse_category: 'Temakis' });
    assertState(r, 'awaiting_qty');
  });

  // ── GRUPO 9: Encomendas (agendar) ─────────────────────────────────────────
  console.log('\n── Encomendas');

  const SLOTS = [{ date: '2026-11-14', times: ['18:00', '18:15', '18:30', '19:00'] }];
  const filledCart = { items: [{ id: 1, name: 'Temaki Salmão', qty: 1, price: 23.90 }] };

  await test('sem horários livres, confirmar segue direto para o tipo de pedido', async () => {
    const r = await exec({ texto: 'sim', state: 'confirming', cart: filledCart });
    assertState(r, 'awaiting_type');
  });

  await test('com horários livres, confirmar não pergunta mais "agora ou agendar": vai direto para a forma de receber', async () => {
    const r = await exec({ texto: 'sim', state: 'confirming', cart: filledCart, schedule_slots: SLOTS });
    assertState(r, 'awaiting_type');
    const text = JSON.stringify(r[0].json.respostas);
    assert(!text.includes('agora ou quer agendar'), text);
  });

  await test('lista de categorias traz "📅 Agendar pedido" quando há horários livres', async () => {
    const r = await exec({ texto: '2', state: 'start', schedule_slots: SLOTS });
    const rows = (r[0].json.respostas.find((m) => m && m.type === 'list') || { sections: [] }).sections.flatMap((sec) => sec.rows);
    assert(rows.some((row) => row.id === 'schedule:start' && row.title === '📅 Agendar pedido'), JSON.stringify(rows));
    const noSlots = await exec({ texto: '2', state: 'start' });
    const rowsNoSlots = noSlots[0].json.respostas.find((m) => m && m.type === 'list').sections.flatMap((sec) => sec.rows);
    assert(!rowsNoSlots.some((row) => row.id === 'schedule:start'), 'sem horários não oferece agendar');
  });

  await test('agendar mostra os dias e depois os horários livres', async () => {
    const days = await exec({ texto: 'schedule:start', state: 'ordering_cat', cart: filledCart, schedule_slots: SLOTS });
    assertState(days, 'awaiting_schedule_day');
    assertResponseContains(days, 'sáb 14/11');
    const typed = await exec({ texto: 'agendar', state: 'ordering_cat', cart: filledCart, schedule_slots: SLOTS });
    assertState(typed, 'awaiting_schedule_day');
    const dayRows = days[0].json.respostas[0].sections[0].rows;
    assert(dayRows[dayRows.length - 1].id === '0', 'dias sem Voltar');
    const times = await exec({ texto: 'day:2026-11-14', state: 'awaiting_schedule_day', cart: filledCart, schedule_slots: SLOTS });
    assertState(times, 'awaiting_schedule_time');
    assertResponseContains(times, '18:30');
    const rows = times?.[0]?.json?.respostas?.[0]?.sections?.[0]?.rows || [];
    assert(!rows.some((row) => row.title.includes('18:15')), 'Lista prioriza horas cheias e meias');
    assert(rows[rows.length - 1].id === '0' && rows.length <= 10, 'horários sem Voltar ou acima de 10');
  });

  await test('Voltar no agendamento: horário → dias → categorias', async () => {
    const toDays = await exec({ texto: '0', state: 'awaiting_schedule_time', cart: { ...filledCart, scheduled_date: '2026-11-14' }, schedule_slots: SLOTS });
    assertState(toDays, 'awaiting_schedule_day');
    const toCats = await exec({ texto: '0', state: 'awaiting_schedule_day', cart: filledCart, schedule_slots: SLOTS });
    assertState(toCats, 'ordering_cat');
  });

  await test('agendado: categorias mostram o horário e "Pedir para agora" desfaz', async () => {
    const cart = { ...filledCart, scheduled_date: '2026-11-14', scheduled_time: '18:30' };
    const cats = await exec({ texto: '0', state: 'ordering_items', cart, schedule_slots: SLOTS });
    const list = cats[0].json.respostas.find((m) => m && m.type === 'list');
    assert(list.body.includes('Agendado para sáb 14/11 às 18:30'), list.body);
    assert(list.sections[0].rows.some((row) => row.id === 'schedule:start' && row.title.includes('14/11 18:30')), JSON.stringify(list.sections[0].rows));
    const days = await exec({ texto: 'schedule:start', state: 'ordering_cat', cart, schedule_slots: SLOTS });
    assert(days[0].json.respostas[0].sections[0].rows.some((row) => row.id === 'schedule:now'), 'sem "para agora"');
    const now = await exec({ texto: 'schedule:now', state: 'awaiting_schedule_day', cart, schedule_slots: SLOTS });
    assertState(now, 'ordering_cat');
    assert(!now[0].json.cart.scheduled_date && !now[0].json.cart.scheduled_time, 'agendamento deveria sair');
  });

  await test('confirmação do pedido agendado mostra o horário e segue sem perguntar de novo', async () => {
    const cart = { ...filledCart, scheduled_date: '2026-11-14', scheduled_time: '18:30' };
    const summary = await exec({ texto: 'finalizar', state: 'awaiting_more', cart, schedule_slots: SLOTS });
    assertState(summary, 'confirming');
    assertResponseContains(summary, 'Agendado para sáb 14/11 às 18:30');
    const confirmed = await exec({ texto: 'sim', state: 'confirming', cart, schedule_slots: SLOTS });
    assertState(confirmed, 'awaiting_type');
    assert(confirmed[0].json.cart.scheduled_time === '18:30', 'confirmar não pode apagar o agendamento');
  });

  await test('Voltar no checkout: forma de receber → resumo; pagamento → forma de receber; endereço → forma de receber', async () => {
    const typeScreen = await exec({ texto: 'sim', state: 'confirming', cart: filledCart });
    const typeButtons = typeScreen[0].json.respostas.find((m) => m && m.type === 'buttons').buttons;
    assert(typeButtons[typeButtons.length - 1].id === '0' && typeButtons.length <= 3, JSON.stringify(typeButtons));
    const backToSummary = await exec({ texto: '0', state: 'awaiting_type', cart: filledCart });
    assertState(backToSummary, 'confirming');
    const payment = await exec({ texto: 'retirada', state: 'awaiting_type', cart: filledCart });
    const payRows = payment[0].json.respostas.find((m) => m && m.type === 'list').sections[0].rows;
    assert(payRows[payRows.length - 1].id === '0', JSON.stringify(payRows));
    const backToType = await exec({ texto: '0', state: 'awaiting_payment', cart: { ...filledCart, order_type: 'retirada' } });
    assertState(backToType, 'awaiting_type');
    assert(backToType[0].json.cart.order_type === '', 'forma de receber deveria ser limpa');
    const fromAddress = await exec({ texto: 'voltar', state: 'awaiting_address', cart: { ...filledCart, order_type: 'delivery' } });
    assertState(fromAddress, 'awaiting_type');
  });

  await test('horário digitado fora da agenda é recusado', async () => {
    const cart = { ...filledCart, scheduled_date: '2026-11-14' };
    const r = await exec({ texto: '21:00', state: 'awaiting_schedule_time', cart, schedule_slots: SLOTS });
    assertState(r, 'awaiting_schedule_time');
    assertResponseContains(r, 'não está disponível');
  });

  await test('horário válido guarda a encomenda e o pedido sai com scheduled_for', async () => {
    const cart = { ...filledCart, scheduled_date: '2026-11-14' };
    const chosen = await exec({ texto: '18:15', state: 'awaiting_schedule_time', cart, schedule_slots: SLOTS });
    assertState(chosen, 'ordering_cat');
    assertResponseContains(chosen, 'Agendado para sáb 14/11 às 18:15');
    const paid = await exec({
      texto: 'pix', state: 'awaiting_payment',
      cart: { ...filledCart, order_type: 'retirada', scheduled_date: '2026-11-14', scheduled_time: '18:15' },
      schedule_slots: SLOTS,
    });
    assert(paid?.[0]?.json?.order?.scheduled_for === '2026-11-14T18:15:00-03:00', 'scheduled_for: ' + paid?.[0]?.json?.order?.scheduled_for);
    assertResponseContains(paid, 'Agendado para sáb 14/11 às 18:15');
  });

  await test('pedido para agora não leva scheduled_for', async () => {
    const paid = await exec({ texto: 'pix', state: 'awaiting_payment', cart: { ...filledCart, order_type: 'retirada' } });
    assert(paid?.[0]?.json?.order?.scheduled_for === null, 'scheduled_for deve ser null');
  });

  // ── AJUDA COM O PEDIDO ─────────────────────────────────────────────────────
  console.log('\n🆘 Ajuda com o pedido e problema relatado');
  const isoAgo = (minutes) => new Date(Date.now() - minutes * 60000).toISOString();
  const isoAhead = (minutes) => new Date(Date.now() + minutes * 60000).toISOString();
  const rowIds = (r) => (r?.[0]?.json?.respostas || [])
    .flatMap((m) => (m?.sections || []).flatMap((sec) => sec.rows.map((row) => row.id)));
  const ACTIVE_ON_TIME = [{ code: 'PED-1', status: 'received', order_type: 'delivery', total: 50, created_at: '13/11', estimated_at: isoAhead(30) }];
  const ACTIVE_LATE = [{ code: 'PED-1', status: 'preparing', order_type: 'delivery', total: 50, created_at: '13/11', estimated_at: isoAgo(10) }];
  const DELIVERED = [{ code: 'PED-9', status: 'delivered', order_type: 'retirada', total: 30, created_at: '13/11', completed_at: isoAgo(60) }];
  const DELIVERED_LONG_AGO = [{ code: 'PED-8', status: 'delivered', order_type: 'delivery', total: 30, created_at: '10/11', completed_at: isoAgo(60 * 24) }];

  await test('"problema com o pedido" abre a ajuda, não o cardápio', async () => {
    const r = await exec({ texto: 'tive um problema com o pedido', recent_orders: ACTIVE_ON_TIME });
    assertState(r, 'awaiting_help_option');
    assertResponseContains(r, 'Ajuda com o pedido #PED-1');
  });

  await test('pedido no prazo e ainda não em preparo: onde está, alterar e atendente (sem atrasado)', async () => {
    const ids = rowIds(await exec({ texto: 'ajuda', recent_orders: ACTIVE_ON_TIME }));
    assert(JSON.stringify(ids) === JSON.stringify(['ajuda_status', 'ajuda_alterar', 'ajuda_atendente']), 'opções: ' + ids);
  });

  await test('pedido em preparo e passou da previsão: atrasado aparece, alterar some', async () => {
    const ids = rowIds(await exec({ texto: 'ajuda', recent_orders: ACTIVE_LATE }));
    assert(JSON.stringify(ids) === JSON.stringify(['ajuda_status', 'issue_atraso', 'ajuda_atendente']), 'opções: ' + ids);
  });

  await test('entregue há pouco: opções de problema, sem "entrega" quando foi retirada', async () => {
    const ids = rowIds(await exec({ texto: 'problema', recent_orders: DELIVERED }));
    assert(ids.includes('issue_item_faltando') && ids.includes('issue_cobranca'), 'opções: ' + ids);
    assert(!ids.includes('issue_entrega') && !ids.includes('issue_atraso') && !ids.includes('ajuda_status'), 'opções: ' + ids);
    assert(ids[ids.length - 1] === 'ajuda_atendente', 'atendente deve aparecer sempre');
  });

  await test('sem pedido ativo (ou entregue há muito tempo): fazer pedido, cardápio e atendente', async () => {
    const ids = rowIds(await exec({ texto: 'ajuda', recent_orders: DELIVERED_LONG_AGO }));
    assert(JSON.stringify(ids) === JSON.stringify(['2', '1', 'ajuda_atendente']), 'opções: ' + ids);
  });

  await test('"onde está meu pedido" mostra status e previsão', async () => {
    const r = await exec({ texto: 'ajuda_status', state: 'awaiting_help_option', recent_orders: ACTIVE_ON_TIME, cart: { items: [], issue_order_code: 'PED-1' } });
    assertState(r, 'start');
    assertResponseContains(r, '#PED-1');
    assertResponseContains(r, 'Previsão:');
  });

  await test('"atrasado" antes da previsão é recusado', async () => {
    const r = await exec({ texto: 'issue_atraso', state: 'awaiting_help_option', recent_orders: ACTIVE_ON_TIME, cart: { items: [], issue_order_code: 'PED-1' } });
    assertState(r, 'awaiting_help_option');
    assert(r?.[0]?.json?.save_issue === false, 'não deve registrar');
  });

  await test('atrasado registra na hora, mostra a previsão e oferece atendente', async () => {
    const r = await exec({ texto: 'issue_atraso', state: 'awaiting_help_option', recent_orders: ACTIVE_LATE, cart: { items: [], issue_order_code: 'PED-1' } });
    const json = r?.[0]?.json || {};
    assert(json.save_issue === true && json.issue?.category === 'atraso' && json.issue?.order_code === 'PED-1', 'issue: ' + JSON.stringify(json.issue));
    assertState(r, 'awaiting_issue_followup');
    assertResponseContains(r, 'A previsão era');
    assertResponseContains(r, 'Chamar atendente');
  });

  await test('problema depois de entregue pede o detalhe e registra com descrição', async () => {
    const asked = await exec({ texto: 'issue_item_faltando', state: 'awaiting_help_option', recent_orders: DELIVERED, cart: { items: [], issue_order_code: 'PED-9' } });
    assertState(asked, 'awaiting_issue_detail');
    const r = await exec({
      texto: 'faltou o refrigerante',
      state: 'awaiting_issue_detail',
      recent_orders: DELIVERED,
      cart: { items: [], issue_order_code: 'PED-9', issue_category: 'item_faltando' },
    });
    const json = r?.[0]?.json || {};
    assert(json.issue?.description === 'faltou o refrigerante' && json.issue?.category === 'item_faltando', 'issue: ' + JSON.stringify(json.issue));
    assertResponseContains(r, 'Problema registrado no pedido #PED-9');
  });

  await test('"pular" registra sem descrição', async () => {
    const r = await exec({ texto: 'pular', state: 'awaiting_issue_detail', cart: { items: [], issue_category: 'outro' } });
    assert(r?.[0]?.json?.issue?.description === null, 'description deve ser null');
  });

  await test('não resolveu: passa para atendente', async () => {
    const r = await exec({ texto: 'issue_atendente', state: 'awaiting_issue_followup' });
    assertState(r, 'human_handoff');
    assert(r?.[0]?.json?.request_human_handoff === true, 'deve pedir atendente');
  });

  await test('sair: despedida com nome e restaurante, sem falar de carrinho vazio', async () => {
    const r = await exec({ texto: 'sair', state: 'start' });
    assertState(r, 'start');
    assertResponseContains(r, '👋 *Até logo, Anderson!*');
    assertResponseContains(r, 'Obrigado por falar com o *Sakura*');
    assertResponseContains(r, 'é só mandar um *oi*');
    const body = JSON.stringify(r);
    assert(!body.includes('Descartei o carrinho'), 'carrinho vazio não deve aparecer');
  });

  await test('cancelar com carrinho cheio avisa que descartou e não fez pedido', async () => {
    const r = await exec({ texto: 'cancelar', state: 'ordering', cart: { items: [{ id: 1, name: 'Temaki Salmão', qty: 3, price: 25, menuIdx: 1 }] } });
    assertResponseContains(r, 'Descartei o carrinho (3 itens). Nenhum pedido novo foi feito.');
    assert((r?.[0]?.json?.cart?.items || []).length === 0, 'carrinho deve ficar vazio');
  });

  await test('sair com pedido em andamento lembra que ele continua', async () => {
    const r = await exec({ texto: 'sair', state: 'start', recent_orders: ACTIVE_ON_TIME });
    assertResponseContains(r, 'Seu pedido *#PED-1* continua normalmente');
  });

  await test('alterar ou cancelar chama a equipe', async () => {
    const r = await exec({ texto: 'ajuda_alterar', state: 'awaiting_help_option', recent_orders: ACTIVE_ON_TIME, cart: { items: [], issue_order_code: 'PED-1' } });
    assertState(r, 'human_handoff');
    assertResponseContains(r, 'alterar ou cancelar o pedido *#PED-1*');
  });

  // ── ATENDENTE (painel) ─────────────────────────────────────────────────────
  console.log('\n👤 Atendimento humano segue o painel');

  await test('atendente assumiu no painel: bot fica calado', async () => {
    const r = await exec({ texto: '1', state: 'start', conversation: { mode: 'human', human_requested: false } });
    assert((r?.[0]?.json?.respostas || []).length === 0, 'não deve responder');
    assertState(r, 'human_handoff');
  });

  await test('pediu atendente e ninguém assumiu: avisa que a equipe foi chamada', async () => {
    const r = await exec({ texto: 'oi?', state: 'human_handoff', conversation: { mode: 'bot', human_requested: true } });
    assertResponseContains(r, 'falando com a nossa equipe');
  });

  await test('atendente liberou: bot volta a atender na hora', async () => {
    const r = await exec({ texto: '1', state: 'human_handoff', conversation: { mode: 'bot', human_requested: false } });
    assert(r?.[0]?.json?.state !== 'human_handoff', 'estado: ' + r?.[0]?.json?.state);
    assertResponseType(r, 'list');
  });

  // ── Confirmação parcial e observação por item ──────────────────────────────
  console.log('\n── Confirmação parcial e observação');

  const partial = { order_code: 'PED-1', unavailable: ['Temaki Atum'], new_total: 28.9 };

  await test('confirmação parcial: SIM segue sem os itens', async () => {
    const r = await exec({ texto: 'Sim', state: 'start', partial_confirmation: partial });
    const json = r?.[0]?.json;
    assert(json.save_partial_answer === true, 'deve gravar a resposta');
    assert(json.partial_answer.accept === true, 'aceitou');
    assertResponseContains(r, 'seguimos com o pedido PED-1');
  });

  await test('confirmação parcial: NÃO cancela (antes do "cancelar" global)', async () => {
    const r = await exec({ texto: 'cancelar', state: 'start', partial_confirmation: partial });
    const json = r?.[0]?.json;
    assert(json.partial_answer.accept === false, 'recusou');
    assertResponseContains(r, 'cancelamos o pedido');
  });

  await test('sem pergunta pendente, "sim" segue o fluxo normal', async () => {
    const r = await exec({ texto: 'sim', state: 'start' });
    assert(r?.[0]?.json?.save_partial_answer === false, 'não grava resposta');
  });

  const cartForNote = {
    items: [{ id: 1, name: 'Temaki Salmão', qty: 1, price: 23.9 }], order_type: '', address: '', complement: '',
    delivery_fee: 0, payment_method: '', change_for: null, split_count: 0, split_current: 0, split_payments: [],
    mixed_method: '', mixed_label: '', mixed_amount: 0, address_street_temp: null, browse_category: 'Temaki',
    browse_page: 0, pending_item_id: null, pending_item_name: '', last_item_id: 1,
  };

  await test('observação: botão pede o texto para o último item', async () => {
    const r = await exec({ texto: '__item_note__', state: 'awaiting_more', cart: cartForNote });
    assertState(r, 'awaiting_item_note');
    assertResponseContains(r, 'Alguma observação para o Temaki Salmão');
  });

  await test('observação: guarda o texto como o cliente escreveu', async () => {
    const r = await exec({ texto: 'Sem Cebolinha', state: 'awaiting_item_note', cart: JSON.parse(JSON.stringify(cartForNote)) });
    assertState(r, 'awaiting_more');
    const item = r?.[0]?.json?.cart?.items?.[0];
    assert(item.note === 'Sem Cebolinha', 'nota: ' + item.note);
  });


  // ── PEDIDO POR TEXTO LIVRE, ÁUDIO E PDF DO CARDÁPIO ───────────────────────
  console.log('\n✍️  Pedido escrito, por áudio e cardápio em PDF');

  const baseCart = (extra) => ({
    items: [], order_type: '', address: '', complement: '', delivery_fee: 0, payment_method: '', change_for: null,
    split_count: 0, split_current: 0, split_payments: [], mixed_method: '', mixed_label: '', mixed_amount: 0,
    address_street_temp: null, browse_category: '', browse_page: 0, pending_item_id: null, pending_item_name: '',
    ...extra,
  });
  const cartOf = (r) => r?.[0]?.json?.cart || {};
  const draftOf = (r) => cartOf(r).text_order || null;

  // ── Entrada estranha do cliente: quantidade e valores ──
  for (const typed of ['-2', '5abc', '2.5', '100', '', 'null', '1e3', 'qty:-5', 'qty:500', 'qty:abc']) {
    await test(`quantidade inválida "${typed}" não entra no carrinho`, async () => {
      const r = await exec({ texto: typed, state: 'awaiting_qty', pending_item_id: 1, pending_item_name: 'Temaki Salmão' });
      assertState(r, 'awaiting_qty');
      assert((cartOf(r).items || []).length === 0, 'carrinho: ' + JSON.stringify(cartOf(r).items));
    });
  }

  await test('quantidade somada passa de 99: fica em 99 e o cliente é avisado', async () => {
    const r = await exec({ texto: '20', state: 'awaiting_qty',
      cart: baseCart({ items: [{ id: 1, name: 'Temaki Salmão', qty: 90, price: 23.9, menuIdx: 1 }], pending_item_id: 1, pending_item_name: 'Temaki Salmão' }) });
    assert(cartOf(r).items[0].qty === 99, 'qtd: ' + cartOf(r).items[0].qty);
    assertResponseContains(r, 'O limite é *99 unidades*');
  });

  const changeCart = () => baseCart({ items: [{ id: 1, name: 'Temaki Salmão', qty: 2, price: 25, menuIdx: 1 }], payment_method: 'dinheiro', order_type: 'retirada' });
  for (const typed of ['abc', '-50', '0', 'Infinity', 'NaN', '100abc', '50.000,00', '1,234']) {
    await test(`troco inválido "${typed}" pede de novo`, async () => {
      const r = await exec({ texto: typed, state: 'awaiting_change', cart: changeCart() });
      assertState(r, 'awaiting_change');
    });
  }
  for (const [typed, expected] of [['R$ 100', 100], ['100,50', 100.5], ['1.000', 1000], ['troco 50', 100]]) {
    await test(`troco "${typed}" vira ${expected}`, async () => {
      const r = await exec({ texto: typed, state: 'awaiting_change', cart: changeCart() });
      assertResponseContains(r, 'R$ ' + expected.toFixed(2).replace('.', ','));
      assert(r?.[0]?.json?.save_order === true, 'pedido não foi fechado');
    });
  }

  for (const typed of ['0', '-10', 'abc', 'Infinity']) {
    await test(`parte do misto inválida "${typed}" pede de novo`, async () => {
      const r = await exec({ texto: typed, state: 'awaiting_mixed_amount',
        cart: baseCart({ items: [{ id: 1, name: 'Temaki Salmão', qty: 2, price: 25, menuIdx: 1 }], mixed_method: 'cartao', mixed_label: 'cartão' }) });
      assertState(r, 'awaiting_mixed_amount');
    });
  }

  for (const typed of ['1', '0', '-3', '31', '3abc']) {
    await test(`divisão em "${typed}" pessoas é recusada`, async () => {
      const r = await exec({ texto: typed, state: 'awaiting_split_count',
        cart: baseCart({ items: [{ id: 1, name: 'Temaki Salmão', qty: 2, price: 25, menuIdx: 1 }] }) });
      assertState(r, 'awaiting_split_count');
    });
  }

  await test('"Fazer pedido" abre com a dica de escrever ou mandar áudio antes das categorias', async () => {
    const r = await exec({ texto: '2', state: 'start' });
    const body = JSON.stringify(r);
    const hint = body.indexOf('Já sabe o que quer? É só escrever');
    const audio = body.indexOf('mande um *áudio*');
    const pick = body.indexOf('Prefere ver as opções? Escolha uma categoria');
    assert(hint > -1 && audio > hint && pick > audio, 'ordem da mensagem: ' + body.slice(0, 600));
  });

  await test('texto livre: "2 temaki salmão e 1 sashimi" anota os dois e pede confirmação', async () => {
    const r = await exec({ texto: '2 temaki salmão e 1 sashimi' });
    assertState(r, 'awaiting_text_order_confirm');
    const items = draftOf(r).items;
    assert(items.length === 2, 'itens: ' + JSON.stringify(items));
    assert(items[0].id === 1 && items[0].qty === 2, 'temaki: ' + JSON.stringify(items[0]));
    assert(items[1].id === 10 && items[1].qty === 1, 'sashimi: ' + JSON.stringify(items[1]));
    assert(cartOf(r).items.length === 0, 'carrinho só muda depois de confirmar');
    assertResponseContains(r, 'Anotei assim');
    assertResponseContains(r, 'Confirmar');
  });

  await test('texto livre: aceita "quero", plural, número por extenso e erro de digitação', async () => {
    const r = await exec({ texto: 'quero dois sashimis, 1 hot rol salmao e temakis de atum' });
    assertState(r, 'awaiting_text_order_confirm');
    const byId = Object.fromEntries(draftOf(r).items.map((item) => [item.id, item.qty]));
    assert(byId[10] === 2 && byId[5] === 1 && byId[2] === 1, 'itens: ' + JSON.stringify(byId));
  });

  await test('texto livre: nome ambíguo vira lista com as opções e a quantidade', async () => {
    const r = await exec({ texto: 'quero 2 hot roll' });
    assertState(r, 'awaiting_text_order_choice');
    assertResponseContains(r, 'Hot Roll Salmão');
    assertResponseContains(r, 'Hot Roll Atum');
    assertResponseContains(r, 'Nenhum desses');
    const pending = draftOf(r).pending;
    assert(pending.length === 1 && pending[0].qty === 2 && pending[0].option_ids.length === 3, JSON.stringify(pending));
  });

  const choiceCart = () => baseCart({ text_order: { items: [], pending: [{ query: '2 hot roll', qty: 2, option_ids: ['5', '6', '7'] }], unrecognized: [] } });

  await test('texto livre: tocar na opção da lista resolve e vai para a confirmação', async () => {
    const r = await exec({ texto: 'pick:6', state: 'awaiting_text_order_choice', cart: choiceCart() });
    assertState(r, 'awaiting_text_order_confirm');
    const item = draftOf(r).items[0];
    assert(item.id === 6 && item.qty === 2, JSON.stringify(item));
  });

  await test('texto livre: escrever a opção ("o de atum") também resolve', async () => {
    const r = await exec({ texto: 'o de atum', state: 'awaiting_text_order_choice', cart: choiceCart() });
    assert(draftOf(r).items[0].id === 7, JSON.stringify(draftOf(r)));
  });

  await test('texto livre: "nenhum desses" sem outro item avisa e oferece o cardápio', async () => {
    const r = await exec({ texto: 'pick:none', state: 'awaiting_text_order_choice', cart: choiceCart() });
    assertState(r, 'start');
    assertResponseContains(r, 'Não encontrei');
    assertResponseContains(r, 'Ver cardápio');
  });

  await test('texto livre: item com tamanhos pergunta o tamanho e "grande" escolhe', async () => {
    const first = await exec({ texto: '1 temaki hot' });
    assertState(first, 'awaiting_text_order_choice');
    assertResponseContains(first, 'Qual tamanho');
    const second = await exec({ texto: 'grande', state: 'awaiting_text_order_choice', cart: cartOf(first) });
    assert(draftOf(second).items[0].id === 9, JSON.stringify(draftOf(second)));
  });

  await test('texto livre: "temaki" lista cada item uma vez e o de tamanhos pergunta o tamanho depois', async () => {
    const first = await exec({ texto: '2 temaki' });
    assertState(first, 'awaiting_text_order_choice');
    const rows = first[0].json.respostas[0].sections[0].rows.map((row) => row.id);
    assert(rows.includes('pick:group:temaki-hot') && !rows.includes('pick:8') && rows.includes('pick:1'), JSON.stringify(rows));
    const sizes = await exec({ texto: 'pick:group:temaki-hot', state: 'awaiting_text_order_choice', cart: cartOf(first) });
    assertState(sizes, 'awaiting_text_order_choice');
    assertResponseContains(sizes, 'Qual tamanho');
    const done = await exec({ texto: 'pick:8', state: 'awaiting_text_order_choice', cart: cartOf(sizes) });
    const item = draftOf(done).items[0];
    assert(item.id === 8 && item.qty === 2, JSON.stringify(item));
  });

  await test('texto livre: escrever o item de tamanhos na lista também pergunta o tamanho', async () => {
    const first = await exec({ texto: 'temaki' });
    const sizes = await exec({ texto: 'o hot', state: 'awaiting_text_order_choice', cart: cartOf(first) });
    assertResponseContains(sizes, 'Qual tamanho');
  });

  await test('texto livre: tamanho escrito junto já resolve ("temaki hot grande")', async () => {
    const r = await exec({ texto: 'temaki hot grande' });
    assertState(r, 'awaiting_text_order_confirm');
    assert(draftOf(r).items[0].id === 9, JSON.stringify(draftOf(r)));
  });

  const confirmCart = (extra) => baseCart({
    text_order: { items: [{ id: 10, name: 'Sashimi', qty: 2, price: 60, menuIdx: 10 }], pending: [], unrecognized: [] },
    ...extra,
  });

  await test('texto livre: confirmar põe os itens no carrinho e segue para mais/finalizar', async () => {
    const r = await exec({ texto: 'text:ok', state: 'awaiting_text_order_confirm', cart: confirmCart() });
    assertState(r, 'awaiting_more');
    const cart = cartOf(r);
    assert(cart.items.length === 1 && cart.items[0].qty === 2, JSON.stringify(cart.items));
    assert(!cart.text_order, 'rascunho deve sumir');
    assertResponseContains(r, 'Finalizar');
  });

  await test('texto livre: soma ao que já estava no carrinho', async () => {
    const r = await exec({ texto: 'sim', state: 'awaiting_text_order_confirm', cart: confirmCart({ items: [{ id: 10, name: 'Sashimi', qty: 1, price: 60 }] }) });
    assert(cartOf(r).items[0].qty === 3, JSON.stringify(cartOf(r).items));
  });

  await test('texto livre: "finalizar" na confirmação já fecha o pedido', async () => {
    const r = await exec({ texto: 'finalizar', state: 'awaiting_text_order_confirm', cart: confirmCart() });
    assertState(r, 'confirming');
    assertResponseContains(r, 'Sashimi');
  });

  await test('texto livre: corrigir descarta o rascunho', async () => {
    const r = await exec({ texto: 'text:redo', state: 'awaiting_text_order_confirm', cart: confirmCart() });
    assertState(r, 'start');
    assert(!draftOf(r) && cartOf(r).items.length === 0, JSON.stringify(cartOf(r)));
  });

  await test('texto livre: escrever mais itens na confirmação soma ao rascunho', async () => {
    const r = await exec({ texto: '1 temaki atum', state: 'awaiting_text_order_confirm', cart: confirmCart() });
    assertState(r, 'awaiting_text_order_confirm');
    assert(draftOf(r).items.length === 2, JSON.stringify(draftOf(r)));
  });

  await test('texto livre: item que não existe aparece como não encontrado', async () => {
    const r = await exec({ texto: '1 sashimi e 2 pizza de calabresa' });
    assertState(r, 'awaiting_text_order_confirm');
    assertResponseContains(r, 'Não encontrei no cardápio');
    assertResponseContains(r, 'pizza de calabresa');
  });

  await test('texto livre: frase sem item do cardápio segue o fluxo de antes', async () => {
    const r = await exec({ texto: 'quero fazer um pedido' });
    assertState(r, 'ordering_cat');
  });

  await test('texto livre: na lista de itens, número continua escolhendo o item', async () => {
    const r = await exec({ texto: '1', state: 'ordering_items', browse_category: 'Temaki' });
    assertState(r, 'awaiting_qty');
  });

  await test('texto livre: no Evolution as opções saem numeradas e o número escolhe', async () => {
    const first = await exec({ texto: '2 hot roll', provider: 'evolution' });
    const body = first[0].json.respostas.find((message) => typeof message === 'string' && message.includes('*1.*'));
    assert(body, 'lista numerada: ' + JSON.stringify(first[0].json.respostas));
    const second = await exec({ texto: '3', state: 'awaiting_text_order_choice', cart: cartOf(first), provider: 'evolution' });
    assert(draftOf(second).items[0].id === 7, JSON.stringify(draftOf(second)));
  });

  await test('áudio: resposta abre com o que foi entendido', async () => {
    const r = await exec({ texto: '2 sashimi', from_audio: true });
    assertState(r, 'awaiting_text_order_confirm');
    const first = r[0].json.respostas[0];
    assert(typeof first === 'string' && first.includes('Ouvi') && first.includes('2 sashimi'), JSON.stringify(first));
  });

  await test('áudio: sem transcrição pede para repetir ou escrever', async () => {
    const r = await exec({ texto: '__audio_unclear__', from_audio: true, state: 'ordering_cat' });
    assertState(r, 'ordering_cat');
    assertResponseContains(r, 'Não consegui entender o áudio');
    assert(!JSON.stringify(r[0].json.respostas).includes('Ouvi'), 'não ecoa áudio vazio');
  });

  const pdfEstablishment = { menu_pdf_url: 'https://api.exemplo.com/public/menu/abc/cardapio.pdf?v=1' };

  await test('PDF: lista de categorias ganha "Ver cardápio completo"', async () => {
    const r = await exec({ texto: '2', establishment: pdfEstablishment });
    assertState(r, 'ordering_cat');
    assertResponseContains(r, 'Ver cardápio completo');
  });

  await test('PDF: tocar na opção manda o documento e ensina a pedir escrevendo ou por áudio', async () => {
    const r = await exec({ texto: 'menu:pdf', state: 'ordering_cat', establishment: pdfEstablishment });
    assertResponseType(r, 'document');
    const document = r[0].json.respostas.find((message) => message?.type === 'document');
    assert(document.link === pdfEstablishment.menu_pdf_url && document.filename.endsWith('.pdf'), JSON.stringify(document));
    assertResponseContains(r, 'áudio');
    assertState(r, 'start');
  });

  await test('PDF: pedir por escrito ("manda o cardápio completo") também manda', async () => {
    const r = await exec({ texto: 'manda o cardápio completo', establishment: pdfEstablishment });
    assertResponseType(r, 'document');
  });

  await test('PDF: sem a URL do PDF a opção leva às categorias', async () => {
    const withoutPdf = await exec({ texto: '2' });
    assert(!JSON.stringify(withoutPdf[0].json.respostas).includes('Ver cardápio completo'), 'sem PDF não oferece');
    const r = await exec({ texto: 'menu:pdf' });
    assertState(r, 'ordering_cat');
  });

  // ── RESULTADO ─────────────────────────────────────────────────────────────
  console.log(`\n${'─'.repeat(50)}`);
  const total = passed + failed;
  if (failed === 0) {
    console.log(`✅ ${passed}/${total} testes passaram`);
  } else {
    console.log(`❌ ${failed}/${total} testes falharam, ${passed} passaram`);
    process.exit(1);
  }
}

runTests().catch(e => { console.error(e); process.exit(1); });
