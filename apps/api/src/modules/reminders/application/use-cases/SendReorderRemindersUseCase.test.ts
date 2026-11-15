import { describe, expect, it } from 'bun:test'
import { WindowExpiredError } from '@adatechnology/meta-whatsapp-contracts'

import type { SendBotTextParams } from '@/shared/providers/BotMessageProvider'
import type { ReminderRepository, ReorderCandidate } from '../ReminderRepository'
import { SendReorderRemindersUseCase } from './SendReorderRemindersUseCase'

const ESTABLISHMENT = { id: 'establishment-1', name: 'Yuyaki' }
// 11h em Brasília.
const AT_ELEVEN = new Date('2026-11-15T11:10:00-03:00')

const ANA: ReorderCandidate = {
  customerId: 'customer-ana',
  name: 'Ana Souza',
  whatsappNumber: '5516900000001',
  lastOrderAt: new Date('2026-10-31T20:00:00-03:00'),
  topItem: 'Temaki Salmão',
  previousMarketingAt: null,
}

const silentLogger = { info: () => undefined, warn: () => undefined }

function harness(params: {
  settings?: Record<string, unknown>
  candidates?: ReorderCandidate[]
  claimed?: boolean
  sendError?: Error
}) {
  const sent: SendBotTextParams[] = []
  const searches: Array<{ intervalDays: number; minGapDays: number }> = []
  const released: string[] = []
  const repository: ReminderRepository = {
    listEstablishments: async () => [ESTABLISHMENT],
    settingsFor: async () => params.settings ?? {},
    findReorderCandidates: async (search) => {
      searches.push({ intervalDays: search.intervalDays, minGapDays: search.minGapDays })
      return params.candidates ?? [ANA]
    },
    claimReorderReminder: async () => params.claimed ?? true,
    releaseReorderReminder: async ({ customerId }) => {
      released.push(customerId)
    },
    findReservationByBooking: async () => null,
  }
  const useCase = new SendReorderRemindersUseCase(
    repository,
    {
      sendText: async (message) => {
        if (params.sendError) throw params.sendError
        sent.push(message)
      },
    },
    silentLogger
  )
  return { useCase, sent, searches, released }
}

describe('SendReorderRemindersUseCase', () => {
  it('na hora configurada manda o lembrete com nome, dias e item, e o template de marketing para fora da janela', async () => {
    const { useCase, sent, searches } = harness({})

    const result = await useCase.execute({ now: AT_ELEVEN })

    expect(result.sent).toBe(1)
    expect(searches).toEqual([{ intervalDays: 15, minGapDays: 7 }])
    expect(sent).toHaveLength(1)
    expect(sent[0]?.whatsappNumber).toBe('5516900000001')
    expect(sent[0]?.body).toContain('*Ana*')
    expect(sent[0]?.body).toContain('*15 dias*')
    expect(sent[0]?.body).toContain('_Temaki Salmão_')
    expect(sent[0]?.outsideWindow).toEqual({
      template: expect.objectContaining({ defaultName: 'lembrete_pedido' }),
      parameters: ['Ana', '15', 'Temaki Salmão'],
    })
  })

  it('fora da hora configurada não procura ninguém', async () => {
    const { useCase, sent, searches } = harness({ settings: { reminder_send_hour: '19' } })

    const result = await useCase.execute({ now: AT_ELEVEN })

    expect(searches).toEqual([])
    expect(sent).toEqual([])
    expect(result.establishments).toEqual([{ id: ESTABLISHMENT.id, status: 'outside_send_hour', sent: 0 }])
  })

  it('intervalo 0 desliga o lembrete do restaurante', async () => {
    const { useCase, searches } = harness({ settings: { reminder_interval_days: 0 } })

    const result = await useCase.execute({ now: AT_ELEVEN })

    expect(searches).toEqual([])
    expect(result.establishments[0]?.status).toBe('disabled')
  })

  it('usa as configurações gravadas como texto e o texto próprio do restaurante', async () => {
    const { useCase, sent, searches } = harness({
      settings: {
        reminder_interval_days: '30',
        reminder_min_gap_days: '10',
        reminder_send_hour: 11,
        reminder_message_template: '{name}, {days} dias sem {last_item} no {establishment}!',
      },
    })

    await useCase.execute({ now: AT_ELEVEN })

    expect(searches).toEqual([{ intervalDays: 30, minGapDays: 10 }])
    expect(sent[0]?.body).toBe('Ana, 30 dias sem Temaki Salmão no Yuyaki!')
  })

  it('cliente sem nome cadastrado (o número no lugar) e pedido sem item', async () => {
    const { useCase, sent } = harness({
      candidates: [{ ...ANA, name: ANA.whatsappNumber, topItem: null }],
    })

    await useCase.execute({ now: AT_ELEVEN })

    expect(sent[0]?.outsideWindow?.parameters).toEqual(['cliente', '15', 'seu pedido'])
  })

  it('outra execução já marcou o cliente: não manda de novo', async () => {
    const { useCase, sent } = harness({ claimed: false })

    const result = await useCase.execute({ now: AT_ELEVEN })

    expect(sent).toEqual([])
    expect(result.skipped).toBe(1)
  })

  it('falha no envio desfaz a marcação e segue para o próximo', async () => {
    const { useCase, released } = harness({ sendError: new Error('meta fora do ar') })

    const result = await useCase.execute({ now: AT_ELEVEN })

    expect(result.failed).toBe(1)
    expect(released).toEqual([ANA.customerId])
  })

  it('fora da janela e sem template configurado: pula sem contar como falha', async () => {
    const { useCase, released } = harness({ sendError: new WindowExpiredError(30) })

    const result = await useCase.execute({ now: AT_ELEVEN })

    expect(result.skipped).toBe(1)
    expect(result.failed).toBe(0)
    expect(released).toEqual([ANA.customerId])
  })
})
