import { db } from '../connection'
import * as schema from '../schema'
import { brazilianWhatsappNumber, faker } from './helpers/seed-helpers'

const CUSTOMER_COUNT = 8

function customerId(index: number): string {
  return `00000000-0000-0000-0003-${String(index).padStart(12, '0')}`
}

function addressId(index: number): string {
  return `00000000-0000-0000-0004-${String(index).padStart(12, '0')}`
}

export async function seedCustomers(establishmentId: string): Promise<string[]> {
  const customers = Array.from({ length: CUSTOMER_COUNT }, (_, index) => ({
    id: customerId(index),
    establishmentId,
    name: faker.person.fullName(),
    whatsappNumber: brazilianWhatsappNumber(),
    phone: faker.helpers.maybe(() => brazilianWhatsappNumber(), { probability: 0.4 }) ?? null,
    email: faker.internet.email().toLowerCase(),
    document: faker.string.numeric(11),
    birthDate: faker.date.birthdate({ min: 18, max: 70, mode: 'age' }).toISOString().slice(0, 10),
  }))
  await db.insert(schema.customers).values(customers).onConflictDoNothing()

  const addresses = customers.map((customer, index) => ({
    id: addressId(index),
    customerId: customer.id,
    street: faker.location.street(),
    number: faker.location.buildingNumber(),
    complement: faker.helpers.maybe(() => faker.location.secondaryAddress(), { probability: 0.3 }) ?? null,
    neighborhood: faker.location.county(),
    city: faker.location.city(),
    state: faker.location.state({ abbreviated: true }),
    zip: faker.location.zipCode('#####-###'),
    isDefault: true,
  }))
  await db.insert(schema.addresses).values(addresses).onConflictDoNothing()

  return customers.map((customer) => customer.id)
}
