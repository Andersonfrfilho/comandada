import { Check } from 'lucide-react'
import { ORDER_STATUS_LABELS, type OrderStatus } from '@/constants/orderLabels'

type OrderProgressType = 'table' | 'delivery' | 'pickup'

const STEPS_BY_TYPE: Record<OrderProgressType, OrderStatus[]> = {
  table: ['received', 'in_production', 'ready', 'completed'],
  delivery: ['received', 'in_production', 'ready', 'in_delivery', 'completed'],
  pickup: ['received', 'in_production', 'ready', 'picked_up', 'completed'],
}

interface OrderStatusLogEntry {
  status: OrderStatus
  createdAt: string
}

interface OrderProgressBarProps {
  type: string
  status: OrderStatus
  statusLogs?: OrderStatusLogEntry[]
  variant?: 'full' | 'compact'
}

function resolveSteps(type: string): OrderStatus[] {
  return STEPS_BY_TYPE[type as OrderProgressType] ?? STEPS_BY_TYPE.pickup
}

function findStepTime(statusLogs: OrderStatusLogEntry[] | undefined, step: OrderStatus): string | null {
  const log = statusLogs?.find((entry) => entry.status === step)
  if (!log) return null
  return new Date(log.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

export function OrderProgressBar({ type, status, statusLogs, variant = 'full' }: OrderProgressBarProps) {
  if (status === 'cancelled') return null

  const steps = resolveSteps(type)
  const currentIndex = Math.max(0, steps.indexOf(status))
  const progressPercent = steps.length > 1 ? (currentIndex / (steps.length - 1)) * 100 : 0

  if (variant === 'compact') {
    return (
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-brand-500 rounded-full transition-all duration-700 ease-out"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <span className="text-[11px] text-gray-400 flex-shrink-0">
          {ORDER_STATUS_LABELS[status]}
        </span>
      </div>
    )
  }

  return (
    <div className="flex items-start">
      {steps.map((step, index) => {
        const isCompleted = index < currentIndex
        const isCurrent = index === currentIndex
        const time = findStepTime(statusLogs, step)
        return (
          <div key={step} className="flex-1 flex flex-col items-center relative">
            {index > 0 && (
              <div
                className={`absolute top-3 left-[-50%] w-full h-0.5 -z-10 transition-colors duration-700 ${
                  isCompleted || isCurrent ? 'bg-brand-500' : 'bg-gray-200'
                }`}
              />
            )}
            <div
              className={`flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-bold flex-shrink-0 transition-colors duration-500 ${
                isCompleted
                  ? 'bg-brand-500 text-white'
                  : isCurrent
                    ? 'bg-brand-500 text-white animate-pulse ring-4 ring-brand-100'
                    : 'bg-gray-100 text-gray-400 border border-gray-300'
              }`}
            >
              {isCompleted ? <Check className="h-3.5 w-3.5" /> : index + 1}
            </div>
            <span
              className={`mt-1.5 text-[11px] text-center leading-tight px-1 ${
                isCurrent ? 'text-gray-900 font-semibold' : isCompleted ? 'text-gray-600' : 'text-gray-400'
              }`}
            >
              {ORDER_STATUS_LABELS[step]}
            </span>
            {time && <span className="text-[10px] text-gray-400">{time}</span>}
          </div>
        )
      })}
    </div>
  )
}
