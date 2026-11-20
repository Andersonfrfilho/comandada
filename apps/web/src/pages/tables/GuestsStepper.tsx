import { Minus, Plus } from 'lucide-react'

interface GuestsStepperProps {
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  disabled?: boolean
  size?: 'sm' | 'md'
}

/** − 3 + para dizer quantas pessoas estão na mesa (abrir comanda e card da mesa). */
export function GuestsStepper({ value, onChange, min = 1, max = 50, disabled = false, size = 'sm' }: GuestsStepperProps) {
  const buttonSize = size === 'sm' ? 'h-7 w-7' : 'h-10 w-10'
  const iconSize = size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4'
  const button = `${buttonSize} inline-flex items-center justify-center rounded-full border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 active:scale-95 transition disabled:opacity-40 disabled:cursor-not-allowed`
  return (
    <div className="inline-flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={disabled || value <= min}
        aria-label="Uma pessoa a menos"
        className={button}
      >
        <Minus className={iconSize} />
      </button>
      <span
        className={`${size === 'sm' ? 'min-w-[1.25rem] text-sm' : 'min-w-[2rem] text-xl'} text-center font-bold tabular-nums text-gray-900`}
        aria-live="polite"
      >
        {value}
      </span>
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={disabled || value >= max}
        aria-label="Uma pessoa a mais"
        className={button}
      >
        <Plus className={iconSize} />
      </button>
    </div>
  )
}
