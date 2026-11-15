import type { BotMessageProvider } from '@/shared/providers/BotMessageProvider'
import { isWindowExpired } from '@/modules/conversations/application/services/OrderUpdateSender'
import { AGENDA_TIMEZONE } from '@/modules/agenda/shared/agenda.constant'
import type { ReminderRepository, ReorderCandidate } from '../ReminderRepository'
import { firstNameOf, settingNumber, settingText } from '../reminderText'
import {
  REORDER_REMINDER_DEFAULT_MESSAGE,
  REORDER_REMINDER_DEFAULTS,
  REORDER_REMINDER_SETTINGS,
  REORDER_REMINDER_TEMPLATE,
} from '../../shared/reminders.constant'

export interface ReorderRemindersResult {
  readonly sent: number
  readonly skipped: number
  readonly failed: number
  readonly establishments: ReadonlyArray<{ id: string; status: 'disabled' | 'outside_send_hour' | 'ran'; sent: number }>
}

const LOCAL_HOUR_FORMAT = new Intl.DateTimeFormat('en-GB', { timeZone: AGENDA_TIMEZONE, hour: '2-digit', hourCycle: 'h23' })

type Logger = Pick<Console, 'info' | 'warn'>

/**
 * Lembrete "faz X dias que você pediu" (antigo workflow 04, que lia `orders.customer_phone`). O n8n
 * chama a cada hora; cada restaurante só envia na hora configurada, e o `last_marketing_at` do cliente
 * impede um segundo lembrete dentro do intervalo mínimo, mesmo com duas execuções ao mesmo tempo.
 */
export class SendReorderRemindersUseCase {
  constructor(
    private readonly repository: ReminderRepository,
    private readonly messages: BotMessageProvider,
    private readonly logger: Logger = console
  ) {}

  async execute(params: { now?: Date } = {}): Promise<ReorderRemindersResult> {
    const now = params.now ?? new Date()
    const currentHour = Number(LOCAL_HOUR_FORMAT.format(now))
    const totals = { sent: 0, skipped: 0, failed: 0 }
    const establishments: Array<ReorderRemindersResult['establishments'][number]> = []

    for (const establishment of await this.repository.listEstablishments()) {
      const settings = await this.repository.settingsFor(establishment.id)
      const intervalDays = settingNumber(
        settings[REORDER_REMINDER_SETTINGS.intervalDaysKey],
        REORDER_REMINDER_DEFAULTS.intervalDays
      )
      if (intervalDays <= 0) {
        establishments.push({ id: establishment.id, status: 'disabled', sent: 0 })
        continue
      }
      const sendHour = settingNumber(settings[REORDER_REMINDER_SETTINGS.sendHourKey], REORDER_REMINDER_DEFAULTS.sendHour)
      if (sendHour !== currentHour) {
        establishments.push({ id: establishment.id, status: 'outside_send_hour', sent: 0 })
        continue
      }
      const minGapDays = Math.max(
        0,
        settingNumber(settings[REORDER_REMINDER_SETTINGS.minGapDaysKey], REORDER_REMINDER_DEFAULTS.minGapDays)
      )
      const candidates = await this.repository.findReorderCandidates({
        establishmentId: establishment.id,
        intervalDays,
        minGapDays,
        now,
        limit: REORDER_REMINDER_DEFAULTS.batchLimit,
      })
      const messageTemplate = settingText(settings[REORDER_REMINDER_SETTINGS.messageTemplateKey]) ?? REORDER_REMINDER_DEFAULT_MESSAGE

      let sentHere = 0
      for (const candidate of candidates) {
        const outcome = await this.remind({
          establishmentId: establishment.id,
          establishmentName: establishment.name,
          candidate,
          intervalDays,
          minGapDays,
          messageTemplate,
          now,
        })
        totals[outcome] += 1
        if (outcome === 'sent') sentHere += 1
      }
      establishments.push({ id: establishment.id, status: 'ran', sent: sentHere })
    }

    this.logger.info(`[lembretes] pedido: ${totals.sent} enviado(s), ${totals.skipped} pulado(s), ${totals.failed} falha(s)`)
    return { ...totals, establishments }
  }

  private async remind(params: {
    establishmentId: string
    establishmentName: string
    candidate: ReorderCandidate
    intervalDays: number
    minGapDays: number
    messageTemplate: string
    now: Date
  }): Promise<'sent' | 'skipped' | 'failed'> {
    const { candidate } = params
    const claimed = await this.repository.claimReorderReminder({
      customerId: candidate.customerId,
      minGapDays: params.minGapDays,
      now: params.now,
    })
    if (!claimed) return 'skipped'

    const firstName = firstNameOf(candidate.name, candidate.whatsappNumber)
    const lastItem = candidate.topItem ?? 'seu pedido'
    const body = params.messageTemplate
      .replaceAll('{name}', firstName || 'cliente')
      .replaceAll('{days}', String(params.intervalDays))
      .replaceAll('{last_item}', lastItem)
      .replaceAll('{establishment}', params.establishmentName)
    try {
      await this.messages.sendText({
        establishmentId: params.establishmentId,
        whatsappNumber: candidate.whatsappNumber,
        body,
        outsideWindow: {
          template: REORDER_REMINDER_TEMPLATE,
          parameters: [firstName || 'cliente', String(params.intervalDays), lastItem],
        },
      })
      return 'sent'
    } catch (error) {
      await this.repository.releaseReorderReminder({
        customerId: candidate.customerId,
        previousMarketingAt: candidate.previousMarketingAt,
      })
      // Template desligado nas Configurações: sem como falar fora da janela, este lembrete fica para trás.
      if (isWindowExpired(error)) return 'skipped'
      this.logger.warn(`[lembretes] pedido: falha ao enviar para o cliente ${candidate.customerId}: ${(error as Error).message}`)
      return 'failed'
    }
  }
}
