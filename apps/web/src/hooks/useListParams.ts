import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  applyListParamChanges,
  parseListParams,
  toggleSort,
  type ListParamsConfig,
  type SortDirection,
} from '@/lib/listing'

const SEARCH_DEBOUNCE_MS = 400

// Estado das listagens guardado na URL: voltar do detalhe ou compartilhar o link mantém página,
// ordenação, busca e filtros.
export function useListParams<TField extends string>(config: ListParamsConfig<TField>) {
  const [searchParams, setSearchParams] = useSearchParams()
  const { sortFields, defaultSort, defaultPageSize } = config
  const params = useMemo(
    () => parseListParams(searchParams, { sortFields, defaultSort, defaultPageSize }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [searchParams]
  )

  const [searchInput, setSearchInput] = useState(params.search)

  const update = useCallback(
    (changes: Record<string, string | null>, options?: { replace?: boolean }) => {
      setSearchParams((previous) => applyListParamChanges(previous, changes), { replace: options?.replace ?? false })
    },
    [setSearchParams]
  )

  // Só manda a busca para a URL (e para a API) depois que a pessoa para de digitar.
  useEffect(() => {
    if (searchInput.trim() === params.search) return
    const timeout = setTimeout(() => update({ search: searchInput.trim() || null }, { replace: true }), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timeout)
  }, [searchInput, params.search, update])

  const setSort = useCallback(
    (field: TField, defaultDirection: SortDirection = 'asc') => {
      const next = toggleSort(params.sort, field, defaultDirection)
      update({ sortBy: next.field, sortDirection: next.direction })
    },
    [params.sort, update]
  )

  const filter = useCallback((key: string) => searchParams.get(key) ?? '', [searchParams])

  const clearAll = useCallback(() => {
    setSearchInput('')
    setSearchParams(new URLSearchParams())
  }, [setSearchParams])

  return {
    ...params,
    searchInput,
    setSearchInput,
    setPage: (page: number) => update({ page: String(page) }),
    setPageSize: (pageSize: number) => update({ pageSize: String(pageSize) }),
    setSort,
    filter,
    setFilter: (key: string, value: string | null) => update({ [key]: value }),
    clearAll,
  }
}
