import { describe, expect, test } from 'bun:test'
import {
  filterSelectOptions,
  nextEnabledIndex,
  popoverPlacement,
  selectTriggerLabel,
  typeaheadIndex,
} from './selectLogic'

const OPTIONS = [
  { value: 'mesa', label: 'Mesa' },
  { value: 'entrega', label: 'Entrega' },
  { value: 'retirada', label: 'Retirada', disabled: true },
  { value: 'balcao', label: 'Balcão' },
]

describe('selectTriggerLabel', () => {
  test('sem escolha mostra o placeholder', () => {
    expect(selectTriggerLabel(OPTIONS, [], 'Todos')).toEqual({ text: 'Todos', isPlaceholder: true })
  })
  test('até dois nomes juntos, mais vira "+N"', () => {
    expect(selectTriggerLabel(OPTIONS, ['mesa', 'entrega'], '').text).toBe('Mesa, Entrega')
    expect(selectTriggerLabel(OPTIONS, ['mesa', 'entrega', 'balcao'], '').text).toBe('Mesa +2')
  })
  test('valor vazio é uma opção de verdade quando existe', () => {
    expect(selectTriggerLabel([{ value: '', label: 'Todos' }], [''], 'x')).toEqual({ text: 'Todos', isPlaceholder: false })
  })
})

describe('busca e teclado', () => {
  test('busca ignora acento e caixa', () => {
    expect(filterSelectOptions(OPTIONS, 'BALCAO').map((option) => option.value)).toEqual(['balcao'])
  })
  test('setas pulam opção desabilitada e param nas pontas', () => {
    expect(nextEnabledIndex(OPTIONS, 1, 1)).toBe(3)
    expect(nextEnabledIndex(OPTIONS, 3, 1)).toBe(3)
    expect(nextEnabledIndex(OPTIONS, 3, -1)).toBe(1)
  })
  test('digitar vai para a próxima opção com aquele começo', () => {
    expect(typeaheadIndex(OPTIONS, 'b', 0)).toBe(3)
    expect(typeaheadIndex(OPTIONS, 'r', 0)).toBe(0)
  })
})

describe('popoverPlacement', () => {
  const viewport = { width: 1280, height: 800 }
  test('abre embaixo com a largura do botão', () => {
    const placement = popoverPlacement({ top: 100, bottom: 140, left: 50, width: 260 }, viewport)
    expect(placement).toMatchObject({ top: 146, left: 50, width: 260, openUpward: false })
  })
  test('perto do rodapé abre para cima', () => {
    const placement = popoverPlacement({ top: 700, bottom: 740, left: 50, width: 260 }, viewport)
    expect(placement.openUpward).toBe(true)
    expect(placement.top).toBe(694)
  })
  test('botão estreito ganha largura mínima sem sair da tela', () => {
    const placement = popoverPlacement({ top: 100, bottom: 140, left: 1200, width: 70 }, viewport)
    expect(placement.width).toBe(200)
    expect(placement.left + placement.width).toBeLessThanOrEqual(1272)
  })
})
