import { describe, expect, it } from 'bun:test'
import { backoffDelay, checksumOf, trimToByteLimit } from './SyncWorker'
import type { SyncChange } from '../infra/SyncRepository'

function change(seq: number, payloadSize = 10): SyncChange {
  return {
    seq: String(seq),
    xid: '1',
    table_name: 'public.customers',
    pk: `id-${seq}`,
    key: { id: `id-${seq}` },
    op: 'U',
    data: { name: 'x'.repeat(payloadSize) },
    old_data: null,
    hlc: '000000000000001-000000000001-loja:teste',
    origin: 'loja:teste',
  }
}

describe('backoffDelay', () => {
  it('não espera sem falhas', () => {
    expect(backoffDelay(0, 60_000)).toBe(0)
  })

  it('dobra a cada falha e respeita o teto', () => {
    const noJitter = () => 0.5
    expect(backoffDelay(1, 60_000, noJitter)).toBe(2_000)
    expect(backoffDelay(2, 60_000, noJitter)).toBe(4_000)
    expect(backoffDelay(3, 60_000, noJitter)).toBe(8_000)
    expect(backoffDelay(20, 60_000, noJitter)).toBe(60_000)
  })

  it('espalha as tentativas entre 75% e 125%', () => {
    expect(backoffDelay(2, 60_000, () => 0)).toBe(3_000)
    expect(backoffDelay(2, 60_000, () => 1)).toBe(5_000)
  })
})

describe('trimToByteLimit', () => {
  it('corta o lote quando passa do limite de bytes', () => {
    const changes = [change(1, 400), change(2, 400), change(3, 400)]
    expect(trimToByteLimit(changes, 1_200).map((item) => item.seq)).toEqual(['1', '2'])
  })

  it('sempre leva pelo menos uma mudança, mesmo grande', () => {
    expect(trimToByteLimit([change(1, 5_000)], 100)).toHaveLength(1)
  })
})

describe('checksumOf', () => {
  it('muda quando um byte muda', () => {
    expect(checksumOf('{"a":1}')).not.toBe(checksumOf('{"a":2}'))
  })
})
