import { describe, expect, it } from 'bun:test'
import { createHmac } from 'node:crypto'

import { SendPreviewInboundUseCase } from './SendPreviewInbound.use-case'
import { ConversationPreviewDisabledError } from '../shared/ConversationPreview.error'
import { PREVIEW_INBOUND_KIND } from '../shared/ConversationPreview.constant'
import type { MetaWhatsAppModuleRegistry } from '@/modules/conversations/infra/whatsapp/metaWhatsAppModule'

const APP_SECRET = 'segredo-de-teste'
const COMPANY_ID = '11111111-1111-4111-8111-111111111111'

type Received = { companyId: string; rawBody: Buffer; signatureHeader?: string | undefined }

function createRegistrySpy(): { registry: MetaWhatsAppModuleRegistry; calls: Received[] } {
  const calls: Received[] = []
  const registry = {
    forEstablishment: () => ({
      webhook: {
        receive: {
          execute: async (params: Received) => {
            calls.push(params)
          },
        },
      },
    }),
    verifyChallenge: () => '',
  } as unknown as MetaWhatsAppModuleRegistry

  return { registry, calls }
}

describe('SendPreviewInboundUseCase', () => {
  it('assina o corpo com o app secret, para o webhook aceitar sem bypass da verificação', async () => {
    const { registry, calls } = createRegistrySpy()
    const useCase = new SendPreviewInboundUseCase(registry, APP_SECRET, true)

    await useCase.execute({
      companyId: COMPANY_ID,
      command: { kind: PREVIEW_INBOUND_KIND.TEXT, from: '5511900000042', text: 'oi' },
    })

    const [call] = calls
    expect(call).toBeDefined()
    const expected = `sha256=${createHmac('sha256', APP_SECRET).update(call!.rawBody).digest('hex')}`
    expect(call!.signatureHeader).toBe(expected)
  })

  it('usa o tenant recebido do contexto autenticado, e não algo vindo do corpo', async () => {
    const { registry, calls } = createRegistrySpy()
    const useCase = new SendPreviewInboundUseCase(registry, APP_SECRET, true)

    await useCase.execute({
      companyId: COMPANY_ID,
      command: { kind: PREVIEW_INBOUND_KIND.TEXT, from: '5511900000042', text: 'oi' },
    })

    expect(calls[0]!.companyId).toBe(COMPANY_ID)
  })

  it('recusa quando o ambiente não habilitou o simulador', async () => {
    const { registry, calls } = createRegistrySpy()
    const useCase = new SendPreviewInboundUseCase(registry, APP_SECRET, false)

    await expect(
      useCase.execute({
        companyId: COMPANY_ID,
        command: { kind: PREVIEW_INBOUND_KIND.TEXT, from: '5511900000042', text: 'oi' },
      })
    ).rejects.toBeInstanceOf(ConversationPreviewDisabledError)
    expect(calls).toHaveLength(0)
  })

  it('recusa quando o app secret não está configurado — sem ele não há assinatura válida', async () => {
    const { registry } = createRegistrySpy()
    const useCase = new SendPreviewInboundUseCase(registry, undefined, true)

    await expect(
      useCase.execute({
        companyId: COMPANY_ID,
        command: { kind: PREVIEW_INBOUND_KIND.TEXT, from: '5511900000042', text: 'oi' },
      })
    ).rejects.toBeInstanceOf(ConversationPreviewDisabledError)
  })

  it('monta resposta de botão como interativo, e não como texto solto', async () => {
    const { registry, calls } = createRegistrySpy()
    const useCase = new SendPreviewInboundUseCase(registry, APP_SECRET, true)

    await useCase.execute({
      companyId: COMPANY_ID,
      command: {
        kind: PREVIEW_INBOUND_KIND.BUTTON_REPLY,
        from: '5511900000042',
        reply: { id: 'cardapio', title: 'Cardápio' },
      },
    })

    expect(calls[0]!.rawBody.toString()).toContain('button_reply')
  })
})
