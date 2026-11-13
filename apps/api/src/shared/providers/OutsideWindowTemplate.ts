/**
 * Fora da janela de 24 h o WhatsApp só aceita template aprovado. Avisos de pedido (status, pagamento)
 * levam junto o texto curto do template: se a mensagem normal for recusada pela janela, sai o template.
 * Os parâmetros não podem ter quebra de linha (regra da Meta).
 */
export type OutsideWindowTemplate = {
  readonly parameters: readonly string[]
}
