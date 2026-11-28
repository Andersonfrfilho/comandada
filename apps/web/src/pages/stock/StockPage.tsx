import { useState } from 'react'
import { IngredientsWorkspace } from '@adatechnology/recipes-ui'
import { IngredientStockButton, InventoryWorkspace, StockLevelsWorkspace } from '@adatechnology/stock-ui'

import { StockAlertBadges } from '@/components/stock/StockAlertBadges'
import { useStockEnabled } from '@/hooks/useStockEnabled'
import { StockTabs, type StockTabOption } from './StockTabs'

const STOCK_TAB = {
  INGREDIENTS: 'ingredients',
  LEVELS: 'levels',
  INVENTORY: 'inventory',
} as const
type StockTab = (typeof STOCK_TAB)[keyof typeof STOCK_TAB]

const INGREDIENTS_TAB: StockTabOption<StockTab> = { id: STOCK_TAB.INGREDIENTS, label: 'Insumos' }
const STOCK_TABS: readonly StockTabOption<StockTab>[] = [
  INGREDIENTS_TAB,
  { id: STOCK_TAB.LEVELS, label: 'Saldos' },
  { id: STOCK_TAB.INVENTORY, label: 'Inventário' },
]

export function StockPage() {
  const { isEnabled } = useStockEnabled()
  const [activeTab, setActiveTab] = useState<StockTab>(STOCK_TAB.INGREDIENTS)
  const tabs = isEnabled ? STOCK_TABS : [INGREDIENTS_TAB]
  const currentTab = isEnabled ? activeTab : STOCK_TAB.INGREDIENTS

  return (
    <div className="space-y-4 p-4 lg:p-6">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold text-gray-900">Insumos e estoque</h1>
        <StockAlertBadges />
      </header>
      <StockTabs tabs={tabs} activeTab={currentTab} onChange={setActiveTab} />
      {currentTab === STOCK_TAB.INGREDIENTS && (
        <IngredientsWorkspace
          {...(isEnabled
            ? {
                renderRowActions: (ingredient) => (
                  <IngredientStockButton ingredientId={ingredient.id} ingredientName={ingredient.name} />
                ),
              }
            : {})}
        />
      )}
      {currentTab === STOCK_TAB.LEVELS && <StockLevelsWorkspace />}
      {currentTab === STOCK_TAB.INVENTORY && <InventoryWorkspace />}
    </div>
  )
}
