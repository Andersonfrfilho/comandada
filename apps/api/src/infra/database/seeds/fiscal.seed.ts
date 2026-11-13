import { db } from '../connection'
import * as schema from '../schema'
import { daysAgo } from './helpers/seed-helpers'
import type { SeededOrder } from './orders.seed'

const FISCAL_CONFIGURATION_ID = '00000000-0000-0000-0010-000000000001'

function fiscalDocumentId(index: number): string {
  return `00000000-0000-0000-0011-${String(index).padStart(12, '0')}`
}

function accessKey(sequence: number): string {
  return `35260${String(sequence).padStart(39, '0')}`
}

type SeedFiscalParams = {
  establishmentId: string
  orders: SeededOrder[]
}

export async function seedFiscal({ establishmentId, orders }: SeedFiscalParams): Promise<void> {
  await db
    .insert(schema.fiscalConfigurations)
    .values({
      id: FISCAL_CONFIGURATION_ID,
      establishmentId,
      model: 'nfce',
      cnpj: '12345678000199',
      inscricaoEstadual: '123456789',
      razaoSocial: 'Restaurante Demo LTDA',
      uf: 'SP',
      municipio: 'São Paulo',
      cep: '01310-100',
      logradouro: 'Avenida Paulista',
      numero: '1000',
      bairro: 'Bela Vista',
      environment: 'homologacao',
      active: true,
    })
    .onConflictDoNothing()

  const fiscalOrders = orders.filter((order) => order.status === 'completed' && order.fiscalEnabled).slice(0, 4)
  const fiscalDocuments = fiscalOrders.map((order, index) => ({
    id: fiscalDocumentId(index),
    establishmentId,
    orderId: order.id,
    model: 'nfce' as const,
    status: 'authorized' as const,
    numeroDocumento: 1000 + index,
    serie: '1',
    chaveAcesso: accessKey(index + 1),
    protocolo: `135260${String(index + 1).padStart(9, '0')}`,
    totalBruto: order.totalAmount,
    totalDesconto: '0.00',
    totalLiquido: order.totalAmount,
    authorizedAt: daysAgo(order.daysAgo, 0),
  }))

  if (fiscalDocuments.length === 0) return
  await db.insert(schema.fiscalDocuments).values(fiscalDocuments).onConflictDoNothing()
}
