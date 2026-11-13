/**
 * Configuração de mensagens do WhatsApp: saudação/despedida e o template de reabertura da janela
 * de 24h.
 *
 * As mensagens vivem no `SettingsRepository` do @adatechnology/meta-whatsapp-module (tabela
 * `meta_whatsapp.settings`), por empresa — não em variável de ambiente: mudar o texto de boas-vindas
 * não deveria exigir deploy.
 *
 * Os templates vêm da Meta a cada leitura, e não de cópia local, porque quem aprova ou reprova é a
 * Meta: um cache aqui mostraria como disponível um template que já foi rejeitado.
 *
 * `companyId` **sempre** do JWT — nunca do corpo (OWASP API1).
 */

import { z } from 'zod'
import { WhatsAppTemplateProvider } from '@adatechnology/meta-whatsapp-provider'
import type { RouteHandler } from '@/infra/http/router'
import { ValidationError, UnauthorizedError } from '@/shared/errors/AppError'
import type { MetaWhatsAppModuleRegistry } from '../whatsapp/metaWhatsAppModule'

const MAX_MESSAGE_LENGTH = 4096

const saveSettingsSchema = z.object({
  welcomeMessage: z.string().max(MAX_MESSAGE_LENGTH).optional(),
  farewellMessage: z.string().max(MAX_MESSAGE_LENGTH).optional(),
  templateName: z.string().max(255).optional(),
  templateLanguage: z.string().max(20).optional(),
  templateVariables: z.array(z.string().max(255)).optional(),
})

const createTemplateSchema = z.object({
  name: z.string().min(1).max(255),
  category: z.enum(['UTILITY', 'MARKETING']),
  language: z.string().min(2).max(20),
  headerType: z.enum(['NONE', 'TEXT']),
  headerText: z.string().max(60).optional(),
  bodyText: z.string().min(1).max(1024),
  footerText: z.string().max(60).optional(),
})

export class WhatsAppSettingsController {
  constructor(
    private readonly modules: MetaWhatsAppModuleRegistry,
    private readonly templates: WhatsAppTemplateProvider
  ) {}

  private companyOf(request: Parameters<RouteHandler>[0]): string {
    if (!request.user) throw new UnauthorizedError()
    return request.user.establishmentId
  }

  get: RouteHandler = async (request, response) => {
    const companyId = this.companyOf(request)
    const settings = await this.modules.forEstablishment(companyId).settings.get(companyId)
    response.json(settings)
  }

  save: RouteHandler = async (request, response) => {
    const companyId = this.companyOf(request)
    const parsed = saveSettingsSchema.safeParse(request.body)
    if (!parsed.success) {
      throw new ValidationError('Validation failed', parsed.error.flatten().fieldErrors)
    }

    // `exactOptionalPropertyTypes`: chave presente com `undefined` não é o mesmo que ausente, e o
    // repositório trata ausência como "não mexer neste campo".
    const { welcomeMessage, farewellMessage, templateName, templateLanguage, templateVariables } =
      parsed.data

    const saved = await this.modules.forEstablishment(companyId).settings.save(companyId, {
      ...(welcomeMessage !== undefined ? { welcomeMessage } : {}),
      ...(farewellMessage !== undefined ? { farewellMessage } : {}),
      ...(templateName !== undefined ? { templateName } : {}),
      ...(templateLanguage !== undefined ? { templateLanguage } : {}),
      ...(templateVariables !== undefined ? { templateVariables } : {}),
    })

    response.json(saved)
  }

  listTemplates: RouteHandler = async (_request, response) => {
    const templates = await this.templates.listTemplates()
    response.json({ data: templates })
  }

  createTemplate: RouteHandler = async (request, response) => {
    const parsed = createTemplateSchema.safeParse(request.body)
    if (!parsed.success) {
      throw new ValidationError('Validation failed', parsed.error.flatten().fieldErrors)
    }

    const { headerText, footerText, ...template } = parsed.data
    const result = await this.templates.createTemplate({
      ...template,
      ...(headerText !== undefined ? { headerText } : {}),
      ...(footerText !== undefined ? { footerText } : {}),
    })
    response.json(result, 201)
  }
}
