/**
 * Webhook da Meta Cloud API servido pelo @adatechnology/meta-whatsapp-module.
 *
 * A verificação de assinatura e a guarda de replay são do pacote: ele confere o HMAC contra o
 * **app secret** (não o access token) e reivindica a entrega num nonce store atômico, sem a janela
 * de corrida do `exists`-depois-`set` que existia aqui antes.
 */

import type { RouteHandler } from '@/infra/http/router'
import { ValidationError } from '@/shared/errors/AppError'
import type { MetaWhatsAppModuleRegistry } from '@/modules/conversations/infra/whatsapp/metaWhatsAppModule'

export class WebhookController {
  constructor(private readonly modules: MetaWhatsAppModuleRegistry) {}

  // GET /webhook — hub.challenge da Meta
  verify: RouteHandler = async (request, response) => {
    const challenge = this.modules.verifyChallenge({
      mode: request.query['hub.mode'] ?? null,
      token: request.query['hub.verify_token'] ?? null,
      challenge: request.query['hub.challenge'] ?? null,
    })
    // A Meta compara o corpo com o challenge literal: em JSON ele sairia entre aspas e o
    // handshake falharia.
    response.binary(Buffer.from(challenge, 'utf-8'), 'text/plain; charset=utf-8')
  }

  // POST /webhook/:establishmentId — mensagens e status recebidos
  receive: RouteHandler = async (request, response) => {
    const establishmentId = request.params['establishmentId']
    if (!establishmentId) throw new ValidationError('establishmentId is required')

    const result = await this.modules.forEstablishment(establishmentId).webhook.receive.execute({
      companyId: establishmentId,
      rawBody: request.rawBody,
      signatureHeader: request.headers['x-hub-signature-256'],
    })

    response.json({ status: 'ok', ...result })
  }
}
