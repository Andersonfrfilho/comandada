interface ScheduleStepProps {
  isScheduled: boolean
  scheduledFor: string
  onToggleScheduled: (value: boolean) => void
  onScheduledForChange: (value: string) => void
}

function toDateTimeLocalValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function ScheduleStep({
  isScheduled,
  scheduledFor,
  onToggleScheduled,
  onScheduledForChange,
}: ScheduleStepProps) {
  const minDateTime = toDateTimeLocalValue(new Date())

  return (
    <div className="p-6 space-y-6">
      <div>
        <p className="text-sm font-medium text-gray-700 mb-3">Quando o pedido deve ser preparado?</p>
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => onToggleScheduled(false)}
            className={`p-4 rounded-xl border-2 text-sm font-medium transition-all ${
              !isScheduled ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-gray-200 text-gray-600 hover:border-gray-300'
            }`}
          >
            <div className="text-2xl mb-1">⚡</div>
            Agora
          </button>
          <button
            onClick={() => onToggleScheduled(true)}
            className={`p-4 rounded-xl border-2 text-sm font-medium transition-all ${
              isScheduled ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-gray-200 text-gray-600 hover:border-gray-300'
            }`}
          >
            <div className="text-2xl mb-1">🗓️</div>
            Agendar
          </button>
        </div>
      </div>

      {isScheduled && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Data e hora</label>
          <input
            type="datetime-local"
            value={scheduledFor}
            min={minDateTime}
            onChange={(e) => onScheduledForChange(e.target.value)}
            className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
      )}
    </div>
  )
}
