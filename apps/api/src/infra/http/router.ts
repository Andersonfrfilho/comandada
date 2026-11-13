import { randomUUID } from 'crypto'
import type { AuthenticatedUser } from '@/shared/types'
import { MetaWhatsAppError } from '@adatechnology/meta-whatsapp-contracts'
import { AppError } from '@/shared/errors/AppError'

export interface ParsedRequest {
  method: string
  url: string
  params: Record<string, string>
  query: Record<string, string>
  headers: Record<string, string>
  body: unknown
  rawBody: Buffer
  user?: AuthenticatedUser
  establishmentId?: string
}

export interface ResponseHelper {
  json(data: unknown, statusCode?: number): void
  error(code: string, message: string, statusCode?: number, details?: unknown): void
  binary(body: Buffer, contentType: string, fileName?: string, statusCode?: number): void
  readonly sent: boolean
  readonly requestId: string
}

export type Middleware = (
  request: ParsedRequest,
  response: ResponseHelper,
  next: () => Promise<void>
) => Promise<void>

export type RouteHandler = (request: ParsedRequest, response: ResponseHelper) => Promise<void>

export type RawRouteHandler = (request: Request, params: Record<string, string>) => Response | Promise<Response>

type RouteArgs = [...Middleware[], RouteHandler]

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS' | 'HEAD'

type Segment = { kind: 'static'; value: string } | { kind: 'param'; name: string }

interface RouteEntry {
  method: HttpMethod
  segments: Segment[]
  order: number
  handle: (request: Request, params: Record<string, string>) => Promise<Response>
}

const METHODS_WITH_BODY = new Set(['POST', 'PUT', 'PATCH'])

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? 'http://localhost:5173').split(',')

const SECURITY_HEADERS: Array<[string, string]> = [
  ['X-Content-Type-Options', 'nosniff'],
  ['X-Frame-Options', 'DENY'],
  ['X-XSS-Protection', '0'],
]

export function isAllowedOrigin(origin: string): boolean {
  return ALLOWED_ORIGINS.includes(origin)
}

export function buildCorsAndSecurityHeaders(origin: string): Headers {
  const headers = new Headers()
  if (isAllowedOrigin(origin)) headers.set('Access-Control-Allow-Origin', origin)
  for (const [name, value] of SECURITY_HEADERS) headers.set(name, value)
  return headers
}

function splitPath(path: string): string[] {
  return path.split('/').filter((part) => part.length > 0)
}

function parsePattern(pattern: string): Segment[] {
  return splitPath(pattern).map((part) =>
    part.startsWith(':') ? { kind: 'param', name: part.slice(1) } : { kind: 'static', value: part }
  )
}

function matchSegments(segments: Segment[], pathParts: string[]): Record<string, string> | undefined {
  if (segments.length !== pathParts.length) return undefined
  const params: Record<string, string> = {}
  for (const [index, segment] of segments.entries()) {
    const part = pathParts[index] ?? ''
    if (segment.kind === 'static') {
      if (segment.value !== part) return undefined
      continue
    }
    params[segment.name] = decodeURIComponent(part)
  }
  return params
}

// Static segments win over params at the first position where two routes differ, like uWS did.
function compareSpecificity(left: RouteEntry, right: RouteEntry): number {
  for (const [index, leftSegment] of left.segments.entries()) {
    const rightSegment = right.segments[index]
    if (!rightSegment || leftSegment.kind === rightSegment.kind) continue
    return leftSegment.kind === 'static' ? -1 : 1
  }
  return left.order - right.order
}

function parseQueryString(searchParams: URLSearchParams): Record<string, string> {
  const result: Record<string, string> = {}
  searchParams.forEach((value, key) => {
    result[key] = value
  })
  return result
}

function readHeaders(request: Request): Record<string, string> {
  const headers: Record<string, string> = {}
  request.headers.forEach((value, key) => {
    headers[key] = value
  })
  return headers
}

interface PendingResponse {
  helper: ResponseHelper
  response: Promise<Response>
}

function buildResponseHelper(origin: string): PendingResponse {
  let sent = false
  const requestId = randomUUID()
  let resolveResponse: (response: Response) => void = () => undefined
  const response = new Promise<Response>((resolve) => {
    resolveResponse = resolve
  })

  function send(body: string | Uint8Array, statusCode: number, contentType: string, fileName?: string): void {
    if (sent) return
    sent = true
    const headers = buildCorsAndSecurityHeaders(origin)
    headers.set('Content-Type', contentType)
    headers.set('X-Request-Id', requestId)
    if (fileName) headers.set('Content-Disposition', `attachment; filename="${fileName}"`)
    const responseBody = statusCode === 204 ? null : body
    resolveResponse(new Response(responseBody, { status: statusCode, headers }))
  }

  const helper: ResponseHelper = {
    get sent() {
      return sent
    },
    get requestId() {
      return requestId
    },
    json(data: unknown, statusCode = 200): void {
      send(JSON.stringify(data), statusCode, 'application/json')
    },
    error(code: string, message: string, statusCode = 500, details?: unknown): void {
      const payload: Record<string, unknown> = { error: code, message }
      if (details !== undefined) payload.details = details
      send(JSON.stringify(payload), statusCode, 'application/json')
    },
    binary(body: Buffer, contentType: string, fileName?: string, statusCode = 200): void {
      send(new Uint8Array(body), statusCode, contentType, fileName)
    },
  }

  return { helper, response }
}

async function runMiddlewareChain(
  middlewares: Middleware[],
  handler: RouteHandler,
  request: ParsedRequest,
  response: ResponseHelper
): Promise<void> {
  let index = 0

  async function next(): Promise<void> {
    const middleware = middlewares[index++]
    if (middleware) {
      await middleware(request, response, next)
      return
    }
    await handler(request, response)
  }

  await next()
}

function respondWithError(error: unknown, response: ResponseHelper): void {
  if (response.sent) return
  if (error instanceof AppError) {
    response.error(error.code, error.message, error.statusCode, error.details)
    return
  }
  // O módulo tem a própria hierarquia, com status e código estáveis; sem a ponte viraria 500.
  if (error instanceof MetaWhatsAppError) {
    response.error(error.code, error.message, error.statusCode, error.details)
    return
  }
  const message = error instanceof Error ? error.message : 'An unexpected error occurred'
  response.error('internal_error', message, 500)
}

function parseJsonBody(rawBody: Buffer, contentType: string): { ok: true; body: unknown } | { ok: false } {
  if (rawBody.length === 0 || !contentType.includes('application/json')) return { ok: true, body: undefined }
  try {
    return { ok: true, body: JSON.parse(rawBody.toString('utf-8')) }
  } catch {
    return { ok: false }
  }
}

async function handleRoute(options: {
  request: Request
  params: Record<string, string>
  middlewares: Middleware[]
  handler: RouteHandler
}): Promise<Response> {
  const { request, params, middlewares, handler } = options
  const headers = readHeaders(request)
  const url = new URL(request.url)
  const { helper, response } = buildResponseHelper(headers['origin'] ?? '')

  const rawBody = METHODS_WITH_BODY.has(request.method)
    ? Buffer.from(await request.arrayBuffer())
    : Buffer.alloc(0)
  const parsedBody = parseJsonBody(rawBody, headers['content-type'] ?? '')
  if (!parsedBody.ok) {
    helper.error('invalid_json', 'Request body is not valid JSON', 400)
    return response
  }

  const parsedRequest: ParsedRequest = {
    method: request.method,
    url: url.pathname,
    params,
    query: parseQueryString(url.searchParams),
    headers,
    body: parsedBody.body,
    rawBody,
  }

  // The response is returned as soon as a handler sends it; work after that keeps running.
  void runMiddlewareChain(middlewares, handler, parsedRequest, helper)
    .catch((error: unknown) => respondWithError(error, helper))
    .finally(() => {
      if (!helper.sent) helper.error('internal_error', 'Handler finished without a response', 500)
    })

  return response
}

export class Router {
  private readonly routes: RouteEntry[] = []
  private sorted = true

  private add(method: HttpMethod, pattern: string, handle: RouteEntry['handle']): void {
    this.routes.push({ method, segments: parsePattern(pattern), order: this.routes.length, handle })
    this.sorted = false
  }

  private register(method: HttpMethod, pattern: string, args: RouteArgs): void {
    const handler = args[args.length - 1] as RouteHandler
    const middlewares = args.slice(0, -1) as Middleware[]
    this.add(method, pattern, (request, params) => handleRoute({ request, params, middlewares, handler }))
  }

  raw(method: HttpMethod, pattern: string, handler: RawRouteHandler): void {
    this.add(method, pattern, async (request, params) => handler(request, params))
  }

  async dispatch(request: Request): Promise<Response | undefined> {
    if (!this.sorted) {
      this.routes.sort(compareSpecificity)
      this.sorted = true
    }
    const pathParts = splitPath(new URL(request.url).pathname)
    for (const route of this.routes) {
      if (route.method !== request.method) continue
      const params = matchSegments(route.segments, pathParts)
      if (params) return route.handle(request, params)
    }
    return undefined
  }

  get(pattern: string, ...args: RouteArgs): void {
    this.register('GET', pattern, args)
  }

  post(pattern: string, ...args: RouteArgs): void {
    this.register('POST', pattern, args)
  }

  put(pattern: string, ...args: RouteArgs): void {
    this.register('PUT', pattern, args)
  }

  patch(pattern: string, ...args: RouteArgs): void {
    this.register('PATCH', pattern, args)
  }

  delete(pattern: string, ...args: RouteArgs): void {
    this.register('DELETE', pattern, args)
  }

  options(pattern: string, ...args: RouteArgs): void {
    this.register('OPTIONS', pattern, args)
  }

  head(pattern: string, ...args: RouteArgs): void {
    this.register('HEAD', pattern, args)
  }
}
