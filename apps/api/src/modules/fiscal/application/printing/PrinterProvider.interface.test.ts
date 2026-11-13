import { describe, expect, it } from 'bun:test'

import { buildFiscalCupomText, type FiscalCupomData } from './PrinterProvider.interface'

const CUPOM: FiscalCupomData = {
  razaoSocial: 'Yuyaki Sushi Bar',
  cnpj: '00.000.000/0001-00',
  numeroDocumento: 12,
  serie: '1',
  chaveAcesso: null,
  qrCodeUrl: null,
  items: [{ descricao: 'Temaki Hot (Grande)', quantidade: 2, valorUnitario: 49, valorTotal: 98 }],
  total: 98,
}

describe('buildFiscalCupomText', () => {
  it('prints each split leg and the change for cash', () => {
    const text = buildFiscalCupomText({
      ...CUPOM,
      pagamentos: [
        { forma: 'PIX', valor: 49, trocoPara: null, rotulo: 'Pessoa 1' },
        { forma: 'Dinheiro', valor: 49, trocoPara: 100, rotulo: 'Pessoa 2' },
      ],
    })

    expect(text).toContain('PIX (Pessoa 1): R$ 49.00')
    expect(text).toContain('Dinheiro (Pessoa 2): R$ 49.00')
    expect(text).toContain('Paga com R$ 100.00  Troco R$ 51.00')
  })

  it('omits the payment block when there is no payment', () => {
    expect(buildFiscalCupomText(CUPOM)).not.toContain('FORMA DE PAGAMENTO')
  })
})
