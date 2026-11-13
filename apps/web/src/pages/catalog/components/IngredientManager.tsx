import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/authStore'
import { api } from '@/lib/api'
import { Pencil, Trash2, Plus, ChevronDown, ChevronRight } from 'lucide-react'
import { StockBatchList } from './StockBatchList'
import { StockMovementHistory } from './StockMovementHistory'
import { StockAdjustmentForm } from './StockAdjustmentForm'

interface Ingredient {
  id: string
  establishmentId: string
  name: string
  unit: string
  costPerUnit: string
  stockQuantity: string
  minimumStock: string | null
  sectionId: string | null
}

const UNIT_LABELS: Record<string, string> = {
  un: 'Un',
  kg: 'Kg',
  g: 'g',
  l: 'L',
  ml: 'ml',
}

function toNumber(value: string): number {
  return Number(value) || 0
}

function getStockColor(stockQuantity: string, minimumStock: string | null): string {
  const stock = toNumber(stockQuantity)
  const min = toNumber(minimumStock ?? '0')
  if (min > 0 && stock <= min) return 'text-red-600 bg-red-50'
  if (min > 0 && stock <= min * 1.5) return 'text-yellow-600 bg-yellow-50'
  return 'text-green-600 bg-green-50'
}

export function IngredientManager() {
  const accessToken = useAuthStore((state) => state.accessToken)
  const queryClient = useQueryClient()

  const [editingId, setEditingId] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [formName, setFormName] = useState('')
  const [formUnit, setFormUnit] = useState('un')
  const [formCost, setFormCost] = useState('')
  const [formMinStock, setFormMinStock] = useState('')
  const [error, setError] = useState<string | null>(null)

  const { data: ingredients = [] } = useQuery({
    queryKey: ['ingredients'],
    queryFn: () => api.get<Ingredient[]>('/ingredients', accessToken ?? undefined),
  })

  const createIngredient = useMutation({
    mutationFn: (body: unknown) => api.post('/ingredients', body, accessToken ?? undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ingredients'] })
      resetForm()
    },
    onError: (e: Error) => setError(e.message),
  })

  const updateIngredient = useMutation({
    mutationFn: ({ id, body }: { id: string; body: unknown }) =>
      api.put(`/ingredients/${id}`, body, accessToken ?? undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ingredients'] })
      resetForm()
    },
    onError: (e: Error) => setError(e.message),
  })

  const deleteIngredient = useMutation({
    mutationFn: (id: string) => api.delete(`/ingredients/${id}`, accessToken ?? undefined),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ingredients'] }),
    onError: (e: Error) => setError(e.message),
  })

  function resetForm() {
    setEditingId(null)
    setAdding(false)
    setFormName('')
    setFormUnit('un')
    setFormCost('')
    setFormMinStock('')
    setError(null)
  }

  function startEdit(ingredient: Ingredient) {
    setEditingId(ingredient.id)
    setAdding(false)
    setFormName(ingredient.name)
    setFormUnit(ingredient.unit)
    setFormCost(ingredient.costPerUnit)
    setFormMinStock(ingredient.minimumStock ?? '')
    setError(null)
  }

  function startAdd() {
    setAdding(true)
    setEditingId(null)
    setFormName('')
    setFormUnit('un')
    setFormCost('')
    setFormMinStock('')
    setError(null)
  }

  function submit() {
    const body = {
      name: formName,
      unit: formUnit,
      costPerUnit: formCost ? Number(formCost) : undefined,
      minimumStock: formMinStock ? Number(formMinStock) : null,
    }
    if (editingId) {
      updateIngredient.mutate({ id: editingId, body })
    } else {
      createIngredient.mutate(body)
    }
  }

  const isPending = createIngredient.isPending || updateIngredient.isPending

  return (
    <div className="border-t border-gray-200 pt-4 mt-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-gray-700">Ingredientes</h2>
        {!adding && (
          <button
            onClick={startAdd}
            className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700"
          >
            <Plus className="h-3.5 w-3.5" />
            Adicionar
          </button>
        )}
      </div>

      {ingredients.length === 0 && !adding && (
        <p className="text-xs text-gray-400 italic">Nenhum ingrediente cadastrado</p>
      )}

      <div className="space-y-2">
        {ingredients.map((ingredient) =>
          editingId === ingredient.id ? (
            <div key={ingredient.id} className="bg-gray-50 rounded-lg p-3 border border-gray-200">
              <div className="flex gap-2 items-end">
                <div className="flex-1 space-y-2">
                  <input
                    type="text"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="Nome"
                    className="w-full border border-gray-300 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                  <div className="flex gap-2">
                    <select
                      value={formUnit}
                      onChange={(e) => setFormUnit(e.target.value)}
                      className="border border-gray-300 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                    >
                      <option value="un">Un</option>
                      <option value="kg">Kg</option>
                      <option value="g">g</option>
                      <option value="l">L</option>
                      <option value="ml">ml</option>
                    </select>
                    <input
                      type="number"
                      min="0"
                      step="0.0001"
                      value={formCost}
                      onChange={(e) => setFormCost(e.target.value)}
                      placeholder="Custo/un"
                      className="flex-1 border border-gray-300 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                    <input
                      type="number"
                      min="0"
                      step="0.0001"
                      value={formMinStock}
                      onChange={(e) => setFormMinStock(e.target.value)}
                      placeholder="Est. mínimo"
                      className="flex-1 border border-gray-300 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                  </div>
                </div>
                <div className="flex gap-1 flex-shrink-0">
                  <button
                    onClick={submit}
                    disabled={isPending}
                    className="px-2 py-1 text-xs font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50"
                  >
                    Salvar
                  </button>
                  <button
                    onClick={resetForm}
                    className="px-2 py-1 text-xs font-medium text-gray-500 border border-gray-300 rounded-lg hover:bg-gray-100"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
              {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
            </div>
          ) : (
            <div key={ingredient.id} className="bg-white rounded-lg border border-gray-200 group">
              <div className="px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <button
                    onClick={() => setExpandedId(expandedId === ingredient.id ? null : ingredient.id)}
                    className="flex items-center gap-1.5 min-w-0 flex-1 text-left"
                  >
                    {expandedId === ingredient.id ? (
                      <ChevronDown className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
                    )}
                    <span className="text-sm font-medium text-gray-800 truncate">{ingredient.name}</span>
                    <span className="text-xs text-gray-400 flex-shrink-0">{UNIT_LABELS[ingredient.unit] ?? ingredient.unit}</span>
                  </button>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                    <button
                      onClick={() => startEdit(ingredient)}
                      className="p-1 text-gray-400 hover:text-brand-600"
                      title="Editar"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => deleteIngredient.mutate(ingredient.id)}
                      className="p-1 text-gray-400 hover:text-red-500"
                      title="Excluir"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-1 pl-5">
                  <span className="text-xs text-gray-500">
                    R$ {toNumber(ingredient.costPerUnit).toFixed(4)}/{ingredient.unit}
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${getStockColor(ingredient.stockQuantity, ingredient.minimumStock)}`}>
                    {toNumber(ingredient.stockQuantity).toFixed(2)}
                  </span>
                  {ingredient.minimumStock && (
                    <span className="text-xs text-gray-400">mín. {toNumber(ingredient.minimumStock).toFixed(2)}</span>
                  )}
                </div>
              </div>
              {expandedId === ingredient.id && (
                <div className="px-3 pb-3 pt-1 border-t border-gray-100">
                  <div className="flex justify-end mb-1">
                    <StockAdjustmentForm ingredientId={ingredient.id} ingredientName={ingredient.name} />
                  </div>
                  <StockBatchList ingredientId={ingredient.id} ingredientName={ingredient.name} />
                  <StockMovementHistory ingredientId={ingredient.id} />
                </div>
              )}
            </div>
          )
        )}

        {adding && (
          <div className="bg-gray-50 rounded-lg p-3 border border-brand-200">
            <div className="flex gap-2 items-end">
              <div className="flex-1 space-y-2">
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Nome do ingrediente"
                  className="w-full border border-gray-300 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
                <div className="flex gap-2">
                  <select
                    value={formUnit}
                    onChange={(e) => setFormUnit(e.target.value)}
                    className="border border-gray-300 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  >
                    <option value="un">Un</option>
                    <option value="kg">Kg</option>
                    <option value="g">g</option>
                    <option value="l">L</option>
                    <option value="ml">ml</option>
                  </select>
                  <input
                    type="number"
                    min="0"
                    step="0.0001"
                    value={formCost}
                    onChange={(e) => setFormCost(e.target.value)}
                    placeholder="Custo/un"
                    className="flex-1 border border-gray-300 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                  <input
                    type="number"
                    min="0"
                    step="0.0001"
                    value={formMinStock}
                    onChange={(e) => setFormMinStock(e.target.value)}
                    placeholder="Est. mínimo"
                    className="flex-1 border border-gray-300 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
              </div>
              <div className="flex gap-1 flex-shrink-0">
                <button
                  onClick={submit}
                  disabled={isPending}
                  className="px-2 py-1 text-xs font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50"
                >
                  Criar
                </button>
                <button
                  onClick={resetForm}
                  className="px-2 py-1 text-xs font-medium text-gray-500 border border-gray-300 rounded-lg hover:bg-gray-100"
                >
                  Cancelar
                </button>
              </div>
            </div>
            {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
          </div>
        )}
      </div>
    </div>
  )
}
