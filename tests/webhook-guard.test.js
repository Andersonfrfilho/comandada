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

async function run({ body, headers, raw, staticData, env = { WHATSAPP_APP_SECRET: SECRET }, httpRequest = async () => ({}) }) {
  const item = { json: { body, headers } };
  const wrapped = `(async function(helpers) { const self = { helpers }; return (async function() { ${CODE} }).call(self); })`;
  const fn = vm.runInNewContext(wrapped, {
    $input: { first: () => item },
    $json: item.json,
    $env: env,
    $getWorkflowStaticData: () => staticData,
    require, Buffer, console: { log: () => {} }, JSON, Date, Object, String, encodeURIComponent,
  });
  return fn({ getBinaryDataBuffer: async () => Buffer.from(raw), httpRequest });
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

  const audioBody = (id) => ({
    entry: [{ changes: [{ value: {
      metadata: { display_phone_number: '5516999990000' },
      contacts: [{ profile: { name: 'Ana' } }],
      messages: [{ id, from: '5516988887777', type: 'audio', audio: { id: 'media-123', mime_type: 'audio/ogg; codecs=opus' } }],
    } }] }],
  });

  await test('áudio: a API transcreve e o texto segue como mensagem digitada', async () => {
    const calls = [];
    const httpRequest = async (options) => { calls.push(options); return { text: '2 Combo Tradicional e 1 hot roll' }; };
    const out = await run({ body: audioBody('wamid.6'), raw: '', headers: {}, staticData: {}, env: { ORDER_HUB_API_URL: 'http://api:3333/' }, httpRequest });
    assert(out.length === 1, 'deveria passar');
    const json = out[0].json;
    assert(json.from_audio === true && json.texto === '2 combo tradicional e 1 hot roll' && json.texto_original === '2 Combo Tradicional e 1 hot roll', JSON.stringify(json));
    assert(calls[0].url === 'http://api:3333/internal/bot/5516988887777/transcriptions', calls[0].url);
    assert(calls[0].body.mediaId === 'media-123' && calls[0].body.instance === '5516999990000', JSON.stringify(calls[0].body));
  });

  await test('áudio: transcrição falhou vira __audio_unclear__ (o bot pede para repetir)', async () => {
    const httpRequest = async () => { throw new Error('503'); };
    const out = await run({ body: audioBody('wamid.7'), raw: '', headers: {}, staticData: {}, env: {}, httpRequest });
    assert(out.length === 1 && out[0].json.texto === '__audio_unclear__' && out[0].json.from_audio === true, JSON.stringify(out));
  });

  if (failed > 0) { console.log(`❌ ${failed} falharam`); process.exit(1); }
  console.log('✅ webhook-guard ok');
})();
