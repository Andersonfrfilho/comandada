import type { SelectInputProps } from '@adatechnology/recipes-ui'

import { Select } from '@/components/ui/Select'

/** Troca o seletor do pacote pelo menu de seleção do painel, com o rótulo em cima como nos outros campos. */
export function RecipesSelectField({ id, label, value, options, onChange }: SelectInputProps) {
  const selectOptions = options.map((option) => ({ value: option.id, label: option.label }))

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-gray-700">
        {label}
      </label>
      <Select id={id} ariaLabel={label} title={label} value={value} options={selectOptions} onChange={onChange} />
    </div>
  )
}
