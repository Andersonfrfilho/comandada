export type StockTabOption<TTab extends string> = {
  readonly id: TTab
  readonly label: string
}

type StockTabsProps<TTab extends string> = {
  readonly tabs: readonly StockTabOption<TTab>[]
  readonly activeTab: TTab
  readonly onChange: (tab: TTab) => void
}

export function StockTabs<TTab extends string>({ tabs, activeTab, onChange }: StockTabsProps<TTab>) {
  return (
    <div role="tablist" className="flex gap-1 overflow-x-auto border-b border-gray-200">
      {tabs.map((tab) => {
        const isActive = tab.id === activeTab
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab.id)}
            className={`min-h-[44px] shrink-0 border-b-2 px-4 text-sm font-semibold transition-colors ${
              isActive ? 'border-brand-600 text-brand-700' : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}
