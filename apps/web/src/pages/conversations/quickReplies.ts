/**
 * Mensagens prontas do atendimento. A copy é do produto, não do pacote: o SDK sabe desenhar o chip
 * e interpolar `{{variavel}}`, mas o que se diz ao cliente é decisão de quem opera o restaurante.
 *
 * `{{nome}}` some quando o contato ainda não informou o nome — daí "Olá!" em vez de "Olá {{nome}}!".
 */

import type { QuickReply } from '@adatechnology/conversations-ui'

export const CONVERSATION_QUICK_REPLIES: readonly QuickReply[] = [
  { key: 'greeting', label: '👋 Saudação', text: 'Olá {{nome}}! Como posso ajudar?' },
  { key: 'on-the-way', label: '🛵 A caminho', text: 'Seu pedido já saiu para entrega, {{nome}}! 🛵' },
  { key: 'ready', label: '🎉 Pronto', text: 'Seu pedido está pronto para retirada! 🎉' },
  { key: 'address', label: '📍 Endereço', text: 'Pode confirmar o endereço completo para a entrega?' },
  { key: 'payment', label: '💳 Pagamento', text: 'Aceitamos Pix, cartão e dinheiro. Qual a forma de pagamento?' },
  { key: 'missing', label: '📦 Em falta', text: 'Esse item acabou hoje. Quer que eu sugira um parecido?' },
  { key: 'thanks', label: '🙏 Agradecimento', text: 'Obrigado pela preferência, {{nome}}! Até a próxima 😊' },
]

/** Só o primeiro nome: "Olá Marina Alves!" soa como cobrança, "Olá Marina!" soa como atendimento. */
export function quickReplyVariablesFor(clientName?: string): Record<string, string> {
  return { nome: clientName?.trim().split(' ')[0] ?? '' }
}
