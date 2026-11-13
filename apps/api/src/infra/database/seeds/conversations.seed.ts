/**
 * Conversas de WhatsApp para o painel de atendimento nascer com histórico.
 *
 * O schema é do @adatechnology/meta-whatsapp-module (`meta_whatsapp.*`), e o pacote não traz
 * seeders — nem deveria: quantas conversas, em que estado e com quais números é decisão de
 * produto. O que ele expõe são os use cases, e é por eles que este seed escreve, como manda a
 * regra de não inserir direto na tabela.
 *
 * Uma das conversas fica aguardando atendente e outra já em modo humano: sem isso o filtro
 * "aguardando humano" e o botão de liberar nascem sem nada para exercitar.
 */

import {
  LogMessageUseCase,
  MessageRepository,
  SessionRepository,
  type MetaWhatsAppDatabase,
} from '@adatechnology/meta-whatsapp-module'

import { db } from '../connection'
import { brazilianWhatsappNumber, faker } from './helpers/seed-helpers'

const START_STATE = 'idle'
const CONVERSATION_COUNT = 4
const MESSAGES_PER_CONVERSATION = 6

const CUSTOMER_LINES = [
  'Oi, boa noite! Vocês estão entregando ainda?',
  'Queria pedir duas pizzas grandes',
  'Uma de calabresa e outra de portuguesa',
  'Consigo pagar no pix?',
  'Fechado, pode mandar',
  'Obrigado!',
] as const

const AGENT_LINES = [
  'Boa noite! Estamos sim, até as 23h',
  'Claro! Qual sabor você prefere?',
  'Anotado: uma calabresa e uma portuguesa',
  'Consegue sim, mando a chave logo depois de confirmar',
  'Pedido confirmado, sai em aproximadamente 40 minutos',
  'Nós que agradecemos!',
] as const

export async function seedConversations(establishmentId: string, agentUserId: string): Promise<void> {
  const database = db as unknown as MetaWhatsAppDatabase
  const sessionRepository = new SessionRepository(database)
  const logMessage = new LogMessageUseCase(sessionRepository, new MessageRepository(database))

  for (let index = 0; index < CONVERSATION_COUNT; index += 1) {
    const whatsappNumber = brazilianWhatsappNumber()
    await sessionRepository.getOrCreate(establishmentId, whatsappNumber, START_STATE)

    for (let turn = 0; turn < MESSAGES_PER_CONVERSATION; turn += 1) {
      await logMessage.execute({
        companyId: establishmentId,
        whatsappNumber,
        direction: 'inbound',
        sender: 'customer',
        type: 'text',
        content: CUSTOMER_LINES[turn] ?? faker.lorem.sentence(),
        startState: START_STATE,
      })

      await logMessage.execute({
        companyId: establishmentId,
        whatsappNumber,
        direction: 'outbound',
        sender: 'bot',
        type: 'text',
        content: AGENT_LINES[turn] ?? faker.lorem.sentence(),
        status: 'read',
        startState: START_STATE,
      })
    }

    if (index === 0) await sessionRepository.requestHuman(establishmentId, whatsappNumber)
    if (index === 1) await sessionRepository.takeover(establishmentId, whatsappNumber, agentUserId)
  }
}
