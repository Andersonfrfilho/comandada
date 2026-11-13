import { useEffect, useMemo, useRef, useState } from 'react'
import { GripVertical } from 'lucide-react'
import type { TableStatus, TableWithComanda } from '@/constants/tableLabels'

interface TableFloorMapProps {
  tables: TableWithComanda[]
  statusLabels: Record<TableStatus, string>
  statusColors: Record<TableStatus, string>
  statusCard: Record<TableStatus, string>
  onSelectTable: (table: TableWithComanda) => void
  onPositionChange: (tableId: string, positionX: number, positionY: number) => void
  selectionMode: boolean
  selectedIds: Set<string>
  onToggleSelect: (tableId: string) => void
  onUngroup: (groupId: string) => void
}

const GRID_SIZE = 20
const CARD_WIDTH = 152
const CARD_HEIGHT = 128
const FALLBACK_COLS = 6
const FALLBACK_SPACING_X = 176
const FALLBACK_SPACING_Y = 152
const CANVAS_PADDING = 32

function snapToGrid(value: number): number {
  return Math.max(0, Math.round(value / GRID_SIZE) * GRID_SIZE)
}

function fallbackPosition(index: number): { x: number; y: number } {
  return {
    x: CANVAS_PADDING + (index % FALLBACK_COLS) * FALLBACK_SPACING_X,
    y: CANVAS_PADDING + Math.floor(index / FALLBACK_COLS) * FALLBACK_SPACING_Y,
  }
}

function resolvePositions(tables: TableWithComanda[]): Record<string, { x: number; y: number }> {
  let fallbackIndex = 0
  const positions: Record<string, { x: number; y: number }> = {}
  for (const table of tables) {
    if (table.positionX !== null && table.positionY !== null) {
      positions[table.id] = { x: table.positionX, y: table.positionY }
    } else {
      positions[table.id] = fallbackPosition(fallbackIndex)
      fallbackIndex += 1
    }
  }
  return positions
}

export function TableFloorMap({
  tables,
  statusLabels,
  statusColors,
  statusCard,
  onSelectTable,
  onPositionChange,
  selectionMode,
  selectedIds,
  onToggleSelect,
  onUngroup,
}: TableFloorMapProps) {
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>(() => resolvePositions(tables))
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const canvasRef = useRef<HTMLDivElement>(null)
  const dragOffset = useRef({ x: 0, y: 0 })

  const groupLabels = useMemo(() => {
    const numbersByGroup: Record<string, number[]> = {}
    for (const table of tables) {
      if (!table.groupId) continue
      numbersByGroup[table.groupId] ??= []
      numbersByGroup[table.groupId]!.push(table.number)
    }
    return Object.fromEntries(
      Object.entries(numbersByGroup).map(([groupId, numbers]) => [
        groupId,
        [...numbers].sort((a, b) => a - b).join('+'),
      ])
    )
  }, [tables])

  useEffect(() => {
    setPositions(resolvePositions(tables))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tables.map((t) => `${t.id}:${t.positionX}:${t.positionY}`).join(',')])

  function handlePointerDown(event: React.PointerEvent, tableId: string) {
    event.preventDefault()
    const canvas = canvasRef.current
    const position = positions[tableId]
    if (!canvas || !position) return
    const canvasRect = canvas.getBoundingClientRect()
    dragOffset.current = {
      x: event.clientX - canvasRect.left - position.x,
      y: event.clientY - canvasRect.top - position.y,
    }
    setDraggingId(tableId)
  }

  useEffect(() => {
    if (!draggingId) return

    function handlePointerMove(event: PointerEvent) {
      const canvas = canvasRef.current
      if (!canvas || !draggingId) return
      const canvasRect = canvas.getBoundingClientRect()
      const x = Math.max(0, event.clientX - canvasRect.left - dragOffset.current.x)
      const y = Math.max(0, event.clientY - canvasRect.top - dragOffset.current.y)
      setPositions((previous) => ({ ...previous, [draggingId]: { x, y } }))
    }

    function handlePointerUp() {
      setDraggingId((currentId) => {
        if (!currentId) return null
        setPositions((previous) => {
          const current = previous[currentId]
          if (!current) return previous
          const snapped = { x: snapToGrid(current.x), y: snapToGrid(current.y) }
          onPositionChange(currentId, snapped.x, snapped.y)
          return { ...previous, [currentId]: snapped }
        })
        return null
      })
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }, [draggingId, onPositionChange])

  const maxX = Math.max(CARD_WIDTH, ...Object.values(positions).map((p) => p.x + CARD_WIDTH)) + CANVAS_PADDING
  const maxY = Math.max(CARD_HEIGHT, ...Object.values(positions).map((p) => p.y + CARD_HEIGHT)) + CANVAS_PADDING

  return (
    <div className="border border-gray-200 rounded-xl overflow-auto bg-gray-50" style={{ maxHeight: '70vh' }}>
      <div
        ref={canvasRef}
        className="relative"
        style={{
          width: Math.max(maxX, 800),
          height: Math.max(maxY, 500),
          backgroundImage: 'radial-gradient(circle, #d1d5db 1px, transparent 1px)',
          backgroundSize: `${GRID_SIZE}px ${GRID_SIZE}px`,
        }}
      >
        {tables.map((table) => {
          const position = positions[table.id]
          if (!position) return null
          const isDragging = draggingId === table.id
          const isSelected = selectedIds.has(table.id)
          const isGrouped = !!table.groupId
          return (
            <div
              key={table.id}
              className={`absolute border-2 rounded-xl p-3 transition-shadow select-none ${statusCard[table.status]} ${
                isDragging ? 'shadow-lg ring-2 ring-brand-400 z-10' : 'shadow-sm z-0'
              } ${isSelected ? 'ring-2 ring-indigo-500' : ''} ${isGrouped ? 'ring-2 ring-purple-400' : ''}`}
              style={{ left: position.x, top: position.y, width: CARD_WIDTH, touchAction: 'none' }}
            >
              <div className="flex items-start justify-between mb-1.5">
                <button
                  type="button"
                  onPointerDown={(event) => handlePointerDown(event, table.id)}
                  className="cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600 -ml-1 p-1"
                  aria-label={`Mover mesa ${table.number}`}
                >
                  <GripVertical className="h-4 w-4" />
                </button>
                <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium border ${statusColors[table.status]}`}>
                  {statusLabels[table.status]}
                </span>
              </div>
              {isGrouped && table.groupId && (
                <div className="flex items-center justify-between gap-1 mb-1">
                  <span className="inline-flex items-center text-[10px] font-medium text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded border border-purple-200">
                    Grupo {groupLabels[table.groupId]}
                  </span>
                  <button
                    type="button"
                    onClick={() => onUngroup(table.groupId!)}
                    className="text-[10px] text-purple-600 hover:text-purple-800 underline shrink-0"
                  >
                    Desagrupar
                  </button>
                </div>
              )}
              {selectionMode && !isGrouped ? (
                <button type="button" onClick={() => onToggleSelect(table.id)} className="w-full text-left">
                  <p className="text-xl font-bold text-gray-900 leading-tight">{table.number}</p>
                  <p className="text-xs text-gray-500">{table.capacity} lugares</p>
                  <p className={`text-[10px] font-medium mt-1 ${isSelected ? 'text-indigo-600' : 'text-gray-400'}`}>
                    {isSelected ? 'Selecionada' : 'Toque para selecionar'}
                  </p>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => onSelectTable(table)}
                  className="w-full text-left disabled:cursor-not-allowed disabled:opacity-70"
                  disabled={selectionMode}
                >
                  <p className="text-xl font-bold text-gray-900 leading-tight">{table.number}</p>
                  <p className="text-xs text-gray-500">{table.capacity} lugares</p>
                  {table.comanda && (
                    <span className="inline-block mt-1.5 text-[10px] font-mono font-bold text-gray-800 bg-white/80 px-1.5 py-0.5 rounded border">
                      {table.comanda.code}
                    </span>
                  )}
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
