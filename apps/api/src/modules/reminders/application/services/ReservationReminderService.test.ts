import { describe, expect, it } from 'bun:test'
import { WindowExpiredError } from '@adatechnology/meta-whatsapp-contracts'

import type { SendBotTextParams } from '@/shared/providers/BotMessageProvider'
import type { ReminderRepository, ReservationForReminder } from '../ReminderRepository'
import { describeWhen, ReservationReminderService } from './ReservationReminderService'

const NOW = new Date('2026-11-15T20:05:00-03:00')

const RESERVATION: ReservationForReminder = {
  code: 'RES-1234',
  partySize: 4,
  startsAt: new Date('2026-11-16T20:00:00-03:00'),
  createdAt: new Date('2026-11-12T10:00:00-03:00'),
  customerName: 'Ana Souza',
  whatsappNumber: '5516900000001',
}

const silentLogger = { info: () => undefined, warn: () => undefined }

function harness(reservation: ReservationForReminder | null, sendError?: Error) {
  const sent: SendBotTextParams[] = []
  const repository = {
    findReservationByBooking: async () => reservation,
  } as unknown as ReminderRepository
  const service = new ReservationReminderService(
    repository,
    {
      sendText: async (message) => {
        if (sendError) throw sendError
        sent.push(message)
      },
    },
    () => NOW,
    silentLogger
  )
  return { service, sent }
}

const event = { companyId: 'establishment-1', bookingId: 'booking-1' }

describe('ReservationReminderService', () => {
  it('lembra a reserva de amanhã pelo número do cliente vinculado, com o template de reserva', async () => {
    const { service, sent } = harness(RESERVATION)

    expect(await service.handle(event)).toBe('sent')
    expect(sent).toHaveLength(1)
    expect(sent[0]?.whatsappNumber).toBe('5516900000001')
    expect(sent[0]?.body).toContain('*4 pessoas*')
    expect(sent[0]?.body).toContain('*amanhã às 20:00*')
    expect(sent[0]?.body).toContain('RES-1234')
    expect(sent[0]?.outsideWindow).toEqual({
      template: expect.objectContaining({ defaultName: 'lembrete_reserva' }),
      parameters: ['Ana', 'RES-1234', '4', 'amanhã às 20:00'],
    })
  })

  it('booking que não é reserva de mesa (encomenda) é ignorado', async () => {
    const { service, sent } = harness(null)
    expect(await service.handle(event)).toBe('skipped')
    expect(sent).toEqual([])
  })

  it('reserva feita agora há pouco não recebe lembrete', async () => {
    const { service, sent } = harness({ ...RESERVATION, createdAt: new Date(NOW.getTime() - 30 * 60 * 1000) })
    expect(await service.handle(event)).toBe('skipped')
    expect(sent).toEqual([])
  })

  it('fora da janela sem template: não tenta de novo', async () => {
    const { service } = harness(RESERVATION, new WindowExpiredError(30))
    expect(await service.handle(event)).toBe('skipped')
  })

  it('outro erro sobe, para a agenda devolver a reserva à próxima varredura', async () => {
    const { service } = harness(RESERVATION, new Error('meta fora do ar'))
    await expect(service.handle(event)).rejects.toThrow('meta fora do ar')
  })
})

describe('describeWhen', () => {
  it('fala hoje, amanhã ou a data, no fuso de Brasília', () => {
    expect(describeWhen(new Date('2026-11-15T21:30:00-03:00'), NOW)).toBe('hoje às 21:30')
    // 01h UTC do dia 17 ainda é dia 16 em Brasília.
    expect(describeWhen(new Date('2026-11-16T22:00:00-03:00'), NOW)).toBe('amanhã às 22:00')
    expect(describeWhen(new Date('2026-11-21T19:00:00-03:00'), NOW)).toBe('em 21/11 às 19:00')
  })
})
