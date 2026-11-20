import { describe, expect, it } from 'bun:test'
import { ApiError } from '@/lib/api'
import { webSocketUrlFor } from '@/lib/apiEndpoints'
import { chooseServer, configuredServers, normalizeServerUrl, type ServerHealth } from './waiterServers'
import { isRetryableForQueue } from './waiterOffline'

const up: ServerHealth = { status: 'up', latencyMs: 20, checkedAt: 1 }
const down: ServerHealth = { status: 'down', latencyMs: null, checkedAt: 1 }
const session = { accessToken: null, refreshToken: 'r' }
const urls = { loja: 'https://loja.x/api', nuvem: 'https://api.x' }

describe('escolha do servidor', () => {
  it('automático usa a loja quando ela responde', () => {
    expect(chooseServer({ mode: 'auto', active: 'nuvem', urls, health: { loja: up, nuvem: up }, sessions: { loja: session, nuvem: session } })).toBe('loja')
  })

  it('loja fora ou sem sessão: vai para a nuvem', () => {
    expect(chooseServer({ mode: 'auto', active: 'loja', urls, health: { loja: down, nuvem: up }, sessions: { loja: session, nuvem: session } })).toBe('nuvem')
    expect(chooseServer({ mode: 'auto', active: 'nuvem', urls, health: { loja: up, nuvem: up }, sessions: { loja: null, nuvem: session } })).toBe('nuvem')
  })

  it('nenhum responde: fica onde está (a fila do celular segura)', () => {
    expect(chooseServer({ mode: 'auto', active: 'loja', urls, health: { loja: down, nuvem: down }, sessions: { loja: session, nuvem: session } })).toBe('loja')
  })

  it('modo fixo ignora o automático', () => {
    expect(chooseServer({ mode: 'nuvem', active: 'loja', urls, health: { loja: up, nuvem: down }, sessions: { loja: session, nuvem: session } })).toBe('nuvem')
  })

  it('loja sem endereço não entra na conta', () => {
    expect(configuredServers({ loja: '', nuvem: 'https://api.x' })).toEqual(['nuvem'])
  })
})

describe('endereços', () => {
  it('completa https e tira a barra do fim', () => {
    expect(normalizeServerUrl(' loja.x.com.br/api/ ')).toBe('https://loja.x.com.br/api')
    expect(normalizeServerUrl('http://192.168.0.10/api')).toBe('http://192.168.0.10/api')
    expect(normalizeServerUrl('  ')).toBe('')
  })

  it('WebSocket segue o endereço da API', () => {
    expect(webSocketUrlFor('https://loja.x/api')).toBe('wss://loja.x/ws')
    expect(webSocketUrlFor('https://api.x/')).toBe('wss://api.x/ws')
    expect(webSocketUrlFor('http://192.168.0.10/api')).toBe('ws://192.168.0.10/ws')
  })
})

describe('fila com dois servidores', () => {
  it('404 logo depois de lançar é atraso da sincronização; depois de 5 min, recusa', () => {
    const now = Date.parse('2026-11-20T12:00:00Z')
    const notFound = new ApiError('Comanda não encontrada', 404)
    expect(isRetryableForQueue(notFound, '2026-11-20T11:58:00Z', now)).toBe(true)
    expect(isRetryableForQueue(notFound, '2026-11-20T11:50:00Z', now)).toBe(false)
    expect(isRetryableForQueue(new ApiError('Dados inválidos', 400), '2026-11-20T11:59:00Z', now)).toBe(false)
  })
})
