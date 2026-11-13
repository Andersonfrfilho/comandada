// ── Retorno final ─────────────────────────────────────────────────────────────
const finalPayload: N8nResponsePayload = _earlyResponse || buildPayload();

// @ts-ignore — n8n executa jsCode dentro de uma async function; return é válido em runtime
return [{ json: finalPayload }];
