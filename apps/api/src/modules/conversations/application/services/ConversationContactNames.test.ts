import { describe, expect, it } from 'bun:test'
import { contactDisplayName } from './ConversationContactNames'

describe('contactDisplayName — nome que a lista de conversas mostra', () => {
  it('nome do cadastro vence o do perfil', () => {
    expect(contactDisplayName({ name: 'Ana', whatsappNumber: '5516991042201', whatsappProfileName: 'Aninha 🌸' })).toBe('Ana')
  })

  it('com o número no lugar do nome usa o perfil do WhatsApp', () => {
    expect(
      contactDisplayName({ name: '5516991042201', whatsappNumber: '5516991042201', whatsappProfileName: 'Aninha 🌸' })
    ).toBe('Aninha 🌸')
  })

  it('sem nome nenhum devolve null e a lista mostra o telefone', () => {
    expect(contactDisplayName({ name: '5516991042201', whatsappNumber: '5516991042201', whatsappProfileName: null })).toBeNull()
  })
})
