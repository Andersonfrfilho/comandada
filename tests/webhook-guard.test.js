#!/usr/bin/env node
// Nó "Extrair Mensagem": só passa POST assinado pela Meta e ignora a mesma mensagem entregue duas vezes.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const workflow = JSON.parse(fs.readFileSync(path.join(__dirname, '../n8n/workflows/01-receber-mensagem.json'), 'utf8'));
const CODE = workflow.nodes.find((node) => node.name === 'Extrair Mensagem').parameters.jsCode;
const SECRET = 'app-secret-de-teste';

const metaBody = (id) => ({
  entry: [{ changes: [{ value: {
    metadata: { display_phone_number: '5516999990000' },
    contacts: [{ profile: { name: 'Ana' } }],
    messages: [{ id, from: '5516988887777', type: 'text', text: { body: 'Oi' } }],
  } }] }],
});

function sign(raw) {
  return 'sha256=' + crypto.createHmac('sha256', SECRET).update(raw).digest('hex');
}

async function run({ body, headers, raw, staticData, env = { WHATSAPP_APP_SECRET: SECRET } }) {
  const item = { json: { body, headers } };
  const wrapped = `(async function(helpers) { const self = { helpers }; return (async function() { ${CODE} }).call(self); })`;
  const fn = vm.runInNewContext(wrapped, {
    $input: { first: () => item },
    $json: item.json,
    $env: env,
    $getWorkflowStaticData: () => staticData,
    require, Buffer, console: { log: () => {} }, JSON, Date, Object, String,
  });
  return fn({ getBinaryDataBuffer: async () => Buffer.from(raw) });
}

let failed = 0;
async function test(name, body) {
  try { await body(); console.log('  ✅ ' + name); }
  catch (error) { failed += 1; console.log('  ❌ ' + name + '\n     ' + error.message); }
}
const assert = (condition, message) => { if (!condition) throw new Error(message); };

(async () => {
  console.log('\n🔐 Webhook da Meta\n');

  await test('assinatura válida passa e mantém o texto original', async () => {
    const body = metaBody('wamid.1');
    const raw = JSON.stringify(body);
    const out = await run({ body, raw, headers: { 'x-hub-signature-256': sign(raw) }, staticData: {} });
    assert(out.length === 1 && out[0].json.texto === 'oi' && out[0].json.texto_original === 'Oi', JSON.stringify(out));
  });

  await test('assinatura errada é descartada', async () => {
    const body = metaBody('wamid.2');
    const out = await run({ body, raw: JSON.stringify(body), headers: { 'x-hub-signature-256': 'sha256=' + '0'.repeat(64) }, staticData: {} });
    assert(out.length === 0, 'deveria descartar');
  });

  await test('sem assinatura é descartada', async () => {
    const body = metaBody('wamid.3');
    const out = await run({ body, raw: JSON.stringify(body), headers: {}, staticData: {} });
    assert(out.length === 0, 'deveria descartar');
  });

  await test('mesma mensagem entregue duas vezes: a segunda é ignorada', async () => {
    const staticData = {};
    const body = metaBody('wamid.4');
    const raw = JSON.stringify(body);
    const headers = { 'x-hub-signature-256': sign(raw) };
    const first = await run({ body, raw, headers, staticData });
    const second = await run({ body, raw, headers, staticData });
    assert(first.length === 1 && second.length === 0, `primeira ${first.length}, segunda ${second.length}`);
  });

  await test('formato interno sem token é descartado quando o app secret está ligado', async () => {
    const out = await run({ body: { tel: '5516988887777', texto: 'oi' }, raw: '', headers: {}, staticData: {}, env: { WHATSAPP_APP_SECRET: SECRET, ORDER_HUB_N8N_INTERNAL_TOKEN: 'x'.repeat(32) } });
    assert(out.length === 0, 'deveria descartar');
  });

  await test('sem app secret (dev) a mensagem passa como antes', async () => {
    const body = metaBody('wamid.5');
    const out = await run({ body, raw: '', headers: {}, staticData: {}, env: {} });
    assert(out.length === 1, 'deveria passar');
  });

  if (failed > 0) { console.log(`❌ ${failed} falharam`); process.exit(1); }
  console.log('✅ webhook-guard ok');
})();
