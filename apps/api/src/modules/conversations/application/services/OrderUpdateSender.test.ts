import { describe, expect, it } from 'bun:test'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { WindowExpiredError } from '@adatechnology/meta-whatsapp-contracts'
import type * as schema from '@/infra/database/schema'
import { OrderUpdateSender } from './OrderUpdateSender'

type Database = NodePgDatabase<typeof schema>

function harness(settings: Array<{ key: string; value: unknown }>, textError?: Error) {
  const sent: Array<{ kind: string; name?: string; parameters?: string[] }> = []
  const database = { query: { settings: { findMany: async () => settings } } } as unknown as Database
  const sender = new OrderUpdateSender(database, () => ({
    sendText: async () => {
      if (textError) throw textError
      sent.push({ kind: 'text' })
    },
    sendTemplate: async (params) => {
      sent.push({ kind: 'template', name: params.templateName, parameters: params.bodyParameters ?? [] })
    },
  }))
  return { sender, sent }
}

const message = {
  establishmentId: 'establishment-1',
  whatsappNumber: '5511999999999',
  body: '🛵 *Saiu para entrega!*\n\nSeu pedido...',
  sender: 'bot' as const,
  outsideWindow: { parameters: ['PED-1', 'Ele saiu para entrega\ne já está a caminho!'] },
}

describe('OrderUpdateSender', () => {
  it('dentro da janela manda o texto normal', async () => {
    const { sender, sent } = harness([])
    await sender.send(message)
    expect(sent).toEqual([{ kind: 'text' }])
  })

  it('fora da janela manda o template, com os parâmetros em uma linha', async () => {
    const { sender, sent } = harness([], new WindowExpiredError(30))
    await sender.send(message)
    expect(sent).toEqual([
      { kind: 'template', name: 'atualizacao_pedido', parameters: ['PED-1', 'Ele saiu para entrega e já está a caminho!'] },
    ])
  })

  it('template desligado nas configurações: o erro da janela continua', async () => {
    const { sender } = harness([{ key: 'whatsapp_order_update_template', value: '' }], new WindowExpiredError(30))
    await expect(sender.send(message)).rejects.toThrow()
  })
})
