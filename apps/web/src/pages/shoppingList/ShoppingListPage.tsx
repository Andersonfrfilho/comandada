import { useMemo } from 'react'
import { ShoppingListWorkspace } from '@adatechnology/recipes-ui'

import { usePlannedItemsSources } from '@/hooks/usePlannedItemsSources'
import { useCatalogData } from '@/pages/catalog/catalogShared'

export function ShoppingListPage() {
  const { products } = useCatalogData()
  const plannedItemsSources = usePlannedItemsSources()
  const productOptions = useMemo(
    () => products.filter((product) => product.active).map((product) => ({ id: product.id, name: product.name })),
    [products]
  )

  return (
    <div className="p-4 lg:p-6">
      <ShoppingListWorkspace products={productOptions} plannedItemsSources={plannedItemsSources} />
    </div>
  )
}
