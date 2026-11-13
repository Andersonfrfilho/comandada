/**
 * Códigos fiscais só são exigidos na emissão de NFC-e/SAT. Quem cadastra o
 * cardápio raramente sabe o que são, então a UI oferece o padrão mais comum de
 * food service em vez de deixar os campos em branco.
 */
export const FISCAL_DEFAULTS = {
  ncmCode: '21069090',
  cfopCode: '5102',
  cstIcms: '400',
} as const

export const FISCAL_FIELD_HINTS = {
  ncmCode: 'Classifica o produto na tabela da Receita. 21069090 cobre a maioria dos preparos de cozinha.',
  cfopCode: 'Tipo da operação de venda. 5102 é venda dentro do próprio estado.',
  cstIcms: 'Situação do ICMS. 400 é o código de quem está no Simples Nacional.',
} as const

export const FISCAL_SECTION_TITLE = 'Tributação fiscal'
export const FISCAL_SECTION_HELP =
  'Usado só na emissão de nota fiscal. Se você não emite nota, pode deixar em branco.'
export const FISCAL_APPLY_DEFAULTS_LABEL = 'Usar padrão de restaurante'
