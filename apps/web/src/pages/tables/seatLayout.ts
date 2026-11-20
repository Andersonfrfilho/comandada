/**
 * Desenho da mesa com as cadeiras em volta: a mesa tem tantas cadeiras quanto a capacidade, e as
 * cadeiras ocupadas são as pessoas das comandas abertas. Só geometria (sem React) para dar teste.
 */

export type SeatState = 'occupied' | 'free' | 'unknown'

export interface Seat {
  /** Centro da cadeira no viewBox. */
  x: number
  y: number
  /** Giro da cadeira em graus: 0 = encosto para cima (cadeira em cima da mesa). */
  rotation: number
  state: SeatState
}

export interface TableShape {
  kind: 'round' | 'rect'
  /** Centro da mesa. */
  cx: number
  cy: number
  /** Mesa redonda: raio. Retangular: largura e altura. */
  radius: number
  width: number
  height: number
}

export interface TableDrawing {
  viewBoxWidth: number
  viewBoxHeight: number
  table: TableShape
  seats: Seat[]
  /** Cadeiras que ficaram fora do desenho (mesa muito grande); o rótulo mostra a capacidade real. */
  hiddenSeats: number
}

/** Até 6 lugares a mesa é redonda; acima, retangular com cadeiras nos lados e nas cabeceiras. */
export const ROUND_TABLE_MAX_SEATS = 6
/** Mesa de 50 lugares não cabe no card: desenha até 20 cadeiras. */
export const MAX_DRAWN_SEATS = 20

export const CHAIR_WIDTH = 16
export const CHAIR_DEPTH = 10
const CHAIR_GAP = 3
const CHAIR_PITCH = 20
const MARGIN = 3
const ROUND_RADIUS = 25
const RECT_HEIGHT = 38
const RECT_MIN_WIDTH = 54

interface SeatPosition {
  x: number
  y: number
  rotation: number
}

/**
 * Quantas pessoas ocupam a mesa: soma das comandas abertas que informaram. Mesa com comanda e
 * sem nenhuma contagem devolve null (ocupada, número não informado).
 */
export function guestsAtTable(comandas: ReadonlyArray<{ guestsCount?: number | null }>): number | null {
  const informed = comandas.filter((comanda) => typeof comanda.guestsCount === 'number')
  if (informed.length === 0) return null
  return informed.reduce((sum, comanda) => sum + (comanda.guestsCount ?? 0), 0)
}

function roundPositions(count: number): { positions: SeatPosition[]; table: TableShape; size: number } {
  const distance = ROUND_RADIUS + CHAIR_GAP + CHAIR_DEPTH / 2
  const size = 2 * (distance + CHAIR_WIDTH / 2 + MARGIN)
  const center = size / 2
  // Duas cadeiras ficam frente a frente nas laterais; o resto começa em cima e gira no relógio.
  const startDegrees = count === 2 ? 0 : -90
  const positions = Array.from({ length: count }, (_, index) => {
    const degrees = startDegrees + (360 / count) * index
    const radians = (degrees * Math.PI) / 180
    return {
      x: center + distance * Math.cos(radians),
      y: center + distance * Math.sin(radians),
      rotation: degrees - 90 + 180,
    }
  })
  return {
    positions,
    size,
    table: { kind: 'round', cx: center, cy: center, radius: ROUND_RADIUS, width: ROUND_RADIUS * 2, height: ROUND_RADIUS * 2 },
  }
}

function rectPositions(count: number): { positions: SeatPosition[]; table: TableShape; width: number; height: number } {
  // Cabeceiras só a partir de 8 lugares; 7 fica com uma na cabeceira da direita.
  const heads = count >= 8 ? 2 : count % 2
  const sides = count - heads
  const topCount = Math.ceil(sides / 2)
  const bottomCount = sides - topCount
  const tableWidth = Math.max(RECT_MIN_WIDTH, topCount * CHAIR_PITCH + 8)
  const outer = CHAIR_GAP + CHAIR_DEPTH + MARGIN
  const width = tableWidth + 2 * outer
  const height = RECT_HEIGHT + 2 * outer
  const left = outer
  const top = outer
  const centerX = left + tableWidth / 2
  const centerY = top + RECT_HEIGHT / 2

  function row(rowCount: number): number[] {
    const span = (rowCount - 1) * CHAIR_PITCH
    return Array.from({ length: rowCount }, (_, index) => centerX - span / 2 + index * CHAIR_PITCH)
  }

  const topRow = row(topCount).map((x) => ({ x, y: top - CHAIR_GAP - CHAIR_DEPTH / 2, rotation: 0 }))
  const bottomRow = row(bottomCount).map((x) => ({ x, y: top + RECT_HEIGHT + CHAIR_GAP + CHAIR_DEPTH / 2, rotation: 180 }))
  const headOffset = CHAIR_GAP + CHAIR_DEPTH / 2
  const headSeats: SeatPosition[] = []
  if (heads >= 1) headSeats.push({ x: left + tableWidth + headOffset, y: centerY, rotation: 90 })
  if (heads >= 2) headSeats.push({ x: left - headOffset, y: centerY, rotation: 270 })

  // Ordem de ocupação: as pessoas se sentam frente a frente (cima, baixo, cima...) e por último nas cabeceiras.
  const positions: SeatPosition[] = []
  for (let index = 0; index < topCount; index++) {
    positions.push(topRow[index]!)
    if (bottomRow[index]) positions.push(bottomRow[index]!)
  }
  positions.push(...headSeats)

  return {
    positions,
    width,
    height,
    table: { kind: 'rect', cx: centerX, cy: centerY, radius: 6, width: tableWidth, height: RECT_HEIGHT },
  }
}

/**
 * Monta o desenho: `capacity` cadeiras, as `guests` primeiras ocupadas. `guests` null com a mesa
 * ocupada pinta tudo como "ocupada sem contagem"; null com a mesa livre deixa tudo livre.
 */
export function drawTable(capacity: number, guests: number | null, occupied: boolean): TableDrawing {
  const total = Math.max(1, Math.floor(capacity))
  const drawn = Math.min(total, MAX_DRAWN_SEATS)
  const layout = drawn <= ROUND_TABLE_MAX_SEATS ? roundPositions(drawn) : rectPositions(drawn)
  const viewBoxWidth = 'size' in layout ? layout.size : layout.width
  const viewBoxHeight = 'size' in layout ? layout.size : layout.height

  const seats = layout.positions.map((position, index): Seat => {
    let state: SeatState = 'free'
    if (guests !== null) state = index < guests ? 'occupied' : 'free'
    else if (occupied) state = 'unknown'
    return { ...position, state }
  })

  return { viewBoxWidth, viewBoxHeight, table: layout.table, seats, hiddenSeats: total - drawn }
}

/** "3 de 4 lugares", "4 lugares", "6 pessoas · 4 lugares" (mesa apertada). */
export function seatsLabel(capacity: number, guests: number | null): string {
  const places = `${capacity} lugar${capacity === 1 ? '' : 'es'}`
  if (guests === null) return places
  if (guests > capacity) return `${guests} pessoas · ${places}`
  return `${guests} de ${places}`
}
