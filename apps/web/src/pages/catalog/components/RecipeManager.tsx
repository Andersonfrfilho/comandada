import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/authStore'
import { api } from '@/lib/api'
import { Plus, Trash2 } from 'lucide-react'

interface Ingredient {
  id: string
  name: string
  unit: string
  costPerUnit: string
  stockQuantity: string
}

interface RecipeEntry {
  id?: string
  ingredientId: string
  ingredientName?: string
  ingredientUnit?: string
  ingredientCostPerUnit?: string
  quantity: string
  unit: string
  notes: string
}

interface ProductIngredient {
  id: string
  productId: string
  ingredientId: string
  quantity: string
  unit: string
  notes: string | null
}

interface RecipeManagerProps {
  productId: string
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

export function RecipeManager({ productId }: RecipeManagerProps) {
  const accessToken = useAuthStore((state) => state.accessToken)
  const queryClient = useQueryClient()

  const [isOpen, setIsOpen] = useState(false)
  const [newIngredientId, setNewIngredientId] = useState('')
  const [newQuantity, setNewQuantity] = useState('')
  const [newUnit, setNewUnit] = useState('un')
  const [newNotes, setNewNotes] = useState('')
  const [error, setError] = useState<string | null>(null)

  const { data: ingredients = [] } = useQuery({
    queryKey: ['ingredients'],
    queryFn: () => api.get<Ingredient[]>('/ingredients', accessToken ?? undefined),
  })

  const { data: productIngredients = [] } = useQuery({
    queryKey: ['product-ingredients', productId],
    queryFn: () => api.get<ProductIngredient[]>(`/ingredients/product/${productId}`, accessToken ?? undefined),
    enabled: isOpen && !!productId,
  })

  const recipeEntries: (RecipeEntry & { id: string })[] = useMemo(() => {
    return productIngredients.map((pi) => {
      const ingredient = ingredients.find((i) => i.id === pi.ingredientId)
      return {
        id: pi.id,
        ingredientId: pi.ingredientId,
        ingredientName: ingredient?.name ?? pi.ingredientId,
        ingredientUnit: ingredient?.unit ?? 'un',
        ingredientCostPerUnit: ingredient?.costPerUnit ?? '0',
        quantity: pi.quantity,
        unit: pi.unit,
        notes: pi.notes ?? '',
      }
    })
  }, [productIngredients, ingredients])

  const theoreticalCost = useMemo(() => {
    return recipeEntries.reduce((sum, entry) => {
      return sum + toNumber(entry.quantity) * toNumber(entry.ingredientCostPerUnit ?? '0')
    }, 0)
  }, [recipeEntries])

  const addIngredient = useMutation({
    mutationFn: (body: unknown) =>
      api.post(`/ingredients/product/${productId}`, body, accessToken ?? undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['product-ingredients', productId] })
      setNewIngredientId('')
      setNewQuantity('')
      setNewUnit('un')
      setNewNotes('')
      setError(null)
    },
    onError: (e: Error) => setError(e.message),
  })

  const removeIngredient = useMutation({
    mutationFn: (id: string) =>
      api.delete(`/ingredients/product/${productId}/${id}`, accessToken ?? undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['product-ingredients', productId] })
    },
    onError: (e: Error) => setError(e.message),
  })

  const selectedIngredient = ingredients.find((i) => i.id === newIngredientId)

  function handleAdd() {
    if (!newIngredientId) return
    addIngredient.mutate({
      ingredientId: newIngredientId,
      quantity: Number(newQuantity) || 0,
      unit: newUnit,
      notes: newNotes || undefined,
    })
  }

  if (!isOpen) {
    return (
      <div className="mt-6 pt-4 border-t border-gray-200">
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="flex items-center gap-2 text-sm font-medium text-brand-600 hover:text-brand-700"
        >
          <Plus className="h-4 w-4" />
          Gerenciar ficha técnica
        </button>
      </div>
    )
  }

  return (
    <div className="mt-6 pt-4 border-t border-gray-200">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold text-gray-700">Ficha técnica</h3>
          {recipeEntries.length > 0 && (
            <p className="text-xs font-medium text-brand-600">
              Custo da receita: R$ {theoreticalCost.toFixed(2)}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => setIsOpen(false)}
          className="text-xs text-gray-400 hover:text-gray-600"
        >
          Fechar
        </button>
      </div>

      {recipeEntries.length > 0 && (
        <div className="border border-gray-200 rounded-xl overflow-hidden mb-3">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 text-left text-gray-500">
                <th className="px-3 py-2 font-medium">Ingrediente</th>
                <th className="px-3 py-2 font-medium">Qtd</th>
                <th className="px-3 py-2 font-medium">Notas</th>
                <th className="px-3 py-2 font-medium text-right">Custo</th>
                <th className="px-3 py-2 font-medium w-8"></th>
              </tr>
            </thead>
            <tbody>
              {recipeEntries.map((entry) => (
                <tr key={entry.id} className="border-t border-gray-100">
                  <td className="px-3 py-2 text-gray-800">{entry.ingredientName}</td>
                  <td className="px-3 py-2 text-gray-600">
                    {toNumber(entry.quantity).toFixed(4)} {UNIT_LABELS[entry.unit] ?? entry.unit}
                  </td>
                  <td className="px-3 py-2 text-gray-400 max-w-[120px] truncate">{entry.notes || '-'}</td>
                  <td className="px-3 py-2 text-gray-600 text-right">
                    R$ {(toNumber(entry.quantity) * toNumber(entry.ingredientCostPerUnit ?? '0')).toFixed(4)}
                  </td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => removeIngredient.mutate(entry.id)}
                      className="text-red-400 hover:text-red-600"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {recipeEntries.length > 0 && (
        <p className="text-xs font-medium text-brand-600 mb-3">
          Custo teórico: R$ {theoreticalCost.toFixed(4)}
        </p>
      )}

      {recipeEntries.length === 0 && !addIngredient.isPending && (
        <p className="text-xs text-gray-400 italic mb-3">Nenhum ingrediente adicionado</p>
      )}

      <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
        <p className="text-xs text-gray-500 mb-2 font-medium">Adicionar ingrediente</p>
        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <select
              value={newIngredientId}
              onChange={(e) => {
                setNewIngredientId(e.target.value)
                if (e.target.value) {
                  const ingredient = ingredients.find((i) => i.id === e.target.value)
                  if (ingredient) setNewUnit(ingredient.unit)
                }
              }}
              className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="">Selecionar ingrediente...</option>
              {ingredients.map((ing) => (
                <option key={ing.id} value={ing.id}>
                  {ing.name} (R$ {toNumber(ing.costPerUnit).toFixed(4)}/{ing.unit})
                </option>
              ))}
            </select>
          </div>
          <input
            type="number"
            min="0"
            step="0.0001"
            value={newQuantity}
            onChange={(e) => setNewQuantity(e.target.value)}
            placeholder="Qtd"
            className="w-20 border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          <select
            value={newUnit}
            onChange={(e) => setNewUnit(e.target.value)}
            className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value="un">Un</option>
            <option value="kg">Kg</option>
            <option value="g">g</option>
            <option value="l">L</option>
            <option value="ml">ml</option>
          </select>
          <button
            type="button"
            onClick={handleAdd}
            disabled={!newIngredientId || addIngredient.isPending}
            className="px-3 py-1.5 text-xs font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50"
          >
            {addIngredient.isPending ? '...' : 'Adicionar'}
          </button>
        </div>
        <input
          type="text"
          value={newNotes}
          onChange={(e) => setNewNotes(e.target.value)}
          placeholder="Notas (opcional)"
          className="mt-2 w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
      </div>

      {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
    </div>
  )
}

interface RecipeCostBadgeProps {
  productId: string
  productPrice: string
  costPrice?: string | null
}

function formatBRL(value: string | number) {
  return Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function RecipeCostBadge({ productId, productPrice, costPrice }: RecipeCostBadgeProps) {
  const accessToken = useAuthStore((state) => state.accessToken)

  const { data: ingredients = [] } = useQuery({
    queryKey: ['ingredients'],
    queryFn: () => api.get<Ingredient[]>('/ingredients', accessToken ?? undefined),
  })

  const { data: productIngredients = [] } = useQuery({
    queryKey: ['product-ingredients', productId],
    queryFn: () => api.get<ProductIngredient[]>(`/ingredients/product/${productId}`, accessToken ?? undefined),
    enabled: !!productId,
  })

  const recipeCost = productIngredients.reduce((sum, pi) => {
    const ing = ingredients.find((i) => i.id === pi.ingredientId)
    return sum + Number(ing?.costPerUnit ?? 0) * Number(pi.quantity)
  }, 0)

  if (productIngredients.length === 0) {
    return <span className="text-xs text-gray-400 italic">Sem ficha técnica</span>
  }

  const priceNum = Number(productPrice) || 0
  const margin = priceNum > 0 ? ((priceNum - recipeCost) / priceNum * 100).toFixed(0) : '-'

  return (
    <span className="text-xs text-gray-500">
      Custo receita {formatBRL(recipeCost)} · Margem {margin}%
    </span>
  )
}
