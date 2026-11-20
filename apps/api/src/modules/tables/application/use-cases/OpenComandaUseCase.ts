import type { TableRepository } from '../../domain/repositories/TableRepository'
import type { ComandaRepository } from '../../domain/repositories/ComandaRepository'
import type { CustomerRepository } from '@/modules/customers/domain/repositories/CustomerRepository'
import type { Comanda, Customer } from '@/infra/database/schema'
import { NotFoundError, ValidationError } from '@/shared/errors/AppError'
import { normalizeBrazilianPhone, phoneVariants } from '@/modules/storefront/shared/storefront.constant'

function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
}

/** Dados do cliente que o garçom pega ao abrir a comanda. Tudo opcional: dá para abrir só com o número de pessoas. */
export interface OpenComandaCustomerInput {
  customerId?: string | undefined
  customerName?: string | undefined
  customerPhone?: string | undefined
  guestsCount?: number | undefined
}

interface ResolvedCustomer {
  customerId: string | null
  customerName: string | null
  customerPhone: string | null
}

export class OpenComandaUseCase {
  constructor(
    private readonly tableRepository: TableRepository,
    private readonly comandaRepository: ComandaRepository,
    private readonly customerRepository?: CustomerRepository
  ) {}

  async execute(tableId: string, establishmentId: string, input: OpenComandaCustomerInput = {}): Promise<Comanda> {
    const table = await this.tableRepository.findById(tableId, establishmentId)
    if (!table) throw new NotFoundError('Mesa')

    const customer = await this.resolveCustomer(establishmentId, input)

    // Uma mesa pode ter N comandas abertas ao mesmo tempo (uma por cliente).
    let code: string
    let attempts = 0
    do {
      code = generateCode()
      attempts++
      if (attempts > 20) throw new Error('Não foi possível gerar um código único — tente novamente')
    } while (await this.comandaRepository.isCodeActiveInEstablishment(code, establishmentId))

    const comanda = await this.comandaRepository.create({
      establishmentId,
      tableId,
      code,
      ...(customer.customerId ? { customerId: customer.customerId } : {}),
      ...(customer.customerName ? { customerName: customer.customerName } : {}),
      ...(customer.customerPhone ? { customerPhone: customer.customerPhone } : {}),
      ...(input.guestsCount ? { guestsCount: input.guestsCount } : {}),
    })

    await this.tableRepository.updateStatus(tableId, establishmentId, 'occupied')

    return comanda
  }

  /**
   * Cliente escolhido na busca vale como está. Telefone digitado procura o cadastro (com e sem o nono
   * dígito) e, com nome, cadastra quem ainda não existe — a próxima visita já acha pelo telefone.
   */
  private async resolveCustomer(establishmentId: string, input: OpenComandaCustomerInput): Promise<ResolvedCustomer> {
    const typedName = input.customerName?.trim() || null
    if (!this.customerRepository) {
      return { customerId: null, customerName: typedName, customerPhone: input.customerPhone ?? null }
    }

    if (input.customerId) {
      const existing = await this.customerRepository.findById(input.customerId, establishmentId)
      if (!existing) throw new NotFoundError('Cliente')
      return fromCustomer(existing, typedName)
    }

    if (!input.customerPhone) return { customerId: null, customerName: typedName, customerPhone: null }

    const phone = normalizeBrazilianPhone(input.customerPhone)
    if (!phone) throw new ValidationError('Telefone inválido', { customerPhone: ['Use DDD + número'] })

    for (const variant of phoneVariants(phone)) {
      const existing = await this.customerRepository.findByWhatsApp(variant, establishmentId)
      if (existing) return fromCustomer(existing, typedName)
    }

    if (!typedName) return { customerId: null, customerName: null, customerPhone: phone }
    const created = await this.customerRepository.create({ establishmentId, name: typedName, whatsappNumber: phone })
    return fromCustomer(created, typedName)
  }
}

function fromCustomer(customer: Customer, typedName: string | null): ResolvedCustomer {
  return {
    customerId: customer.id,
    // O nome que o garçom ouviu na mesa vale para esta comanda; o cadastro fica como está.
    customerName: typedName ?? customer.name,
    customerPhone: customer.whatsappNumber,
  }
}
