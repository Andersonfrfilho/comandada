/**
 * O simulador forja mensagem inbound no transcript de um cliente. Em produção isso é dado sujo, não
 * ferramenta — daí o flag ser exigido, e não inferido do ambiente.
 *
 * `import.meta.env.DEV` junto do flag: `VITE_*` é público por definição (o Vite inlina o literal no
 * bundle), então o flag sozinho ligaria o botão para qualquer um que buildasse com ele. O poder de
 * verdade está do lado do servidor, em `CONVERSATION_PREVIEW_ENABLED` — aqui só se decide desenhar.
 */
export const IS_CONVERSATION_PREVIEW_ENABLED: boolean = Boolean(
  import.meta.env.DEV && import.meta.env['VITE_CONVERSATION_PREVIEW_ENABLED'] === 'true'
)
