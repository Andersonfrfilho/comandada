import { describe, expect, it } from 'bun:test'

import {
  formatBrl,
  formatDistance,
  formatDuration,
  formatPhoneBr,
  googleMapsDirectionsUrl,
  googleMapsEmbedUrl,
  googleMapsSearchUrl,
  splitLocationNote,
  totalAfterShortage,
} from './orderDetailFormat'

describe('formatBrl', () => {
  it('formata no padrão brasileiro', () => {
    expect(formatBrl('135.00')).toBe('R$ 135,00')
    expect(formatBrl(1234.5)).toBe('R$ 1.234,50')
  })

  it('valor inválido vira zero', () => {
    expect(formatBrl(null)).toBe('R$ 0,00')
  })
})

describe('formatPhoneBr', () => {
  it('celular com DDI', () => {
    expect(formatPhoneBr('5516993056772')).toBe('(16) 99305-6772')
  })

  it('fixo sem DDI', () => {
    expect(formatPhoneBr('1637221234')).toBe('(16) 3722-1234')
  })

  it('número estrangeiro volta como veio', () => {
    expect(formatPhoneBr('+1 555 0100')).toBe('+1 555 0100')
  })
})

describe('splitLocationNote', () => {
  const link = 'https://maps.google.com/?q=Rua%20Radialista%20Alfeu%20Stabelini%2C%206531'

  it('tira a linha de localização e devolve o link', () => {
    expect(splitLocationNote(`Localização: ${link}`)).toEqual({ notes: null, mapsLink: link })
  })

  it('mantém o resto da observação', () => {
    expect(splitLocationNote(`Sem cebola\nLocalização: ${link}`)).toEqual({ notes: 'Sem cebola', mapsLink: link })
  })

  it('observação comum fica igual', () => {
    expect(splitLocationNote('Interfone quebrado')).toEqual({ notes: 'Interfone quebrado', mapsLink: null })
  })
})

describe('links do Google Maps', () => {
  const address = 'Rua Radialista Alfeu Stabelini, 6531, Franca, SP'

  it('busca pelo endereço quando não há coordenada', () => {
    expect(googleMapsSearchUrl(address)).toBe(
      'https://www.google.com/maps/search/?api=1&query=Rua%20Radialista%20Alfeu%20Stabelini%2C%206531%2C%20Franca%2C%20SP'
    )
  })

  it('embed usa o ponto exato quando existe', () => {
    expect(googleMapsEmbedUrl(address, { lat: -20.56, lng: -47.41 })).toBe(
      'https://maps.google.com/maps?q=-20.56%2C-47.41&z=15&output=embed'
    )
  })

  it('rota parte do restaurante', () => {
    const url = new URL(googleMapsDirectionsUrl(address, { lat: -20.56, lng: -47.41 }, { lat: -20.53, lng: -47.4 }))
    expect(url.searchParams.get('origin')).toBe('-20.53,-47.4')
    expect(url.searchParams.get('destination')).toBe('-20.56,-47.41')
    expect(url.searchParams.get('travelmode')).toBe('driving')
  })

  it('rota sem origem deixa o Maps usar a posição do aparelho', () => {
    const url = new URL(googleMapsDirectionsUrl(address))
    expect(url.searchParams.has('origin')).toBe(false)
    expect(url.searchParams.get('destination')).toBe(address)
  })
})

describe('formatDistance', () => {
  it('km com vírgula', () => {
    expect(formatDistance(4.25)).toBe('4,3 km')
    expect(formatDistance('3.10')).toBe('3,1 km')
  })

  it('abaixo de 1 km em metros', () => {
    expect(formatDistance(0.846)).toBe('850 m')
  })

  it('sem valor', () => {
    expect(formatDistance(null)).toBeNull()
  })
})

describe('formatDuration', () => {
  it('minutos e horas', () => {
    expect(formatDuration(9)).toBe('9 min')
    expect(formatDuration(75)).toBe('1 h 15 min')
    expect(formatDuration(120)).toBe('2 h')
    expect(formatDuration(null)).toBeNull()
  })
})

describe('totalAfterShortage', () => {
  const items = [
    { id: 'a', quantity: 1, totalPrice: '60.00' },
    { id: 'b', quantity: 2, totalPrice: '75.00' },
  ]

  it('tira o item em falta sem troca', () => {
    expect(totalAfterShortage(items, '0', new Map([['a', null]]))).toBe(75)
  })

  it('soma o substituto pela quantidade', () => {
    expect(totalAfterShortage(items, '5.00', new Map([['b', { unitPrice: 30 }]]))).toBe(125)
  })

  it('sem falta, total dos itens mais taxa', () => {
    expect(totalAfterShortage(items, 7, new Map())).toBe(142)
  })
})
