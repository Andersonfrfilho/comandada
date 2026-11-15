/**
 * Fora da janela de 24 h o WhatsApp só aceita template aprovado. Avisos de pedido (status, pagamento)
 * levam junto o texto curto do template: se a mensagem normal for recusada pela janela, sai o template.
 * Os parâmetros não podem ter quebra de linha (regra da Meta).
 */
export type OutsideWindowTemplate = {
  readonly parameters: readonly string[]
  /** Qual template usar; sem ele vai o de atualização de pedido. */
  readonly template?: WhatsAppTemplateSetting | undefined
}

/** Nome e idioma do template vêm das Configurações do restaurante, com um padrão quando não há. */
export type WhatsAppTemplateSetting = {
  readonly defaultName: string
  readonly defaultLanguage: string
  readonly nameSettingKey: string
  readonly languageSettingKey: string
}
