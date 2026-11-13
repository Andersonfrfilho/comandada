/**
 * Configuração de mensagens do WhatsApp: saudação/despedida e o template de reabertura da janela
 * de 24h. Contrapartida de `/whatsapp/settings` e `/whatsapp/templates` na API.
 *
 * Os tipos são os do @adatechnology/meta-whatsapp-contracts, que é o mesmo vocabulário que os
 * formulários do conversations-ui consomem — não há tradução de campos a fazer.
 */

import type { WhatsAppTemplateSummary } from '@adatechnology/conversations-ui'
import { useAuthStore } from '@/stores/authStore'
import { api } from '@/lib/api'

export interface WhatsAppSettings {
  templateName: string
  templateLanguage: string
  templateVariables: string[]
  welcomeMessage: string
  farewellMessage: string
}

export interface CreateWhatsAppTemplateInput {
  name: string
  category: 'UTILITY' | 'MARKETING'
  language: string
  headerType: 'NONE' | 'TEXT'
  headerText?: string
  bodyText: string
  footerText?: string
}

export interface CreateWhatsAppTemplateResult {
  id?: string
  shortId: string
  status: string
}

function accessToken(): string | undefined {
  return useAuthStore.getState().accessToken ?? undefined
}

export async function fetchWhatsAppSettings(): Promise<WhatsAppSettings> {
  return api.get<WhatsAppSettings>('/whatsapp/settings', accessToken())
}

export async function saveWhatsAppSettings(
  update: Partial<WhatsAppSettings>
): Promise<WhatsAppSettings> {
  return api.put<WhatsAppSettings>('/whatsapp/settings', update, accessToken())
}

export async function fetchWhatsAppTemplates(): Promise<WhatsAppTemplateSummary[]> {
  const response = await api.get<{ data: WhatsAppTemplateSummary[] }>(
    '/whatsapp/templates',
    accessToken()
  )
  return response.data
}

export async function createWhatsAppTemplate(
  input: CreateWhatsAppTemplateInput
): Promise<CreateWhatsAppTemplateResult> {
  return api.post<CreateWhatsAppTemplateResult>('/whatsapp/templates', input, accessToken())
}
