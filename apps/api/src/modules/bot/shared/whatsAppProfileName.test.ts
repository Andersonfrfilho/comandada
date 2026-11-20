import { describe, expect, it } from 'bun:test'
import { cleanProfileName, customerNameFromProfile } from './whatsAppProfileName'

describe('cleanProfileName — nome do perfil como o cliente escreveu', () => {
  it('colapsa espaços e mantém emoji', () => {
    expect(cleanProfileName('  Zé   🍣 ')).toBe('Zé 🍣')
  })

  it('vazio ou só espaço vira null', () => {
    expect(cleanProfileName('   ')).toBeNull()
    expect(cleanProfileName(undefined)).toBeNull()
  })

  it('corta no tamanho da coluna', () => {
    expect(cleanProfileName('a'.repeat(400))).toHaveLength(255)
  })
})

describe('customerNameFromProfile — mesma regra do bot para virar nome do cliente', () => {
  it('aceita nome com acento e põe as iniciais em maiúscula', () => {
    expect(customerNameFromProfile('maria joão')).toBe('Maria João')
    expect(customerNameFromProfile('Ana Clara')).toBe('Ana Clara')
  })

  it('recusa número, emoji, letra repetida e palavrão', () => {
    expect(customerNameFromProfile('Zé 123')).toBeNull()
    expect(customerNameFromProfile('Zé 🍣')).toBeNull()
    expect(customerNameFromProfile('aaaa')).toBeNull()
    expect(customerNameFromProfile('seu otario')).toBeNull()
    expect(customerNameFromProfile('A')).toBeNull()
  })
})
