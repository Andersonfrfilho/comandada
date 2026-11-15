import type { ReactNode } from 'react'
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'
import { Skeleton } from './Skeleton'
import type { SortDirection, SortState } from '@/lib/listing'

export interface DataTableColumn<TRow, TField extends string = string> {
  readonly key: string
  readonly header: string
  readonly render: (row: TRow) => ReactNode
  readonly align?: 'left' | 'right' | 'center'
  // Campo de ordenação; sem ele a coluna não ordena.
  readonly sortField?: TField
  // Sentido do primeiro clique (valores e datas costumam começar do maior).
  readonly defaultDirection?: SortDirection
  // Classes de visibilidade responsiva, ex.: "hidden md:table-cell".
  readonly className?: string
}

export interface DataTableProps<TRow, TField extends string = string> {
  readonly columns: ReadonlyArray<DataTableColumn<TRow, TField>>
  readonly rows: readonly TRow[]
  readonly rowKey: (row: TRow) => string
  readonly isLoading?: boolean
  readonly emptyMessage: string
  readonly sort?: SortState<TField>
  readonly onSort?: (field: TField, defaultDirection: SortDirection) => void
  readonly onRowClick?: (row: TRow) => void
  readonly isRowSelected?: (row: TRow) => boolean
  readonly rowClassName?: (row: TRow) => string
  readonly minWidthClassName?: string
  readonly footer?: ReactNode
  readonly caption?: string
}

const ALIGN_CLASS = { left: 'text-left', right: 'text-right', center: 'text-center' } as const
const JUSTIFY_CLASS = { left: 'justify-start', right: 'justify-end', center: 'justify-center' } as const

function SortIcon({ active, direction }: { active: boolean; direction: SortDirection }) {
  if (!active) return <ArrowUpDown className="h-3 w-3 opacity-40" aria-hidden />
  return direction === 'asc' ? <ArrowUp className="h-3 w-3" aria-hidden /> : <ArrowDown className="h-3 w-3" aria-hidden />
}

export function DataTable<TRow, TField extends string = string>({
  columns,
  rows,
  rowKey,
  isLoading = false,
  emptyMessage,
  sort,
  onSort,
  onRowClick,
  isRowSelected,
  rowClassName,
  minWidthClassName = 'min-w-[640px]',
  footer,
  caption,
}: DataTableProps<TRow, TField>): JSX.Element {
  return (
    <div className="bg-white rounded-xl shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className={`w-full text-sm ${minWidthClassName}`}>
          {caption && <caption className="sr-only">{caption}</caption>}
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {columns.map((column) => {
                const align = column.align ?? 'left'
                const isActive = !!column.sortField && sort?.field === column.sortField
                const ariaSort = isActive ? (sort?.direction === 'asc' ? 'ascending' : 'descending') : undefined
                return (
                  <th
                    key={column.key}
                    scope="col"
                    aria-sort={ariaSort}
                    className={`px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap ${ALIGN_CLASS[align]} ${column.className ?? ''}`}
                  >
                    {column.sortField && onSort ? (
                      <button
                        type="button"
                        onClick={() => onSort(column.sortField as TField, column.defaultDirection ?? 'asc')}
                        className={`inline-flex items-center gap-1 uppercase hover:text-gray-900 transition-colors ${JUSTIFY_CLASS[align]} ${isActive ? 'text-gray-900' : ''}`}
                      >
                        {column.header}
                        <SortIcon active={isActive} direction={sort?.direction ?? 'asc'} />
                      </button>
                    ) : (
                      column.header
                    )}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading ? (
              Array.from({ length: 5 }, (_, index) => (
                <tr key={`loading-${index}`}>
                  {columns.map((column) => (
                    <td key={column.key} className={`px-4 py-3 ${column.className ?? ''}`}>
                      <Skeleton className="h-4 w-full" />
                    </td>
                  ))}
                </tr>
              ))
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-10 text-center text-gray-400">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const selected = isRowSelected?.(row) ?? false
                return (
                  <tr
                    key={rowKey(row)}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    className={`transition-colors ${onRowClick ? 'cursor-pointer hover:bg-gray-100' : 'hover:bg-gray-50'} ${
                      selected ? 'bg-brand-50 shadow-[inset_2px_0_0_0] shadow-brand-500' : 'even:bg-gray-50/60'
                    } ${rowClassName?.(row) ?? ''}`}
                  >
                    {columns.map((column) => (
                      <td
                        key={column.key}
                        className={`px-4 py-3 ${ALIGN_CLASS[column.align ?? 'left']} ${column.className ?? ''}`}
                      >
                        {column.render(row)}
                      </td>
                    ))}
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
      {footer}
    </div>
  )
}
