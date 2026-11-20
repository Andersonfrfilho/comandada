// Regras puras do Select (sem React), para testar sem navegador.

export type SelectOptionLike = {
  readonly value: string
  readonly label: string
  readonly disabled?: boolean
}

// Texto do botão: nada escolhido → placeholder; até 2 → nomes; mais → "Primeiro +N".
export function selectTriggerLabel(
  options: readonly SelectOptionLike[],
  selectedValues: readonly string[],
  placeholder: string,
): { readonly text: string; readonly isPlaceholder: boolean } {
  const labels = options.filter((option) => selectedValues.includes(option.value)).map((option) => option.label)
  if (labels.length === 0) return { text: placeholder, isPlaceholder: true }
  if (labels.length <= 2) return { text: labels.join(', '), isPlaceholder: false }
  return { text: `${labels[0]} +${labels.length - 1}`, isPlaceholder: false }
}

function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}

export function filterSelectOptions<TOption extends SelectOptionLike>(
  options: readonly TOption[],
  searchTerm: string,
): readonly TOption[] {
  const term = normalize(searchTerm)
  if (term.length === 0) return options
  return options.filter((option) => normalize(option.label).includes(term))
}

// Próxima opção habilitada a partir de `from` andando `step` (1 ou -1); fica no lugar se não houver.
export function nextEnabledIndex(options: readonly SelectOptionLike[], from: number, step: 1 | -1): number {
  for (let index = from + step; index >= 0 && index < options.length; index += step) {
    if (!options[index]?.disabled) return index
  }
  return from
}

export function firstEnabledIndex(options: readonly SelectOptionLike[]): number {
  return nextEnabledIndex(options, -1, 1)
}

export function lastEnabledIndex(options: readonly SelectOptionLike[]): number {
  return nextEnabledIndex(options, options.length, -1)
}

// Digitar com a lista aberta pula para a primeira opção que começa com o texto.
export function typeaheadIndex(options: readonly SelectOptionLike[], typed: string, from: number): number {
  const term = normalize(typed)
  if (term.length === 0) return from
  const total = options.length
  for (let offset = 1; offset <= total; offset += 1) {
    const index = (from + offset) % total
    const option = options[index]
    if (option && !option.disabled && normalize(option.label).startsWith(term)) return index
  }
  return from
}

export type PopoverPlacement = {
  readonly top: number
  readonly left: number
  readonly width: number
  readonly maxHeight: number
  readonly openUpward: boolean
}

const VIEWPORT_MARGIN = 8
const GAP = 6
const MIN_WIDTH = 200
const PREFERRED_MAX_HEIGHT = 320

// Lista abaixo do botão; sem espaço embaixo e com mais em cima, abre para cima. Nunca sai da tela.
export function popoverPlacement(
  trigger: { readonly top: number; readonly bottom: number; readonly left: number; readonly width: number },
  viewport: { readonly width: number; readonly height: number },
): PopoverPlacement {
  const width = Math.min(Math.max(trigger.width, MIN_WIDTH), viewport.width - VIEWPORT_MARGIN * 2)
  const left = Math.min(Math.max(trigger.left, VIEWPORT_MARGIN), viewport.width - VIEWPORT_MARGIN - width)
  const spaceBelow = viewport.height - trigger.bottom - GAP - VIEWPORT_MARGIN
  const spaceAbove = trigger.top - GAP - VIEWPORT_MARGIN
  const openUpward = spaceBelow < Math.min(PREFERRED_MAX_HEIGHT, 200) && spaceAbove > spaceBelow
  const available = openUpward ? spaceAbove : spaceBelow
  const maxHeight = Math.max(Math.min(PREFERRED_MAX_HEIGHT, available), 120)
  const top = openUpward ? trigger.top - GAP : trigger.bottom + GAP
  return { top, left, width, maxHeight, openUpward }
}
