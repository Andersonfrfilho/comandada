#!/usr/bin/env node
// Transpila src/*.ts (script mode) e injeta o JS compilado no workflow JSON
'use strict';

const fs   = require('fs');
const path = require('path');
const ts   = require('typescript');

const ROOT = path.join(__dirname, '..');
const SRC  = path.join(ROOT, 'src');

// Ordem de concatenação — types/constants primeiro (globais), depois handlers e runtime
const MODULE_ORDER = [
  'shared/types/N8nGlobals.ts',
  'shared/types/Cart.ts',
  'shared/types/Session.ts',
  'shared/types/Message.ts',
  'shared/types/Order.ts',
  'shared/types/FuncaoTypes.ts',
  'shared/types/Domain.ts',
  'shared/constants/StateConstants.ts',
  'shared/constants/CartConstants.ts',
  'shared/constants/MessagesConstants.ts',
  'shared/constants/IssueConstants.ts',
  // provider contracts (interfaces)
  'shared/providers/contracts/HttpClientProvider.ts',
  'shared/providers/contracts/CepProvider.ts',
  'shared/providers/contracts/GeocodingProvider.ts',
  'shared/providers/contracts/RoutingProvider.ts',
  // provider implementations
  'shared/providers/N8nHttpClientProviderImplementation.ts',
  'shared/providers/ViaCepProviderImplementation.ts',
  'shared/providers/NominatimProviderImplementation.ts',
  'shared/providers/OsrmProviderImplementation.ts',
  'handlers/BaseHandler.ts',
  'setup.ts',
  'handlers/HandoffHandler.ts',
  'handlers/PartialConfirmationHandler.ts',
  'handlers/GlobalHandler.ts',
  'handlers/GreetingHandler.ts',
  'handlers/IssueHandler.ts',
  'handlers/CartHandler.ts',
  'handlers/SchedulingHandler.ts',
  'handlers/DeliveryHandler.ts',
  'handlers/PaymentHandler.ts',
  'handlers/MenuShortcutsHandler.ts',
  'handlers/ReservationHandler.ts',
  'handlers/MiscHandler.ts',
  'handlers/OrderingHandler.ts',
  'handlers/FallbackHandler.ts',
  'router.ts',
  'teardown.ts',
];

const WORKFLOW_FILES = {
  '01-receber-mensagem.json': 'Rotear e Responder',
};

const TRANSPILE_OPTIONS = {
  compilerOptions: {
    target: ts.ScriptTarget.ES2020,
    module: ts.ModuleKind.None,
    strict: false,      // type-checking is separate (tsc --noEmit)
    removeComments: false,
  },
};

function transpileFile(filePath) {
  const source = fs.readFileSync(filePath, 'utf8');
  const result = ts.transpileModule(source, {
    ...TRANSPILE_OPTIONS,
    fileName: filePath,
  });
  if (result.diagnostics && result.diagnostics.length > 0) {
    result.diagnostics.forEach(diag => {
      const msg = ts.flattenDiagnosticMessageText(diag.messageText, '\n');
      console.warn('⚠ TS(' + diag.code + '): ' + msg + ' [' + path.basename(filePath) + ']');
    });
  }
  return result.outputText;
}

function build() {
  const parts = MODULE_ORDER.map(rel => {
    const filePath = path.join(SRC, rel);
    if (!fs.existsSync(filePath)) throw new Error('Módulo não encontrado: ' + filePath);
    return transpileFile(filePath);
  });

  const code = parts.join('\n\n');
  const lineCount = code.split('\n').length;
  console.log('✅ Build: ' + lineCount + ' linhas de ' + MODULE_ORDER.length + ' módulos TypeScript');

  const wfDir = path.join(ROOT, 'n8n', 'workflows');
  for (const [file, nodeName] of Object.entries(WORKFLOW_FILES)) {
    const wfPath = path.join(wfDir, file);
    if (!fs.existsSync(wfPath)) { console.warn('⚠ Workflow não encontrado: ' + file); continue; }
    const workflow = JSON.parse(fs.readFileSync(wfPath, 'utf8'));
    let injected = false;
    for (const node of workflow.nodes) {
      if (node.name === nodeName && node.type === 'n8n-nodes-base.code') {
        node.parameters.jsCode = code;
        injected = true;
        break;
      }
    }
    if (!injected) { console.warn('⚠ Nó não encontrado em ' + file + ': ' + nodeName); continue; }
    fs.writeFileSync(wfPath, JSON.stringify(workflow, null, 2));
    console.log('✅ Injetado em: ' + file + ' → nó "' + nodeName + '"');
  }
}

build();
