import { describe, expect, it } from 'bun:test'
import { OpenComandaUseCase } from './OpenComandaUseCase'
import type { TableRepository } from '../../domain/repositories/TableRepository'
import type { ComandaRepository, CreateComandaInput } from '../../domain/repositories/ComandaRepository'
import type { CustomerRepository, CreateCustomerInput } from '@/modules/customers/domain/repositories/CustomerRepository'
import type { Comanda, Customer } from '@/infra/database/schema'

const ESTABLISHMENT_ID = 'est-1'
const TABLE_ID = 'table-1'

function buildCustomer(overrides: Partial<Customer>): Customer {
  return {
    id: 'customer-1',
    establishmentId: ESTABLISHMENT_ID,
    name: 'Maria',
    whatsappNumber: '5516999991234',
    phone: null,
    whatsappProfileName: null,
    email: null,
    document: null,
    birthDate: null,
    rating: null,
    marketingOptIn: null,
    marketingOptInAt: null,
    lastMarketingAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

function buildScenario(existingCustomers: Customer[] = []) {
  const created: CreateComandaInput[] = []
  const createdCustomers: CreateCustomerInput[] = []
  const tableRepository = {
    findById: async () => ({ id: TABLE_ID }),
    updateStatus: async () => undefined,
  } as unknown as TableRepository
  const comandaRepository = {
    isCodeActiveInEstablishment: async () => false,
    create: async (input: CreateComandaInput) => {
      created.push(input)
      return { id: 'comanda-1', ...input } as unknown as Comanda
    },
  } as unknown as ComandaRepository
  const customerRepository = {
    findById: async (id: string) => existingCustomers.find((customer) => customer.id === id) ?? null,
    findByWhatsApp: async (number: string) =>
      existingCustomers.find((customer) => customer.whatsappNumber === number) ?? null,
    create: async (input: CreateCustomerInput) => {
      createdCustomers.push(input)
      return buildCustomer({ id: 'customer-new', name: input.name, whatsappNumber: input.whatsappNumber })
    },
  } as unknown as CustomerRepository
  const useCase = new OpenComandaUseCase(tableRepository, comandaRepository, customerRepository)
  return { useCase, created, createdCustomers }
}

describe('OpenComandaUseCase', () => {
  it('abre sem dados do cliente, como o painel sempre fez', async () => {
    const { useCase, created } = buildScenario()
    await useCase.execute(TABLE_ID, ESTABLISHMENT_ID)
    expect(created[0]?.customerName).toBeUndefined()
    expect(created[0]?.guestsCount).toBeUndefined()
  })

  it('guarda o cliente escolhido na busca e o número de pessoas', async () => {
    const { useCase, created } = buildScenario([buildCustomer({})])
    await useCase.execute(TABLE_ID, ESTABLISHMENT_ID, { customerId: 'customer-1', guestsCount: 4 })
    expect(created[0]).toMatchObject({
      customerId: 'customer-1',
      customerName: 'Maria',
      customerPhone: '5516999991234',
      guestsCount: 4,
    })
  })

  it('acha o cadastro pelo telefone digitado mesmo sem o nono dígito', async () => {
    const { useCase, created, createdCustomers } = buildScenario([buildCustomer({ whatsappNumber: '551699991234' })])
    await useCase.execute(TABLE_ID, ESTABLISHMENT_ID, { customerPhone: '(16) 99999-1234', customerName: 'Maria Souza' })
    expect(created[0]).toMatchObject({ customerId: 'customer-1', customerName: 'Maria Souza' })
    expect(createdCustomers).toHaveLength(0)
  })

  it('cadastra cliente novo com nome e telefone', async () => {
    const { useCase, created, createdCustomers } = buildScenario()
    await useCase.execute(TABLE_ID, ESTABLISHMENT_ID, { customerPhone: '16 98888-7777', customerName: 'João' })
    expect(createdCustomers[0]).toEqual({ establishmentId: ESTABLISHMENT_ID, name: 'João', whatsappNumber: '5516988887777' })
    expect(created[0]).toMatchObject({ customerId: 'customer-new', customerName: 'João' })
  })

  it('recusa telefone que não é brasileiro', async () => {
    const { useCase } = buildScenario()
    await expect(useCase.execute(TABLE_ID, ESTABLISHMENT_ID, { customerPhone: '12345' })).rejects.toThrow('Telefone inválido')
  })
})
