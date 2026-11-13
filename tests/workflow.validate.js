#!/usr/bin/env node
// Validates the n8n workflow JSON for structural and logic correctness.
// Run: node tests/workflow.validate.js

const fs = require('fs');
const path = require('path');

const WF_PATH = path.join(__dirname, '../n8n/workflows/01-receber-mensagem.json');

let passed = 0, failed = 0;

function check(name, fn) {
  try {
    fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (e) {
    console.log(`  ❌ ${name}`);
    console.log(`     ${e.message}`);
    failed++;
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

// ── Load workflow ────────────────────────────────────────────────────────────
let wf;
try {
  wf = JSON.parse(fs.readFileSync(WF_PATH, 'utf8'));
} catch (e) {
  console.error('Erro ao ler workflow:', e.message);
  process.exit(1);
}

const nodes = wf.nodes || [];
const conns = wf.connections || {};
const nodeById  = Object.fromEntries(nodes.map(n => [n.id, n]));
const nodeByName = Object.fromEntries(nodes.map(n => [n.name, n]));

const rotear = nodes.find(n => n.id === 'rotear');
assert(rotear, 'nó rotear não encontrado no workflow');
const code = rotear.parameters.jsCode;

// ── 1. Nós obrigatórios presentes ────────────────────────────────────────────
console.log('\n🔧 Nós obrigatórios');

const REQUIRED_NODES = [
  'webhook', 'extrair', 'hora_atual', 'buscar_dados', 'rotear',
  'enviar', 'salvar_sessao', 'gravar_pedido_reserva', 'filtrar_nome', 'atualizar_nome',
  'filtrar_cozinha', 'notificar_cozinha', 'filtrar_marketing', 'salvar_marketing',
  'filtrar_handoff_humano', 'solicitar_atendimento_humano', 'notificar_agente',
];

for (const id of REQUIRED_NODES) {
  check(`nó "${id}" presente`, () => assert(nodeById[id], `nó "${id}" não encontrado`));
}

// ── 2. Fan-out do rotear ─────────────────────────────────────────────────────
console.log('\n🔀 Conexões fan-out do Rotear e Responder');

// Pedido e reserva são gravados ANTES de responder: Rotear → Gravar → Salvar Sessão → Enviar Resposta.
// A cozinha só é avisada depois da gravação.
const DIRECT_FANOUT = [
  'Gravar Pedido e Reserva', 'Filtrar Nome', 'Filtrar Marketing',
];

const rotearConns = (conns['Rotear e Responder'] || {}).main || [];
const connectedNames = (rotearConns[0] || []).map(c => c.node);

for (const target of DIRECT_FANOUT) {
  check(`fan-out → "${target}"`, () =>
    assert(connectedNames.includes(target), `"${target}" não está na saída main[0] do Rotear`));
}

check('Gravar Pedido e Reserva → Salvar Sessão e Filtrar Cozinha', () => {
  const afterSave = (((conns['Gravar Pedido e Reserva'] || {}).main || [[]])[0] || []).map(c => c.node);
  assert(afterSave.includes('Salvar Sessão') && afterSave.includes('Filtrar Cozinha'),
    '"Gravar Pedido e Reserva" deve alimentar "Salvar Sessão" e "Filtrar Cozinha"');
});

check('Salvar Sessão → Enviar Resposta (envio encadeado)', () => {
  const afterSalvar = ((conns['Salvar Sessão'] || {}).main || [[]])[0] || [];
  assert(afterSalvar.some(c => c.node === 'Enviar Resposta'),
    '"Enviar Resposta" não está conectado à saída de "Salvar Sessão"');
});

// ── 3. Máquina de estados ────────────────────────────────────────────────────
console.log('\n🗺️  Máquina de estados');

const handled = new Set([...code.matchAll(/currentState === '([^']+)'/g)].map(m => m[1]));
const setTo   = new Set([...code.matchAll(/newState = '([^']+)'/g)].map(m => m[1]));
const NOT_NEED_HANDLER = new Set(['ordering', 'human_handoff']); // estados set mas gerenciados implicitamente

check('nenhum dead-end de estado', () => {
  const dead = [...setTo].filter(s => !handled.has(s) && !NOT_NEED_HANDLER.has(s));
  assert(dead.length === 0, `Dead-ends: ${dead.join(', ')}`);
});

check('awaiting_marketing_opt_in handler presente', () =>
  assert(code.includes("currentState === 'awaiting_marketing_opt_in'"), 'handler não encontrado'));

check('awaiting_mixed_change handler presente', () =>
  assert(code.includes("currentState === 'awaiting_mixed_change'"), 'handler não encontrado'));

check('awaiting_complement handler presente', () =>
  assert(code.includes("currentState === 'awaiting_complement'"), 'handler não encontrado'));

check('awaiting_order_detail handler presente', () =>
  assert(code.includes("currentState === 'awaiting_order_detail'"), 'handler não encontrado'));

check('notifications_menu handler presente', () =>
  assert(code.includes("currentState === 'notifications_menu'"), 'handler não encontrado'));

check('recentOrders extração presente', () =>
  assert(code.includes('const recentOrders ='), 'recentOrders não extraído do $json'));

check('mainMenu inclui opção 5 e 6', () => {
  const menuFn = code.slice(code.indexOf('const mainMenu'), code.indexOf('const mainMenu') + 300);
  assert(menuFn.includes('5️⃣') && menuFn.includes('6️⃣'), 'mainMenu não tem opções 5 e 6');
});

// ── 4. Campos dos return statements ─────────────────────────────────────────
console.log('\n↩️  Return statements');

// Campos que TODOS os returns devem ter (chave obrigatória, valor pode variar)
const REQUIRED_KEYS = [
  'tel', 'instancia', 'respostas',
  'save_order', 'save_reservation',
  'save_customer_name', 'customer_name_to_save',
  'save_marketing_opt_in', 'marketing_opt_in_value',
  'kitchen_phone', 'request_human_handoff',
];
// Campos que aceitam dois nomes (estado fechado usa current*, demais usam new*)
const STATE_VARIANTS  = ['state: newState',  'state: currentState'];
const CART_VARIANTS   = ['cart: newCart',     'cart: currentCart'];
// Campos onde o valor pode ser null em returns antecipados (só a chave importa)
const KEY_ONLY = ['order:', 'reservation:'];

const returnMatches = [...code.matchAll(/return \[\{ json: \{.+?\}\s*\}\];/gs)].map(m => m[0]);

check(`${returnMatches.length} return statement(s) encontrado(s) (esperado ≥ 3)`, () =>
  assert(returnMatches.length >= 3, `apenas ${returnMatches.length} return(s)`));

for (const field of REQUIRED_KEYS) {
  check(`chave "${field}" em todos os returns`, () => {
    const missing = returnMatches.filter(r => !r.includes(field));
    assert(missing.length === 0, `${missing.length} return(s) sem "${field}"`);
  });
}

check('campo state em todos os returns (newState ou currentState)', () => {
  const missing = returnMatches.filter(r => !STATE_VARIANTS.some(v => r.includes(v)));
  assert(missing.length === 0, `${missing.length} return(s) sem campo state`);
});

check('campo cart em todos os returns (newCart ou currentCart)', () => {
  const missing = returnMatches.filter(r => !CART_VARIANTS.some(v => r.includes(v)));
  assert(missing.length === 0, `${missing.length} return(s) sem campo cart`);
});

for (const key of KEY_ONLY) {
  check(`chave "${key.replace(':', '')}" presente em todos os returns`, () => {
    const missing = returnMatches.filter(r => !r.includes(key));
    assert(missing.length === 0, `${missing.length} return(s) sem chave "${key}"`);
  });
}

// ── 5. Padrões de código legado / bugs conhecidos ────────────────────────────
console.log('\n🐛 Padrões de código proibidos (regressões)');

check('sem parseInt(line) sem regex guard (bug 25x-4)', () => {
  // Permite parseInt dentro de match groups, não como fallback direto de "line"
  const bad = /const num = parseInt\(line\)/.test(code);
  assert(!bad, 'encontrado "const num = parseInt(line)" — usar /^(\\d+)$/ em vez disso');
});

check('qty < 1 presente no bloco mNum', () => {
  const idx = code.indexOf('const mNum = line.match');
  const block = code.slice(idx, idx + 300);
  assert(block.includes('qty < 1'), 'filtro qty < 1 ausente no bloco mNum');
});

check('qty >= 1 presente no bloco mName', () => {
  const idx = code.indexOf('const mName = line.match');
  const block = code.slice(idx, idx + 400);
  assert(block.includes('qty >= 1'), 'filtro qty >= 1 ausente no bloco mName');
});

check('dedupedItems usado (não newItems direto no display)', () => {
  assert(code.includes('dedupedItems.map'), 'display usa newItems em vez de dedupedItems');
});

check('dedup usa spread { ...item } (sem mutação por referência)', () => {
  const dedupIdx = code.indexOf('Desduplicar');
  const block = code.slice(dedupIdx, dedupIdx + 300);
  assert(block.includes('{ ...item }'), 'dedup não usa spread — risco de mutação por referência');
});

check('sem cart reset legado (forma curta sem split_payments)', () => {
  const legacy = "change_for: null, split_count: 0, mixed_method: '', mixed_label: '', mixed_amount: 0 }";
  assert(!code.includes(legacy), 'cart reset legado encontrado — faltam split_payments e address_street_temp');
});

check('session TTL presente (sessionExpired)', () =>
  assert(code.includes('sessionExpired'), 'lógica de TTL de sessão ausente'));

check('generateOrderCode presente', () =>
  assert(code.includes('generateOrderCode'), 'helper generateOrderCode ausente'));

check('maybeAskOptIn presente', () =>
  assert(code.includes('maybeAskOptIn'), 'helper maybeAskOptIn ausente'));

check('min_order_value check presente no finalizar', () => {
  const idx = code.indexOf("texto === 'finalizar'");
  const block = code.slice(idx, idx + 500);
  assert(block.includes('min_order_value'), 'check de valor mínimo ausente no finalizar');
});

check('finalizar: sem duplo else (bug sintático)', () => {
  const idx = code.indexOf("texto === 'finalizar'");
  const block = code.slice(idx, idx + 600);
  assert(!block.includes('    } else {\n    else {'), 'bug duplo else presente no finalizar');
});

check('finalizar: cartSummary chamado dentro do else (não antes)', () => {
  const idx = code.indexOf("texto === 'finalizar'");
  const block = code.slice(idx, idx + 600);
  const emptyFirst = block.indexOf('items.length === 0');
  const csFirst = block.indexOf('cartSummary(newCart.items)');
  assert(emptyFirst < csFirst, 'cartSummary chamado antes da checagem de carrinho vazio');
});

check('newReservationTemp declarado antes de isOpen (sem TDZ)', () => {
  const declPos = code.indexOf('let newReservationTemp');
  const isOpenPos = code.indexOf('const isOpen =');
  assert(declPos < isOpenPos, 'newReservationTemp declarado depois de isOpen — TDZ quando fechado');
});

check('validateName é function declaration (não const arrow — evita TDZ)', () =>
  assert(code.includes('function validateName('), 'validateName como const arrow function causa TDZ — usar function declaration'));

check('capitalizeName é function declaration (não const arrow — evita TDZ)', () =>
  assert(code.includes('function capitalizeName('), 'capitalizeName como const arrow function causa TDZ — usar function declaration'));

check('repeat_order items incluem menuIdx', () => {
  const idx = code.indexOf("texto === 'sim' && currentState === 'repeat_order'");
  const block = code.slice(idx, idx + 500);
  assert(block.includes('menuIdx'), 'menuIdx ausente nos itens do repeat_order');
});

check("meu pedido não capturado pelo includes('pedido') do ordering", () => {
  const orderIdx = code.indexOf("texto === '2'");
  const block = code.slice(orderIdx, orderIdx + 120);
  const hasPlainPedido = /texto\.includes\('pedido'\)(?!\s*&&\s*texto\s*!==)/.test(block);
  assert(!hasPlainPedido, "ordering trigger tem includes('pedido') sem guard — captura 'meu pedido'");
});

// ── 6. Human handoff integration (Order Hub) ─────────────────────────────────
console.log('\n💬 Human handoff');

check('human_handoff state handler presente', () =>
  assert(code.includes("currentState === 'human_handoff'"), 'handler human_handoff não encontrado'));

check('request_human_handoff declarado (let)', () =>
  assert(code.includes('let request_human_handoff'), 'variável request_human_handoff ausente'));

check('filtrar_handoff_humano node presente', () =>
  assert(nodeById['filtrar_handoff_humano'], 'nó filtrar_handoff_humano não encontrado'));

check('solicitar_atendimento_humano node presente', () =>
  assert(nodeById['solicitar_atendimento_humano'], 'nó solicitar_atendimento_humano não encontrado'));

check('notificar_agente node presente', () =>
  assert(nodeById['notificar_agente'], 'nó notificar_agente não encontrado'));

check('Filtrar Handoff Humano no fan-out do Rotear', () => {
  const rotearConns2 = (conns['Rotear e Responder'] || {}).main || [];
  const connected = (rotearConns2[0] || []).map(c => c.node);
  assert(connected.includes('Filtrar Handoff Humano'), '"Filtrar Handoff Humano" não está no fan-out do Rotear');
});

// ── 7. buscar_dados ──────────────────────────────────────────────────────────
console.log('\n🗄️  buscar_dados');

const buscarDados = nodes.find(n => n.id === 'buscar_dados');
assert(buscarDados, 'buscar_dados não encontrado');
const query = buscarDados.parameters.query || '';

check('buscar_dados retorna marketing_opt_in', () =>
  assert(query.includes('marketing_opt_in'), 'campo marketing_opt_in ausente no buscar_dados'));

check('buscar_dados retorna last_order com code e status', () => {
  assert(query.includes("'code'") || query.includes('"code"') || query.includes("'code', o.code") || query.includes("code', o.code"),
    'campo code ausente no last_order do buscar_dados');
  assert(query.includes("'status'") || query.includes('"status"') || query.includes("status', o.status"),
    'campo status ausente no last_order do buscar_dados');
});

check('buscar_dados filtra produtos disponíveis', () =>
  assert(query.includes('available'), 'filtro available ausente no buscar_dados'));

// ── 7. salvar_pedido usa código pré-gerado ───────────────────────────────────
console.log('\n💾 salvar_pedido');

const salvarPedido = nodes.find(n => n.id === 'salvar_pedido');
assert(salvarPedido, 'salvar_pedido não encontrado');
const sq = salvarPedido.parameters.query || '';

check('salvar_pedido usa $json.code (não to_char runtime)', () => {
  assert(sq.includes('$json.code'), 'salvar_pedido ainda usa to_char() para gerar código — usar $json.code');
  assert(!sq.includes("to_char(now()"), "salvar_pedido ainda usa to_char() para gerar código");
});

check('salvar_pedido salva split_payments', () =>
  assert(sq.includes('split_payments'), 'split_payments ausente no INSERT do salvar_pedido'));

// ── Resultado ────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(45)}`);
const total = passed + failed;
console.log(`Resultado: ${passed}/${total} passou${failed > 0 ? ` | ${failed} falhou` : ''}`);
if (failed > 0) process.exit(1);
