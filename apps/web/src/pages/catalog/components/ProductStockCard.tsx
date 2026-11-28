import { useQuery } from '@tanstack/react-query'
import type { RecipeDetail } from '@adatechnology/recipe-contracts'
import { Package } from 'lucide-react'

import { useStockEnabled } from '@/hooks/useStockEnabled'
import { ApiError } from '@/lib/api'
import { formatDecimal } from '@/lib/listing'
import { recipesSdkApi } from '@/lib/recipesSdkApi'
import { stockSdkApi } from '@/lib/stockSdkApi'
import { portionsAvailable, portionsFromIngredient, type RecipeStockLine } from '../productStock'

export const PRODUCT_STOCK_QUERY_KEY = 'sdk-product-stock'

const NOT_FOUND_STATUS = 404
const LOW_PORTIONS_THRESHOLD = 5

type StockRow = {
  readonly lineId: string
  readonly name: string
  readonly notes: string | null
  readonly unit: string
  readonly stockLine: RecipeStockLine
  readonly isLow: boolean
  readonly portions: number | null
}

type ProductStock = {
  readonly rows: readonly StockRow[]
  readonly available: number | null
}

async function loadLevel(ingredientId: string) {
  try {
    return await stockSdkApi.getLevel(ingredientId)
  } catch (error) {
    if (error instanceof ApiError && error.status === NOT_FOUND_STATUS) return undefined
    throw error
  }
}

function buildRow(params: {
  readonly detail: RecipeDetail
  readonly lineIndex: number
  readonly level: Awaited<ReturnType<typeof loadLevel>>
}): StockRow | undefined {
  const { detail, lineIndex, level } = params
  const line = detail.recipe.lines[lineIndex]
  const lineCost = detail.cost.lines.find((candidate) => candidate.lineId === line?.id)
  if (!line || !lineCost) return undefined
  const ingredient = detail.ingredients.find((candidate) => candidate.id === line.ingredientId)
  const unit = ingredient?.unit ?? line.unit
  // O módulo converte a unidade da linha para a do insumo: a quantidade por porção já vem nela.
  const stockLine: RecipeStockLine = {
    stockQuantity: Number(level?.quantity ?? 0),
    stockUnit: unit,
    quantityPerPortion: Number(lineCost.quantityInIngredientUnit) / Number(detail.recipe.yieldPortions),
    recipeUnit: unit,
  }
  const minimum = level?.minimumQuantity ? Number(level.minimumQuantity) : null
  return {
    lineId: line.id,
    name: ingredient?.name ?? 'Insumo removido',
    notes: line.notes,
    unit,
    stockLine,
    isLow: minimum !== null && stockLine.stockQuantity <= minimum,
    portions: portionsFromIngredient(stockLine),
  }
}

async function loadProductStock(productId: string): Promise<ProductStock | null> {
  const detail = await recipesSdkApi.getRecipe(productId)
  if (!detail) return null
  const levels = await Promise.all(detail.recipe.lines.map((line) => loadLevel(line.ingredientId)))
  const rows = levels.flatMap((level, lineIndex) => buildRow({ detail, lineIndex, level }) ?? [])
  return { rows, available: portionsAvailable(rows.map((row) => row.stockLine)) }
}

function availabilityClass(available: number): string {
  if (available === 0) return 'bg-red-50 text-red-700'
  return available <= LOW_PORTIONS_THRESHOLD ? 'bg-yellow-50 text-yellow-700' : 'bg-green-50 text-green-700'
}

type ProductStockCardProps = {
  readonly productId: string
}

/** Estoque do produto pela ficha técnica: saldo de cada insumo e quantas porções ainda rende. */
export function ProductStockCard({ productId }: ProductStockCardProps) {
  const { isEnabled } = useStockEnabled()
  const { data: stock, isLoading } = useQuery({
    queryKey: [PRODUCT_STOCK_QUERY_KEY, productId],
    enabled: isEnabled,
    queryFn: () => loadProductStock(productId),
  })
  if (!isEnabled) return null

  return (
    <section className="bg-white rounded-xl border border-gray-200 p-4 md:p-5">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h2 className="text-sm font-semibold text-gray-700">Estoque pela ficha técnica</h2>
        {stock?.available != null && (
          <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${availabilityClass(stock.available)}`}>
            {stock.available === 0
              ? 'Sem estoque para produzir'
              : `Rende ${formatDecimal(stock.available, 0)} porç${stock.available === 1 ? 'ão' : 'ões'}`}
          </span>
        )}
      </div>
      {isLoading ? (
        <p className="text-sm text-gray-400">Carregando…</p>
      ) : !stock || stock.rows.length === 0 ? (
        <div className="flex items-start gap-3 text-sm text-gray-500">
          <Package className="h-5 w-5 text-gray-300 shrink-0" aria-hidden="true" />
          <p>
            Sem ficha técnica. O estoque é controlado pelos insumos: monte a ficha abaixo para ver quanto ainda dá
            para produzir e baixar o estoque a cada pedido.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto -mx-4 md:mx-0">
          <table className="w-full text-sm min-w-[32rem]">
            <thead>
              <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
                <th className="font-medium py-2 px-4 md:px-0">Insumo</th>
                <th className="font-medium py-2 px-2 text-right">Por porção</th>
                <th className="font-medium py-2 px-2 text-right">Em estoque</th>
                <th className="font-medium py-2 px-4 md:px-0 text-right">Rende</th>
              </tr>
            </thead>
            <tbody>
              {stock.rows.map((row) => (
                <tr key={row.lineId} className="border-b border-gray-50 last:border-0">
                  <td className="py-2 px-4 md:px-0">
                    <span className="text-gray-800">{row.name}</span>
                    {row.notes && <span className="block text-xs text-gray-400">{row.notes}</span>}
                  </td>
                  <td className="py-2 px-2 text-right tabular-nums text-gray-600">
                    {formatDecimal(row.stockLine.quantityPerPortion, 3)} {row.unit}
                  </td>
                  <td className={`py-2 px-2 text-right tabular-nums ${row.isLow ? 'text-red-600 font-medium' : 'text-gray-600'}`}>
                    {formatDecimal(row.stockLine.stockQuantity, 2)} {row.unit}
                  </td>
                  <td className="py-2 px-4 md:px-0 text-right tabular-nums text-gray-800">
                    {row.portions === null ? '—' : formatDecimal(row.portions, 0)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-xs text-gray-400">
        Entrada, perda e lotes de cada insumo ficam em Insumos e estoque, no menu.
      </p>
    </section>
  )
}
