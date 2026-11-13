#!/usr/bin/env node
// Tests for order parsing, deduplication, cart merge and summary logic.
// Run: node tests/ordering.test.js

// ── Logic extracted from rotear node (keep in sync) ─────────────────────────

function parseOrderInput(texto, products) {
  const lines = texto.split(/[\n,+]/).map(l => l.trim()).filter(Boolean);
  const newItems = [];
  const unrecognized = [];

  for (const line of lines) {
    const mNum = line.match(/^(\d+)\s*[xX×]\s*(\d+)$/);
    if (mNum) {
      const idx = parseInt(mNum[1]) - 1;
      const qty = parseInt(mNum[2]);
      if (qty < 1) { unrecognized.push(line); continue; }
      if (idx >= 0 && idx < products.length) {
        const p = products[idx];
        newItems.push({ id: p.id, name: p.name, qty, price: Number(p.price), menuIdx: idx + 1 });
      } else { unrecognized.push(line); }
      continue;
    }
    const mName = line.match(/^(.+?)\s*[xX×]\s*(\d+)$/);
    if (mName) {
      const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
      const search = norm(mName[1].trim());
      const qty = parseInt(mName[2]);
      const p = products.find(p => norm(p.name).includes(search));
      if (p && qty >= 1) { newItems.push({ id: p.id, name: p.name, qty, price: Number(p.price), menuIdx: products.indexOf(p) + 1 }); }
      else { unrecognized.push(line); }
      continue;
    }
    const numOnly = line.match(/^(\d+)$/);
    if (numOnly) {
      const num = parseInt(numOnly[1]);
      if (num >= 1 && num <= products.length) {
        const p = products[num - 1];
        newItems.push({ id: p.id, name: p.name, qty: 1, price: Number(p.price), menuIdx: num });
      } else { unrecognized.push(line); }
    } else { unrecognized.push(line); }
  }

  return { newItems, unrecognized };
}

function dedupItems(newItems) {
  const deduped = [];
  for (const item of newItems) {
    const ex = deduped.find(i => i.id === item.id);
    if (ex) { ex.qty += item.qty; } else { deduped.push({ ...item }); }
  }
  return deduped;
}

function mergeIntoCart(cartItems, dedupedItems) {
  const cart = cartItems.map(i => ({ ...i }));
  for (const item of dedupedItems) {
    const ex = cart.find(i => i.id === item.id);
    if (ex) { ex.qty += item.qty; } else { cart.push({ ...item }); }
  }
  return cart;
}

function cartSummary(items) {
  let total = 0;
  const lines = [];
  for (const item of items) {
    const sub = item.price * item.qty;
    total += sub;
    lines.push('• [' + (item.menuIdx || '') + '] ' + item.name + ' — R$ ' + item.price.toFixed(2) + ' × ' + item.qty + ' — R$ ' + sub.toFixed(2));
  }
  return { lines, total };
}

function validateName(raw) {
  const n = raw.trim();
  if (n.length < 2) return { valid: false, reason: 'short' };
  if (/\d/.test(n)) return { valid: false, reason: 'numbers' };
  if (!/^[\p{L}\s'\-]+$/u.test(n)) return { valid: false, reason: 'invalid_chars' };
  if (/^(.)\1{3,}$/u.test(n.replace(/\s/g, ''))) return { valid: false, reason: 'repeated' };
  const bad = ['merda','porra','caralho','buceta','viado','puta','fdp','cuzão','cuzao','foda','arrombado','babaca','idiota','imbecil','cretino','otario','otário','lixo','vagabundo','vagabunda','piranha','safado','safada'];
  const lower = n.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
  for (const w of bad) {
    const wn = w.normalize('NFD').replace(/[̀-ͯ]/g,'');
    if (lower === wn || lower.split(/\s+/).includes(wn)) return { valid: false, reason: 'bad_word' };
  }
  return { valid: true };
}

// ── Test runner ──────────────────────────────────────────────────────────────

const PRODUCTS = [
  { id: 1,  name: 'Combo Salmão 8 Peças',      price: 42.90 },
  { id: 2,  name: 'Combo Misto 16 Peças',       price: 79.90 },
  { id: 3,  name: 'Combo Família 30 Peças',     price: 134.90 },
  { id: 4,  name: 'Combo Vegetariano 10 Peças', price: 48.90 },
  { id: 5,  name: 'Temaki Salmão',              price: 23.90 },
  { id: 6,  name: 'Mix Especial x2',            price: 55.00 },  // nome com "x" + número interno
  { id: 7,  name: 'Hot Roll Camarão (8 un)',    price: 43.90 },
  { id: 8,  name: 'Refrigerante Lata',          price: 6.90  },
  { id: 9,  name: 'Missoshiro',                 price: 13.90 },
  { id: 10, name: 'Mochi de Morango',           price: 14.90 },
];

let passed = 0, failed = 0;

function test(name, fn) {
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

function eq(a, b, msg) {
  const ja = JSON.stringify(a), jb = JSON.stringify(b);
  if (ja !== jb) throw new Error((msg || '') + `\n     got:      ${ja}\n     expected: ${jb}`);
}

// ── Parsing: número × quantidade ────────────────────────────────────────────
console.log('\n📦 Parsing — número × quantidade');

test('2x3 → item 2, qty 3', () => {
  const { newItems, unrecognized } = parseOrderInput('2x3', PRODUCTS);
  eq(newItems.length, 1);
  eq(newItems[0].id, 2);
  eq(newItems[0].qty, 3);
  eq(unrecognized.length, 0);
});

test('2 x 3 (com espaços) → item 2, qty 3', () => {
  const { newItems } = parseOrderInput('2 x 3', PRODUCTS);
  eq(newItems[0].qty, 3);
});

test('2X3 (maiúsculo) → item 2, qty 3', () => {
  const { newItems } = parseOrderInput('2X3', PRODUCTS);
  eq(newItems[0].qty, 3);
});

test('2×3 (unicode ×) → item 2, qty 3', () => {
  const { newItems } = parseOrderInput('2×3', PRODUCTS);
  eq(newItems[0].qty, 3);
});

test('menuIdx correto no resultado', () => {
  const { newItems } = parseOrderInput('3x2', PRODUCTS);
  eq(newItems[0].menuIdx, 3);
});

test('99x1 (item fora do índice) → unrecognized', () => {
  const { unrecognized } = parseOrderInput('99x1', PRODUCTS);
  eq(unrecognized, ['99x1']);
});

test('0x3 (índice zero) → unrecognized', () => {
  const { unrecognized } = parseOrderInput('0x3', PRODUCTS);
  eq(unrecognized, ['0x3']);
});

// ── Qty inválida ─────────────────────────────────────────────────────────────
console.log('\n🚫 Quantidade inválida');

test('2x0 (qty zero via número) → unrecognized', () => {
  const { newItems, unrecognized } = parseOrderInput('2x0', PRODUCTS);
  eq(newItems.length, 0);
  eq(unrecognized, ['2x0']);
});

test('2x-1 (qty negativa via número) → unrecognized', () => {
  const { newItems, unrecognized } = parseOrderInput('2x-1', PRODUCTS);
  eq(newItems.length, 0);
  eq(unrecognized, ['2x-1']);
});

test('Temaki Salmão x 0 (qty zero via nome) → unrecognized', () => {
  const { newItems, unrecognized } = parseOrderInput('Temaki Salmão x 0', PRODUCTS);
  eq(newItems.length, 0);
  eq(unrecognized.length, 1);
});

test('Temaki Salmão x -2 (qty negativa via nome) → unrecognized', () => {
  const { newItems, unrecognized } = parseOrderInput('Temaki Salmão x -2', PRODUCTS);
  eq(newItems.length, 0);
  eq(unrecognized.length, 1);
});

test('25x-4 não vira item 25 qty 1 (falso parseInt)', () => {
  const { newItems, unrecognized } = parseOrderInput('25x-4', PRODUCTS);
  eq(newItems.length, 0);
  eq(unrecognized, ['25x-4']);
});

test('5x+2 → "5x" unrecognized + "2" como ID solo (+ é separador)', () => {
  // "+" é separador, então "5x+2" vira ["5x", "2"]
  // "5x" não tem qty → unrecognized; "2" é ID solo válido → item 2, qty 1
  const { newItems, unrecognized } = parseOrderInput('5x+2', PRODUCTS);
  eq(newItems.length, 1);
  eq(newItems[0].id, 2);
  eq(unrecognized, ['5x']);
});

// ── Parsing: número solo ─────────────────────────────────────────────────────
console.log('\n🔢 Parsing — número solo');

test('3 (apenas número) → item 3, qty 1', () => {
  const { newItems } = parseOrderInput('3', PRODUCTS);
  eq(newItems[0].id, 3);
  eq(newItems[0].qty, 1);
  eq(newItems[0].menuIdx, 3);
});

test('número solo: merge com carrinho existente (qty += 1)', () => {
  const cart = [{ id: 3, name: 'Combo Família 30 Peças', qty: 2, price: 134.90, menuIdx: 3 }];
  const { newItems } = parseOrderInput('3', PRODUCTS);
  const deduped = dedupItems(newItems);
  const result = mergeIntoCart(cart, deduped);
  eq(result.find(i => i.id === 3).qty, 3);
});

test('"3abc" não é número solo → unrecognized', () => {
  const { newItems, unrecognized } = parseOrderInput('3abc', PRODUCTS);
  eq(newItems.length, 0);
  eq(unrecognized.length, 1);
});

test('"3 4" (dois números com espaço) → dois itens', () => {
  // espaço não é separador, vira uma linha → mName ou unrecognized
  // "3 4" não bate em nenhum padrão → unrecognized
  const { newItems, unrecognized } = parseOrderInput('3 4', PRODUCTS);
  eq(newItems.length, 0);
  eq(unrecognized.length, 1);
});

test('"0" → unrecognized (não é item válido)', () => {
  const { unrecognized } = parseOrderInput('0', PRODUCTS);
  eq(unrecognized.length, 1);
});

// ── Parsing: nome × quantidade ───────────────────────────────────────────────
console.log('\n🔤 Parsing — nome × quantidade');

test('Temaki Salmão x 2 → item 5, qty 2', () => {
  const { newItems } = parseOrderInput('Temaki Salmão x 2', PRODUCTS);
  eq(newItems[0].id, 5);
  eq(newItems[0].qty, 2);
});

test('temaki x 2 (minúsculo) → item 5', () => {
  const { newItems } = parseOrderInput('temaki x 2', PRODUCTS);
  eq(newItems[0].id, 5);
});

test('nome parcial (combo misto x 1) → item 2', () => {
  const { newItems } = parseOrderInput('combo misto x 1', PRODUCTS);
  eq(newItems[0].id, 2);
});

test('Mix Especial x2 (nome com "x" + número internos) x 2 → item 6', () => {
  const { newItems } = parseOrderInput('Mix Especial x2 x 2', PRODUCTS);
  eq(newItems[0].id, 6);
  eq(newItems[0].qty, 2);
});

test('nome não encontrado → unrecognized', () => {
  const { unrecognized } = parseOrderInput('Dragão x 1', PRODUCTS);
  eq(unrecognized, ['Dragão x 1']);
});

test('nome por nome com menuIdx correto', () => {
  const { newItems } = parseOrderInput('Temaki Salmão x 1', PRODUCTS);
  eq(newItems[0].menuIdx, 5);
});

test('nome sem acento encontra produto acentuado (combo salmao → Combo Salmão 8 Peças)', () => {
  const { newItems, unrecognized } = parseOrderInput('combo salmao x2', PRODUCTS);
  eq(newItems.length, 1);
  eq(newItems[0].id, 1);
  eq(newItems[0].qty, 2);
  eq(unrecognized.length, 0);
});

test('busca sem acento: temaki salmao x 1 → item 5', () => {
  const { newItems } = parseOrderInput('temaki salmao x 1', PRODUCTS);
  eq(newItems[0].id, 5);
});

// ── Parsing: múltiplos itens ─────────────────────────────────────────────────
console.log('\n➕ Parsing — múltiplos itens');

test('2x3 + 5x1 → dois itens', () => {
  const { newItems } = parseOrderInput('2x3 + 5x1', PRODUCTS);
  eq(newItems.length, 2);
  eq(newItems[0].id, 2); eq(newItems[0].qty, 3);
  eq(newItems[1].id, 5); eq(newItems[1].qty, 1);
});

test('separador vírgula: 2x3, 5x1', () => {
  const { newItems } = parseOrderInput('2x3, 5x1', PRODUCTS);
  eq(newItems.length, 2);
});

test('separador quebra de linha', () => {
  const { newItems } = parseOrderInput('2x3\n5x1', PRODUCTS);
  eq(newItems.length, 2);
});

test('mix: número e nome na mesma mensagem', () => {
  const { newItems } = parseOrderInput('2x2 + temaki x 1', PRODUCTS);
  eq(newItems.length, 2);
  eq(newItems[0].id, 2);
  eq(newItems[1].id, 5);
});

test('separadores duplicados "2x3 ++ 5x1" → 2 itens (linha vazia filtrada)', () => {
  const { newItems } = parseOrderInput('2x3 ++ 5x1', PRODUCTS);
  eq(newItems.length, 2);
});

test('mix de válidos e inválidos: "2x3 + 99x1 + 5x0 + 1" → 1 item + 3 unrecognized', () => {
  const { newItems, unrecognized } = parseOrderInput('2x3 + 99x1 + 5x0 + 1', PRODUCTS);
  eq(newItems.length, 2); // 2x3 e "1" (número solo)
  eq(unrecognized.length, 2); // 99x1 e 5x0
});

// ── Deduplicação ─────────────────────────────────────────────────────────────
console.log('\n🔄 Deduplicação');

test('2x3 + 2x4 → item 2, qty 7', () => {
  const { newItems } = parseOrderInput('2x3 + 2x4', PRODUCTS);
  const deduped = dedupItems(newItems);
  eq(deduped.length, 1);
  eq(deduped[0].qty, 7);
});

test('2x3 + 2x3 → item 2, qty 6', () => {
  const { newItems } = parseOrderInput('2x3 + 2x3', PRODUCTS);
  const deduped = dedupItems(newItems);
  eq(deduped.length, 1);
  eq(deduped[0].id, 2);
  eq(deduped[0].qty, 6);
});

test('dedup via solo + número×qty: "2 + 2x3" → qty 4', () => {
  const { newItems } = parseOrderInput('2 + 2x3', PRODUCTS);
  const deduped = dedupItems(newItems);
  eq(deduped.length, 1);
  eq(deduped[0].qty, 4);
});

test('2x2 + 3x1 + 2x1 → item 2 qty 3, item 3 qty 1', () => {
  const { newItems } = parseOrderInput('2x2 + 3x1 + 2x1', PRODUCTS);
  const deduped = dedupItems(newItems);
  eq(deduped.length, 2);
  eq(deduped.find(i => i.id === 2).qty, 3);
  eq(deduped.find(i => i.id === 3).qty, 1);
});

test('1x1 + 2x1 + 1x2 → item 1 qty 3, item 2 qty 1', () => {
  const { newItems } = parseOrderInput('1x1 + 2x1 + 1x2', PRODUCTS);
  const deduped = dedupItems(newItems);
  eq(deduped.find(i => i.id === 1).qty, 3);
  eq(deduped.find(i => i.id === 2).qty, 1);
});

test('dedup não muta o array original', () => {
  const { newItems } = parseOrderInput('2x3 + 2x4', PRODUCTS);
  const originalQtys = newItems.map(i => i.qty);
  dedupItems(newItems);
  eq(newItems.map(i => i.qty), originalQtys, 'newItems foi mutado pelo dedup');
});

test('itens diferentes não são agrupados', () => {
  const { newItems } = parseOrderInput('1x1 + 2x1 + 3x1', PRODUCTS);
  const deduped = dedupItems(newItems);
  eq(deduped.length, 3);
});

test('mesmo item 3x via +: "2x1 + 2x1 + 2x1" → qty 3', () => {
  const { newItems } = parseOrderInput('2x1 + 2x1 + 2x1', PRODUCTS);
  const deduped = dedupItems(newItems);
  eq(deduped[0].qty, 3);
});

// ── Merge com carrinho ────────────────────────────────────────────────────────
console.log('\n🛒 Merge com carrinho existente');

test('item já no carrinho → soma qty', () => {
  const cart = [{ id: 2, name: 'Combo Misto', qty: 3, price: 79.90 }];
  const result = mergeIntoCart(cart, [{ id: 2, name: 'Combo Misto', qty: 2, price: 79.90 }]);
  eq(result.find(i => i.id === 2).qty, 5);
});

test('item novo → adiciona ao carrinho', () => {
  const cart = [{ id: 2, name: 'Combo Misto', qty: 3, price: 79.90 }];
  const result = mergeIntoCart(cart, [{ id: 5, name: 'Temaki Salmão', qty: 1, price: 27.90 }]);
  eq(result.length, 2);
});

test('merge não muta o carrinho original', () => {
  const cart = [{ id: 2, qty: 3, price: 79.90 }];
  mergeIntoCart(cart, [{ id: 2, qty: 2, price: 79.90 }]);
  eq(cart[0].qty, 3, 'cart original foi mutado');
});

test('carrinho vazio + itens novos', () => {
  const result = mergeIntoCart([], [{ id: 1, qty: 2, price: 42.90 }]);
  eq(result.length, 1);
  eq(result[0].qty, 2);
});

test('merge não muta dedupedItems (referência separada)', () => {
  const deduped = [{ id: 2, qty: 3, price: 79.90 }];
  mergeIntoCart([], deduped);
  eq(deduped[0].qty, 3, 'dedupedItems foi mutado pelo merge');
});

test('pipeline completo: parse + dedup + merge (2x3 + 2x4 sobre carrinho vazio → qty 7)', () => {
  const { newItems } = parseOrderInput('2x3 + 2x4', PRODUCTS);
  const deduped = dedupItems(newItems);
  const cart = mergeIntoCart([], deduped);
  eq(cart.length, 1);
  eq(cart[0].qty, 7);
});

test('pipeline: nova mensagem acumula sobre carrinho existente', () => {
  // carrinho já tem item 2 qty 7
  const prevCart = [{ id: 2, name: 'Combo Misto', qty: 7, price: 79.90, menuIdx: 2 }];
  const { newItems } = parseOrderInput('2x1 + 5x2', PRODUCTS);
  const deduped = dedupItems(newItems);
  const cart = mergeIntoCart(prevCart, deduped);
  eq(cart.find(i => i.id === 2).qty, 8);  // 7 + 1
  eq(cart.find(i => i.id === 5).qty, 2);  // novo
  eq(cart.length, 2);
});

// ── cartSummary ───────────────────────────────────────────────────────────────
console.log('\n🧾 Cart summary');

test('total calculado corretamente', () => {
  const items = [
    { id: 2, name: 'Combo Misto', qty: 2, price: 79.90, menuIdx: 2 },
    { id: 5, name: 'Temaki Salmão', qty: 1, price: 23.90, menuIdx: 5 },
  ];
  const { total } = cartSummary(items);
  eq(Math.round(total * 100), Math.round((79.90*2 + 23.90) * 100));
});

test('linha do carrinho inclui menuIdx', () => {
  const items = [{ id: 2, name: 'Combo Misto', qty: 1, price: 79.90, menuIdx: 2 }];
  const { lines } = cartSummary(items);
  if (!lines[0].includes('[2]')) throw new Error('menuIdx [2] não aparece na linha: ' + lines[0]);
});

test('carrinho vazio → total 0, sem linhas', () => {
  const { lines, total } = cartSummary([]);
  eq(lines.length, 0);
  eq(total, 0);
});

// ── Validação de nome ─────────────────────────────────────────────────────────
console.log('\n👤 Validação de nome');

test('Anderson → válido',       () => eq(validateName('Anderson').valid, true));
test('João Silva → válido',     () => eq(validateName('João Silva').valid, true));
test('Ana → válido',            () => eq(validateName('Ana').valid, true));
test('a → inválido (curto)',    () => eq(validateName('a').reason, 'short'));
test('abc123 → inválido (números)', () => eq(validateName('abc123').reason, 'numbers'));
test('aaaa → inválido (repetido)', () => eq(validateName('aaaa').reason, 'repeated'));
test('merda → inválido (palavrão)', () => eq(validateName('merda').reason, 'bad_word'));
test('MERDA → inválido (palavrão maiúsculo)', () => eq(validateName('MERDA').reason, 'bad_word'));
test('porra → inválido (palavrão)', () => eq(validateName('porra').reason, 'bad_word'));
test('fdp → inválido (palavrão)', () => eq(validateName('fdp').reason, 'bad_word'));
test('João#Silva → inválido (char especial)', () => eq(validateName('João#Silva').reason, 'invalid_chars'));

// ── Casos de quebra de fluxo ──────────────────────────────────────────────────
console.log('\n⚠️  Casos de quebra de fluxo');

test('input vazio → sem itens, sem unrecognized', () => {
  const { newItems, unrecognized } = parseOrderInput('', PRODUCTS);
  eq(newItems.length, 0);
  eq(unrecognized.length, 0);
});

test('só espaços → sem itens', () => {
  const { newItems } = parseOrderInput('   ', PRODUCTS);
  eq(newItems.length, 0);
});

test('qty muito grande (2x999) → aceita', () => {
  const { newItems } = parseOrderInput('2x999', PRODUCTS);
  eq(newItems[0].qty, 999);
});

test('item + lixo: "2x3 + lixo" → 1 item + 1 unrecognized', () => {
  const { newItems, unrecognized } = parseOrderInput('2x3 + lixo', PRODUCTS);
  eq(newItems.length, 1);
  eq(unrecognized.length, 1);
});

test('"texto aleatório" → unrecognized', () => {
  const { newItems, unrecognized } = parseOrderInput('oi tudo bem', PRODUCTS);
  eq(newItems.length, 0);
  eq(unrecognized.length, 1);
});

test('"finalizar" como texto → unrecognized (não vira item)', () => {
  const { newItems } = parseOrderInput('finalizar', PRODUCTS);
  eq(newItems.length, 0);
});

test('número fora do catálogo solo "99" → unrecognized', () => {
  const { unrecognized } = parseOrderInput('99', PRODUCTS);
  eq(unrecognized.length, 1);
});

test('preço como texto "R$ 50" → unrecognized', () => {
  const { unrecognized } = parseOrderInput('R$ 50', PRODUCTS);
  eq(unrecognized.length, 1);
});

test('emoji sozinho → unrecognized', () => {
  const { newItems, unrecognized } = parseOrderInput('🍣', PRODUCTS);
  eq(newItems.length, 0);
  eq(unrecognized.length, 1);
});

test('pedido com todos itens válidos não gera unrecognized', () => {
  const { unrecognized } = parseOrderInput('1x2 + 3x1 + 5x3', PRODUCTS);
  eq(unrecognized.length, 0);
});

test('produto com "8 un" no nome não bate em busca pelo número "8"', () => {
  // "8" solo deve ir para o produto no índice 8, não para "Hot Roll Camarão (8 un)"
  const { newItems } = parseOrderInput('8', PRODUCTS);
  eq(newItems[0].id, 8);        // produto no índice 8 = Refrigerante Lata
  eq(newItems[0].name, 'Refrigerante Lata');
});

test('produto com "8 un" não é retornado por busca "8 un"', () => {
  // "8 un x 1" → mName busca "8 un" no nome; "Hot Roll Camarão (8 un)" contém → item 7
  const { newItems } = parseOrderInput('8 un x 1', PRODUCTS);
  eq(newItems[0].id, 7);
});

// ── Repeat order (menuIdx) ────────────────────────────────────────────────────
console.log('\n🔄 Repeat order — menuIdx');

test('repeat order: item tem menuIdx correto', () => {
  const products = PRODUCTS;
  const lastOrderItems = [{ id: 5, name: 'Temaki Salmão', qty: 2, price: 23.90 }];
  const items = lastOrderItems.map(item => {
    const p = products.find(p => p.id === item.id);
    return p ? { id: p.id, name: p.name, qty: item.qty, price: Number(p.price), menuIdx: products.indexOf(p) + 1 } : null;
  }).filter(Boolean);
  eq(items[0].menuIdx, 5);
});

test('repeat order: cartSummary mostra [N] para itens repetidos', () => {
  const products = PRODUCTS;
  const lastOrderItems = [{ id: 2, name: 'Combo Misto', qty: 1, price: 79.90 }];
  const items = lastOrderItems.map(item => {
    const p = products.find(p => p.id === item.id);
    return p ? { id: p.id, name: p.name, qty: item.qty, price: Number(p.price), menuIdx: products.indexOf(p) + 1 } : null;
  }).filter(Boolean);
  const { lines } = cartSummary(items);
  if (!lines[0].includes('[2]')) throw new Error('menuIdx [2] ausente em repeat order: ' + lines[0]);
});

// ── Split payment ─────────────────────────────────────────────────────────────
console.log('\n💳 Divisão de conta (split)');

function parseTrocoInput(texto, amountToPay) {
  const t = texto.trim().toLowerCase().replace(',', '.');
  const m = t.match(/^([\d.]+)\s*(?:de\s*)?troco$/) || t.match(/^troco\s*(?:de\s*)?([\d.]+)$/);
  if (m) {
    const troco = parseFloat(m[1]);
    return isNaN(troco) ? null : amountToPay + troco;
  }
  const val = parseFloat(t);
  return isNaN(val) ? null : val;
}

function calcPerPerson(items, deliveryFee, n) {
  const { total } = cartSummary(items);
  return (total + deliveryFee) / n;
}

test('split 2 pessoas: perPerson = total / 2', () => {
  const items = [{ id: 1, name: 'X', qty: 2, price: 100.00, menuIdx: 1 }];
  const per = calcPerPerson(items, 0, 2);
  eq(per, 100.00);
});

test('split 3 pessoas com taxa entrega', () => {
  const items = [{ id: 1, name: 'X', qty: 1, price: 90.00, menuIdx: 1 }];
  const per = calcPerPerson(items, 12.00, 3);
  eq(per.toFixed(2), '34.00');
});

test('split com delivery_fee 0: total correto', () => {
  const items = [
    { id: 1, name: 'A', qty: 2, price: 50.00, menuIdx: 1 },
    { id: 2, name: 'B', qty: 1, price: 30.00, menuIdx: 2 },
  ];
  const per = calcPerPerson(items, 0, 2);
  eq(per, 65.00);
});

test('parseTrocoInput: número simples → valor da nota', () => {
  eq(parseTrocoInput('500', 403.35), 500);
});

test('parseTrocoInput: "34,50 troco" → amountToPay + 34.50', () => {
  const result = parseTrocoInput('34,50 troco', 403.35);
  eq(result.toFixed(2), '437.85');
});

test('parseTrocoInput: "34,50 de troco" → amountToPay + 34.50', () => {
  const result = parseTrocoInput('34,50 de troco', 403.35);
  eq(result.toFixed(2), '437.85');
});

test('parseTrocoInput: "troco de 50" → amountToPay + 50', () => {
  const result = parseTrocoInput('troco de 50', 200.00);
  eq(result, 250.00);
});

test('parseTrocoInput: texto inválido → null', () => {
  eq(parseTrocoInput('abc', 100), null);
});

test('parseTrocoInput: nota menor que total → valor retornado (validação é no handler)', () => {
  eq(parseTrocoInput('50', 403.35), 50);
});

// ── Resultado ─────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(45)}`);
const total = passed + failed;
console.log(`Resultado: ${passed}/${total} passou${failed > 0 ? ` | ${failed} falhou` : ''}`);
if (failed > 0) process.exit(1);
