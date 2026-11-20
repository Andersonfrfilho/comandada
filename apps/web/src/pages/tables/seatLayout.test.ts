import { describe, expect, it } from 'bun:test'
import { drawTable, guestsAtTable, MAX_DRAWN_SEATS, seatsLabel } from './seatLayout'

describe('drawTable', () => {
  it('desenha uma cadeira por lugar e acende as pessoas da comanda', () => {
    const drawing = drawTable(4, 3, true)
    expect(drawing.table.kind).toBe('round')
    expect(drawing.seats).toHaveLength(4)
    expect(drawing.seats.map((seat) => seat.state)).toEqual(['occupied', 'occupied', 'occupied', 'free'])
  })

  it('mesa ocupada sem contagem fica com as cadeiras "ocupada sem número"', () => {
    expect(drawTable(2, null, true).seats.every((seat) => seat.state === 'unknown')).toBe(true)
    expect(drawTable(2, null, false).seats.every((seat) => seat.state === 'free')).toBe(true)
  })

  it('acima de 6 lugares vira mesa retangular com cabeceiras', () => {
    const drawing = drawTable(8, 2, true)
    expect(drawing.table.kind).toBe('rect')
    expect(drawing.seats).toHaveLength(8)
    expect(drawing.seats.filter((seat) => seat.rotation === 90 || seat.rotation === 270)).toHaveLength(2)
    // Duas pessoas sentam frente a frente: uma em cima, uma embaixo.
    expect(drawing.seats.slice(0, 2).map((seat) => seat.rotation)).toEqual([0, 180])
  })

  it('cadeiras ficam dentro do desenho', () => {
    for (const capacity of [1, 2, 3, 4, 5, 6, 7, 8, 12, 20]) {
      const drawing = drawTable(capacity, null, false)
      for (const seat of drawing.seats) {
        expect(seat.x).toBeGreaterThan(0)
        expect(seat.y).toBeGreaterThan(0)
        expect(seat.x).toBeLessThan(drawing.viewBoxWidth)
        expect(seat.y).toBeLessThan(drawing.viewBoxHeight)
      }
    }
  })

  it('mesa enorme desenha no máximo 20 cadeiras e conta o resto', () => {
    const drawing = drawTable(50, 50, true)
    expect(drawing.seats).toHaveLength(MAX_DRAWN_SEATS)
    expect(drawing.hiddenSeats).toBe(30)
  })
})

describe('guestsAtTable', () => {
  it('soma as comandas que informaram', () => {
    expect(guestsAtTable([{ guestsCount: 2 }, { guestsCount: null }, { guestsCount: 1 }])).toBe(3)
  })
  it('nenhuma informou devolve null', () => {
    expect(guestsAtTable([{ guestsCount: null }, {}])).toBeNull()
    expect(guestsAtTable([])).toBeNull()
  })
})

describe('seatsLabel', () => {
  it('fala lugares e pessoas', () => {
    expect(seatsLabel(4, null)).toBe('4 lugares')
    expect(seatsLabel(1, null)).toBe('1 lugar')
    expect(seatsLabel(4, 3)).toBe('3 de 4 lugares')
    expect(seatsLabel(4, 6)).toBe('6 pessoas · 4 lugares')
  })
})
