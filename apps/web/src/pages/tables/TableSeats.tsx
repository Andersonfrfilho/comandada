import type { TableStatus } from '@/constants/tableLabels'
import { CHAIR_DEPTH, CHAIR_WIDTH, drawTable, seatsLabel, type SeatState } from './seatLayout'

interface TableSeatsProps {
  number: number
  capacity: number
  /** Pessoas nas comandas abertas; null = não informado. */
  guests: number | null
  status: TableStatus
  className?: string
}

const TABLE_TOP: Record<TableStatus, string> = {
  available: 'fill-white stroke-gray-300',
  occupied: 'fill-brand-50 stroke-brand-400',
  reserved: 'fill-amber-50 stroke-amber-400',
}

const CHAIR_SEAT: Record<SeatState, string> = {
  occupied: 'fill-brand-500 stroke-brand-600',
  free: 'fill-white stroke-gray-300',
  unknown: 'fill-brand-100 stroke-brand-300',
}

const CHAIR_BACK: Record<SeatState, string> = {
  occupied: 'fill-brand-700',
  free: 'fill-gray-300',
  unknown: 'fill-brand-300',
}

/**
 * A mesa vista de cima com as cadeiras em volta: uma cadeira por lugar, cheias na cor do
 * restaurante as que têm gente. Ocupada sem a contagem de pessoas, as cadeiras ficam claras.
 */
export function TableSeats({ number, capacity, guests, status, className }: TableSeatsProps) {
  const occupied = status === 'occupied'
  const drawing = drawTable(capacity, guests, occupied)
  const { table } = drawing
  const label = guests === null && occupied
    ? `Mesa ${number}, ocupada, ${seatsLabel(capacity, null)}`
    : `Mesa ${number}, ${seatsLabel(capacity, guests)}`

  return (
    <svg
      viewBox={`0 0 ${drawing.viewBoxWidth} ${drawing.viewBoxHeight}`}
      role="img"
      aria-label={label}
      className={className}
    >
      {drawing.seats.map((seat, index) => (
        <g
          key={index}
          transform={`translate(${seat.x} ${seat.y}) rotate(${seat.rotation})`}
          className="transition-colors duration-300"
        >
          <rect
            x={-CHAIR_WIDTH / 2}
            y={-CHAIR_DEPTH / 2}
            width={CHAIR_WIDTH}
            height={CHAIR_DEPTH}
            rx={3}
            strokeWidth={1.2}
            className={CHAIR_SEAT[seat.state]}
          />
          <rect
            x={-CHAIR_WIDTH / 2 + 1}
            y={-CHAIR_DEPTH / 2}
            width={CHAIR_WIDTH - 2}
            height={2.6}
            rx={1.3}
            className={CHAIR_BACK[seat.state]}
          />
        </g>
      ))}
      {table.kind === 'round' ? (
        <circle cx={table.cx} cy={table.cy} r={table.radius} strokeWidth={1.5} className={TABLE_TOP[status]} />
      ) : (
        <rect
          x={table.cx - table.width / 2}
          y={table.cy - table.height / 2}
          width={table.width}
          height={table.height}
          rx={table.radius}
          strokeWidth={1.5}
          className={TABLE_TOP[status]}
        />
      )}
      <text
        x={table.cx}
        y={drawing.hiddenSeats > 0 ? table.cy - 5 : table.cy}
        textAnchor="middle"
        dominantBaseline="central"
        className="fill-gray-900 font-bold"
        style={{ fontSize: 18 }}
      >
        {number}
      </text>
      {drawing.hiddenSeats > 0 && (
        <text
          x={table.cx}
          y={table.cy + 10}
          textAnchor="middle"
          dominantBaseline="central"
          className="fill-gray-500"
          style={{ fontSize: 7 }}
        >
          +{drawing.hiddenSeats} lugares
        </text>
      )}
    </svg>
  )
}
