import { createExpenseRoutes, EXPENSE_SCOPE, isExpenseError, type ExpenseModule } from '@adatechnology/expense-module'

import type { Router, RouteHandler } from '@/infra/http/router'
import { authenticate, authorize } from '@/infra/http/middlewares'
import { AppError, UnauthorizedError, ValidationError } from '@/shared/errors/AppError'

/** As rotas do módulo moram aqui embaixo: `/expenses` do painel já é dos gastos avulsos. */
export const ACCOUNTS_PAYABLE_PREFIX = '/accounts-payable'

type ModuleRoute = ReturnType<typeof createExpenseRoutes>[number]
type RouterMethod = 'get' | 'post' | 'put' | 'patch' | 'delete'

interface ZodLikeError {
  name: string
  issues: Array<{ path: Array<string | number>; message: string }>
}

function isZodError(error: unknown): error is ZodLikeError {
  return error instanceof Error && error.name === 'ZodError' && Array.isArray((error as Partial<ZodLikeError>).issues)
}

/** Erro do módulo e do zod do módulo viram o `AppError` do painel (senão o roteador responderia 500). */
export function toAppError(error: unknown): unknown {
  if (isExpenseError(error)) return new AppError(error.message, error.code, error.status)
  if (isZodError(error)) {
    return new ValidationError(
      'Dados inválidos',
      error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    )
  }
  return error
}

/**
 * Ponte entre a tabela de rotas do módulo e o roteador do painel: autenticação e permissão `finance` do painel,
 * empresa = restaurante do usuário (nunca do corpo), validação e resposta do módulo.
 */
export function createAccountsPayableHandler(route: ModuleRoute): RouteHandler {
  return async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    try {
      const body = route.bodySchema ? route.bodySchema.parse(request.body ?? {}) : undefined
      const query = route.querySchema ? route.querySchema.parse(request.query) : request.query
      const result = await route.handler({
        auth: {
          companyId: request.user.establishmentId,
          scopes: [EXPENSE_SCOPE.READ, EXPENSE_SCOPE.WRITE],
          userId: request.user.id,
        },
        body,
        headers: request.headers,
        params: request.params,
        query: query as Record<string, string>,
      })
      if (result.kind === 'json') {
        response.json(result.body, result.status)
        return
      }
      if (result.kind === 'empty') {
        response.json(null, result.status)
        return
      }
      throw new Error(`accounts-payable: resposta ${result.kind} não suportada`)
    } catch (error) {
      throw toAppError(error)
    }
  }
}

export function registerAccountsPayableRoutes(router: Router, module: ExpenseModule): void {
  for (const route of createExpenseRoutes({ module })) {
    const action = route.requiredScopes?.includes(EXPENSE_SCOPE.WRITE) ? 'write' : 'read'
    const method = route.method.toLowerCase() as RouterMethod
    router[method](
      `${ACCOUNTS_PAYABLE_PREFIX}${route.path}`,
      authenticate,
      authorize('finance', action),
      createAccountsPayableHandler(route),
    )
  }
}
