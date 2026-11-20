import { createExpenseModule, type ExpenseModule } from '@adatechnology/expense-module'

import { db } from '@/infra/database/connection'

/**
 * Contas a pagar (SDK `@adatechnology/expense-module`): schema `expense`, migrations próprias.
 * `companyId` do módulo = `establishmentId` do restaurante. Uma instância por processo: o módulo usa a conexão do host.
 */
export const expenseModule: ExpenseModule = createExpenseModule({ db, timeZone: 'America/Sao_Paulo' })
