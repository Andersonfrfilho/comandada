import { Check } from 'lucide-react'
import { ORDER_STATUS_LABELS, type OrderStatus } from '@/constants/orderLabels'

type OrderProgressType = 'table' | 'delivery' | 'pickup'

export const STEPS_BY_TYPE: Record<OrderProgressType, OrderStatus[]> = {
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

export function resolveSteps(type: string): OrderStatus[] {
  return STEPS_BY_TYPE[type as OrderProgressType] ?? STEPS_BY_TYPE.pickup
}

function findStepTime(statusLogs: OrderStatusLogEntry[] | undefined, step: OrderStatus): string | null {
  // Depois de uma correção manual o status pode aparecer duas vezes: vale a última vez.
  const log = [...(statusLogs ?? [])].reverse().find((entry) => entry.status === step)
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

  // `isolate` cria o contexto de empilhamento: sem ele a linha (-z-10) ia para trás do fundo branco do card
  // e o stepper aparecia só como números soltos.
  return (
    <ol className="flex items-start isolate" aria-label="Andamento do pedido">
      {steps.map((step, index) => {
        const isCompleted = index < currentIndex
        const isCurrent = index === currentIndex
        const time = findStepTime(statusLogs, step)
        return (
          <li
            key={step}
            className="flex-1 flex flex-col items-center relative min-w-0"
            aria-current={isCurrent ? 'step' : undefined}
          >
            {index > 0 && (
              <div
                className={`absolute top-4 left-[-50%] w-full h-1 -z-10 rounded-full transition-colors duration-700 ${
                  isCompleted || isCurrent ? 'bg-brand-500' : 'bg-gray-200'
                }`}
              />
            )}
            <div
              className={`flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold flex-shrink-0 transition-colors duration-500 ${
                isCompleted
                  ? 'bg-brand-500 text-white'
                  : isCurrent
                    ? 'bg-brand-600 text-white ring-4 ring-brand-100 shadow-sm'
                    : 'bg-white text-gray-400 border-2 border-gray-200'
              }`}
            >
              {isCompleted ? <Check className="h-4 w-4" strokeWidth={3} /> : index + 1}
            </div>
            <span
              className={`mt-2 text-[11px] sm:text-xs text-center leading-tight px-0.5 ${
                isCurrent ? 'text-brand-700 font-semibold' : isCompleted ? 'text-gray-700 font-medium' : 'text-gray-400'
              }`}
            >
              {ORDER_STATUS_LABELS[step]}
            </span>
            {time ? (
              <span className={`text-[10px] sm:text-[11px] ${isCurrent ? 'text-brand-600' : 'text-gray-400'}`}>{time}</span>
            ) : (
              isCurrent && <span className="text-[10px] sm:text-[11px] text-brand-600">agora</span>
            )}
          </li>
        )
      })}
    </ol>
  )
}
