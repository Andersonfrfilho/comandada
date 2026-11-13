/**
 * Configuração das mensagens do WhatsApp: saudação/despedida e o template que reabre a janela de
 * 24h.
 *
 * A tela é o `MessagesWorkspace` do @adatechnology/conversations-ui — abas, estado, salvamento e
 * formulários vêm de lá, iguais aos outros produtos. Aqui fica só o mapeamento das rotas. A aba de
 * transcrição não aparece porque não há `getTranscription`: não existe engine de transcrição neste
 * deploy, e um interruptor que não transcreve nada é pior que a ausência dele.
 */

import '@adatechnology/conversations-ui/styles.css'
import { MessagesWorkspace, type MessagesWorkspaceApi } from '@adatechnology/conversations-ui'
import {
  createWhatsAppTemplate,
  fetchWhatsAppSettings,
  fetchWhatsAppTemplates,
  saveWhatsAppSettings,
} from '@/lib/whatsappSettingsApi'

const WELCOME_PLACEHOLDERS = ['{{nome}}', '{{estabelecimento}}'] as const

const MESSAGES_API: MessagesWorkspaceApi = {
  getMessages: async () => {
    const settings = await fetchWhatsAppSettings()
    return { welcomeMessage: settings.welcomeMessage, farewellMessage: settings.farewellMessage }
  },
  saveMessages: async (messages) => {
    await saveWhatsAppSettings(messages)
  },
  getTemplateSettings: async () => {
    const settings = await fetchWhatsAppSettings()
    return {
      templateName: settings.templateName,
      templateLanguage: settings.templateLanguage,
      variables: settings.templateVariables,
    }
  },
  saveTemplateSettings: async ({ templateName, templateLanguage, variables }) => {
    await saveWhatsAppSettings({ templateName, templateLanguage, templateVariables: variables })
  },
  listTemplates: fetchWhatsAppTemplates,
  createTemplate: async (draft) => {
    const created = await createWhatsAppTemplate({
      name: draft.name,
      category: draft.category === 'MARKETING' ? 'MARKETING' : 'UTILITY',
      language: draft.language,
      headerType: draft.headerType,
      ...(draft.headerType === 'TEXT' && draft.headerText ? { headerText: draft.headerText } : {}),
      bodyText: draft.bodyText,
      ...(draft.footerText ? { footerText: draft.footerText } : {}),
    })
    return {
      ok: true,
      message: `Template enviado para aprovação da Meta (${created.shortId}).`,
      status: created.status,
    }
  },
}

const MESSAGES_LABELS = {
  subtitle: 'Textos automáticos do atendimento e templates aprovados pela Meta.',
  tabBot: 'Saudação e despedida',
  tabTemplates: 'Templates',
}

export function MessagesPage() {
  return (
    <MessagesWorkspace
      api={MESSAGES_API}
      labels={MESSAGES_LABELS}
      welcomePlaceholders={WELCOME_PLACEHOLDERS}
      className="p-6"
    />
  )
}
