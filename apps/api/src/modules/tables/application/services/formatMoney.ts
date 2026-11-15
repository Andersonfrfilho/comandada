const MONEY = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

export function formatMoney(value: number): string {
  return MONEY.format(value).replace(/ /g, ' ')
}
