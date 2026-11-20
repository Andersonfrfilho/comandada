import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Select } from './Select'
import { PAGE_SIZE_OPTIONS, clampPage, describePageRange, pageButtons, totalPagesFor } from '@/lib/listing'

export interface PaginationProps {
  readonly page: number
  readonly pageSize: number
  readonly total: number
  readonly onPageChange: (page: number) => void
  readonly onPageSizeChange?: (pageSize: number) => void
  readonly pageSizeOptions?: readonly number[]
  // Dentro de um cartão (borda em cima) ou solta abaixo de uma lista de cartões.
  readonly variant?: 'attached' | 'standalone'
}

export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = PAGE_SIZE_OPTIONS,
  variant = 'attached',
}: PaginationProps): JSX.Element | null {
  const totalPages = totalPagesFor(total, pageSize)
  const currentPage = clampPage(page, total, pageSize)
  if (total === 0) return null

  const containerClass =
    variant === 'attached'
      ? 'border-t border-gray-200 bg-gray-50 px-4 py-3'
      : 'mt-4 rounded-xl bg-white px-4 py-3 shadow-sm'

  return (
    <nav aria-label="Paginação" className={`flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between ${containerClass}`}>
      <div className="flex items-center gap-3 text-sm text-gray-500">
        <span>{describePageRange(currentPage, pageSize, total)}</span>
        {onPageSizeChange && (
          <div className="flex items-center gap-1.5">
            <span className="hidden sm:inline">Por página</span>
            <Select
              size="sm"
              className="w-[76px]"
              value={String(pageSize)}
              onChange={(value) => onPageSizeChange(Number(value))}
              options={pageSizeOptions.map((option) => ({ value: String(option), label: String(option) }))}
              ariaLabel="Itens por página"
              searchable={false}
            />
          </div>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage === 1}
            aria-label="Página anterior"
            className="rounded-lg border border-gray-300 bg-white p-1.5 text-gray-600 hover:bg-gray-100 disabled:opacity-40 transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          {pageButtons(currentPage, totalPages).map((entry, index) =>
            entry === 'gap' ? (
              <span key={`gap-${index}`} className="px-1 text-gray-400">
                …
              </span>
            ) : (
              <button
                key={entry}
                type="button"
                onClick={() => onPageChange(entry)}
                aria-current={entry === currentPage ? 'page' : undefined}
                className={`min-w-[2rem] rounded-lg px-2 py-1 text-sm transition-colors ${
                  entry === currentPage
                    ? 'bg-gray-900 font-semibold text-white'
                    : 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-100'
                }`}
              >
                {entry}
              </button>
            )
          )}
          <button
            type="button"
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage === totalPages}
            aria-label="Próxima página"
            className="rounded-lg border border-gray-300 bg-white p-1.5 text-gray-600 hover:bg-gray-100 disabled:opacity-40 transition-colors"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </nav>
  )
}
