import type { Pool, PoolClient } from 'pg'
import type { SyncRole, SyncTableConfig } from '../shared/syncTables.constant'

export interface SyncCursor {
  readonly xid: string
  readonly seq: string
}

export interface SyncChange {
  readonly seq: string
  readonly xid: string
  readonly table_name: string
  readonly pk: string
  readonly key: Record<string, unknown>
  readonly op: 'I' | 'U' | 'D'
  readonly data: Record<string, unknown> | null
  readonly old_data: Record<string, unknown> | null
  readonly hlc: string
  readonly origin: string
}

export interface ApplyResult {
  readonly applied: number
  readonly skipped: number
  readonly conflicts: number
  readonly cursor: SyncCursor | null
  /** Mudanças que de fato entraram neste nó (para avisos que dependem delas, como o WhatsApp do cliente). */
  readonly appliedChanges: readonly SyncChange[]
}

export interface PeerState {
  readonly peerId: string
  readonly lastPushed: SyncCursor
  readonly lastPulled: SyncCursor
  readonly lastReceived: SyncCursor
  readonly lastSuccessAt: Date | null
  readonly lastAttemptAt: Date | null
  readonly lastError: string | null
}

export interface SyncConflictRow {
  readonly id: string
  readonly tableName: string
  readonly pk: string
  readonly reason: string
  readonly status: string
  readonly attempts: number
  readonly createdAt: Date
  readonly change: SyncChange
}

const ZERO_CURSOR: SyncCursor = { xid: '0', seq: '0' }

interface PeerRow {
  peer_id: string
  last_pushed_xid: string
  last_pushed_seq: string
  last_pulled_xid: string
  last_pulled_seq: string
  last_received_xid: string
  last_received_seq: string
  last_success_at: Date | null
  last_attempt_at: Date | null
  last_error: string | null
}

function toPeerState(row: PeerRow): PeerState {
  return {
    peerId: row.peer_id,
    lastPushed: { xid: row.last_pushed_xid, seq: row.last_pushed_seq },
    lastPulled: { xid: row.last_pulled_xid, seq: row.last_pulled_seq },
    lastReceived: { xid: row.last_received_xid, seq: row.last_received_seq },
    lastSuccessAt: row.last_success_at,
    lastAttemptAt: row.last_attempt_at,
    lastError: row.last_error,
  }
}

function compareCursor(left: SyncCursor, right: SyncCursor): number {
  const xidDifference = BigInt(left.xid) - BigInt(right.xid)
  if (xidDifference !== 0n) return xidDifference > 0n ? 1 : -1
  const seqDifference = BigInt(left.seq) - BigInt(right.seq)
  if (seqDifference === 0n) return 0
  return seqDifference > 0n ? 1 : -1
}

export class SyncRepository {
  constructor(private readonly pool: Pool) {}

  private async inTransaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      const result = await work(client)
      await client.query('COMMIT')
      return result
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }

  /** Grava o nó, a lista de tabelas e liga as triggers. Idempotente: roda a cada boot. */
  async configure(nodeId: string, role: SyncRole, tables: readonly SyncTableConfig[]): Promise<string[]> {
    return this.inTransaction(async (client) => {
      await client.query(
        `INSERT INTO sync.state (id, node_id, role) VALUES (true, $1, $2)
         ON CONFLICT (id) DO UPDATE SET node_id = excluded.node_id, role = excluded.role, updated_at = now()`,
        [nodeId, role]
      )

      const missing: string[] = []
      const configured: string[] = []
      for (const [position, table] of tables.entries()) {
        const exists = await client.query<{ exists: boolean }>('SELECT to_regclass($1) IS NOT NULL AS exists', [
          table.table,
        ])
        if (!exists.rows[0]?.exists) {
          missing.push(table.table)
          continue
        }
        configured.push(table.table)
        await client.query(
          `INSERT INTO sync.tables (table_name, pk_columns, position, state_column, state_ranks, counter_columns, owner_role)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (table_name) DO UPDATE SET
             pk_columns = excluded.pk_columns, position = excluded.position, state_column = excluded.state_column,
             state_ranks = excluded.state_ranks, counter_columns = excluded.counter_columns, owner_role = excluded.owner_role`,
          [
            table.table,
            table.primaryKey,
            position,
            table.state?.column ?? null,
            table.state ? JSON.stringify(table.state.ranks) : null,
            table.counters ?? [],
            table.ownerRole ?? null,
          ]
        )
        // Nome da tabela vem da lista fixa do código (SYNC_TABLES), nunca de entrada externa.
        await client.query(
          `CREATE OR REPLACE TRIGGER sync_capture AFTER INSERT OR UPDATE OR DELETE ON ${table.table}
           FOR EACH ROW EXECUTE FUNCTION sync.capture()`
        )
      }
      await client.query('DELETE FROM sync.tables WHERE NOT (table_name = ANY ($1))', [configured])
      await this.splitSerialSequences(client, role, configured)
      return missing
    })
  }

  /**
   * Tabelas com id inteiro (serial) ganhariam o mesmo id dos dois lados. A loja fica com os ímpares
   * e a nuvem com os pares, então nunca colidem.
   */
  private async splitSerialSequences(client: PoolClient, role: SyncRole, tables: readonly string[]): Promise<void> {
    const parity = role === 'loja' ? 1 : 0
    for (const table of tables) {
      const sequence = await client.query<{ sequence: string | null }>(
        `SELECT pg_get_serial_sequence($1, 'id') AS sequence
           FROM information_schema.columns
          WHERE table_schema || '.' || table_name = $1 AND column_name = 'id' AND data_type IN ('integer', 'bigint')`,
        [table]
      )
      const sequenceName = sequence.rows[0]?.sequence
      if (!sequenceName) continue
      await client.query(`ALTER SEQUENCE ${sequenceName} INCREMENT BY 2`)
      // Próximo id: o menor número com a paridade deste nó acima de tudo que já existe.
      await client.query(
        `SELECT setval($1::regclass, candidate + CASE WHEN candidate % 2 = $2 THEN 0 ELSE 1 END, false)
           FROM (SELECT greatest(coalesce((SELECT max(id) FROM ${table}), 0),
                                 (SELECT CASE WHEN is_called THEN last_value ELSE last_value - 1 END FROM ${sequenceName})) + 1 AS candidate
                ) AS current`,
        [sequenceName, parity]
      )
    }
  }

  /** Na primeira ligação, registra as linhas existentes como inserções. Devolve quantas. */
  async seedBacklog(): Promise<number> {
    const result = await this.pool.query<{ count: string }>('SELECT sync.seed_backlog() AS count')
    return Number(result.rows[0]?.count ?? 0)
  }

  /**
   * Lê mudanças em ordem (xid, seq), só de transações já encerradas: tudo que tem xid abaixo do
   * menor xid ainda aberto. Uma transação lenta não é ultrapassada pelo cursor.
   */
  async readChanges(params: {
    readonly after: SyncCursor
    readonly limit: number
    readonly onlyOrigin?: string
    readonly exceptOrigin?: string
  }): Promise<SyncChange[]> {
    const filters: string[] = ['(c.xid, c.seq) > ($1::bigint, $2::bigint)', 'c.xid < safe.xmin']
    const values: unknown[] = [params.after.xid, params.after.seq, params.limit]
    if (params.onlyOrigin) {
      values.push(params.onlyOrigin)
      filters.push(`c.origin = $${values.length}`)
    }
    if (params.exceptOrigin) {
      values.push(params.exceptOrigin)
      filters.push(`c.origin <> $${values.length}`)
    }
    const result = await this.pool.query<SyncChange>(
      `SELECT c.seq::text, c.xid::text, c.table_name, c.pk, c.key, c.op, c.data, c.old_data, c.hlc, c.origin
         FROM sync.changes c,
              (SELECT pg_snapshot_xmin(pg_current_snapshot())::text::bigint AS xmin) AS safe
        WHERE ${filters.join(' AND ')}
        ORDER BY c.xid, c.seq
        LIMIT $3`,
      values
    )
    return result.rows
  }

  /**
   * Aplica um lote recebido numa transação só, junto com o cursor do par. Se a conexão cair no meio,
   * nada do lote fica pela metade e o reenvio é ignorado até o ponto já aplicado.
   */
  async applyBatch(params: {
    readonly peerId: string
    readonly changes: readonly SyncChange[]
    readonly cursorColumn: 'received' | 'pulled'
  }): Promise<ApplyResult> {
    return this.inTransaction(async (client) => {
      await client.query('INSERT INTO sync.peers (peer_id) VALUES ($1) ON CONFLICT (peer_id) DO NOTHING', [
        params.peerId,
      ])
      const peer = await client.query<PeerRow>('SELECT * FROM sync.peers WHERE peer_id = $1 FOR UPDATE', [
        params.peerId,
      ])
      const peerRow = peer.rows[0]
      if (!peerRow) throw new Error(`peer ${params.peerId} não encontrado`)
      const state = toPeerState(peerRow)
      let cursor = params.cursorColumn === 'received' ? state.lastReceived : state.lastPulled
      const startCursor = cursor

      let applied = 0
      let skipped = 0
      let conflicts = 0
      const appliedChanges: SyncChange[] = []
      for (const change of params.changes) {
        const changeCursor = { xid: change.xid, seq: change.seq }
        if (compareCursor(changeCursor, cursor) <= 0) {
          skipped += 1
          continue
        }
        const result = await client.query<{ result: string }>('SELECT sync.apply_change($1::jsonb) AS result', [
          JSON.stringify(change),
        ])
        const outcome = result.rows[0]?.result
        if (outcome === 'applied') {
          applied += 1
          appliedChanges.push(change)
        } else if (outcome === 'conflict') conflicts += 1
        else skipped += 1
        cursor = changeCursor
      }

      if (compareCursor(cursor, startCursor) > 0) {
        await client.query(
          `UPDATE sync.peers SET last_${params.cursorColumn}_xid = $2, last_${params.cursorColumn}_seq = $3,
                  last_success_at = now(), last_error = NULL, updated_at = now()
            WHERE peer_id = $1`,
          [params.peerId, cursor.xid, cursor.seq]
        )
      }
      await client.query('SELECT sync.retry_conflicts()')
      return { applied, skipped, conflicts, cursor, appliedChanges }
    })
  }

  async getPeer(peerId: string): Promise<PeerState> {
    await this.pool.query('INSERT INTO sync.peers (peer_id) VALUES ($1) ON CONFLICT (peer_id) DO NOTHING', [peerId])
    const result = await this.pool.query<PeerRow>('SELECT * FROM sync.peers WHERE peer_id = $1', [peerId])
    const row = result.rows[0]
    if (!row) throw new Error(`peer ${peerId} não encontrado`)
    return toPeerState(row)
  }

  async savePushCursor(peerId: string, cursor: SyncCursor): Promise<void> {
    await this.pool.query(
      `UPDATE sync.peers SET last_pushed_xid = $2, last_pushed_seq = $3, last_success_at = now(),
              last_error = NULL, updated_at = now()
        WHERE peer_id = $1 AND (last_pushed_xid, last_pushed_seq) < ($2::bigint, $3::bigint)`,
      [peerId, cursor.xid, cursor.seq]
    )
  }

  async recordAttempt(peerId: string, error: string | null): Promise<void> {
    await this.pool.query(
      `UPDATE sync.peers
          SET last_attempt_at = now(),
              last_error = $2,
              last_success_at = CASE WHEN $2::text IS NULL THEN now() ELSE last_success_at END,
              updated_at = now()
        WHERE peer_id = $1`,
      [peerId, error]
    )
  }

  async countPendingPush(nodeId: string, after: SyncCursor): Promise<number> {
    const result = await this.pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM sync.changes
        WHERE origin = $1 AND (xid, seq) > ($2::bigint, $3::bigint)`,
      [nodeId, after.xid, after.seq]
    )
    return Number(result.rows[0]?.count ?? 0)
  }

  async countConflicts(): Promise<{ open: number; retrying: number }> {
    const result = await this.pool.query<{ status: string; count: string }>(
      `SELECT status, count(*)::text AS count FROM sync.conflicts WHERE status IN ('open', 'retry') GROUP BY status`
    )
    const counts = new Map(result.rows.map((row) => [row.status, Number(row.count)]))
    return { open: counts.get('open') ?? 0, retrying: counts.get('retry') ?? 0 }
  }

  async listConflicts(limit: number): Promise<SyncConflictRow[]> {
    const result = await this.pool.query<{
      id: string
      table_name: string
      pk: string
      reason: string
      status: string
      attempts: number
      created_at: Date
      change: SyncChange
    }>(
      `SELECT id::text, table_name, pk, reason, status, attempts, created_at, change
         FROM sync.conflicts WHERE status IN ('open', 'retry') ORDER BY id DESC LIMIT $1`,
      [limit]
    )
    return result.rows.map((row) => ({
      id: row.id,
      tableName: row.table_name,
      pk: row.pk,
      reason: row.reason,
      status: row.status,
      attempts: row.attempts,
      createdAt: row.created_at,
      change: row.change,
    }))
  }

  /**
   * "Usar a versão do outro lado": grava a mudança recebida como uma escrita nova deste nó. Ela
   * ganha um relógio novo e volta a propagar para os outros lados como a versão mais recente.
   */
  async acceptConflict(conflictId: string): Promise<boolean> {
    return this.inTransaction(async (client) => {
      const conflict = await client.query<{ change: SyncChange; table_name: string }>(
        `SELECT change, table_name FROM sync.conflicts WHERE id = $1 AND status IN ('open', 'retry') FOR UPDATE`,
        [conflictId]
      )
      const row = conflict.rows[0]
      if (!row) return false
      const { change } = row
      const table = await this.tableConfig(client, row.table_name)
      const key = JSON.stringify(change.key)

      if (change.op === 'D') {
        await client.query(`DELETE FROM ${row.table_name} t WHERE ${table.predicate}`, [key])
      } else {
        const existing = await client.query(`SELECT 1 FROM ${row.table_name} t WHERE ${table.predicate}`, [key])
        if (existing.rowCount === 0) {
          await client.query(`INSERT INTO ${row.table_name} SELECT * FROM jsonb_populate_record(NULL::${row.table_name}, $1)`, [
            JSON.stringify(change.data),
          ])
        } else {
          const columns = Object.keys(change.data ?? {}).filter((column) => !table.pkColumns.includes(column))
          if (columns.length > 0) {
            const assignments = columns.map((column) => {
              const quoted = `"${column.replaceAll('"', '""')}"`
              return `${quoted} = r.${quoted}`
            })
            await client.query(
              `UPDATE ${row.table_name} t SET ${assignments.join(', ')}
                 FROM jsonb_populate_record(NULL::${row.table_name}, $2) r
                WHERE ${table.predicate}`,
              [key, JSON.stringify(change.data)]
            )
          }
        }
      }
      await client.query(`UPDATE sync.conflicts SET status = 'resolved', resolved_at = now() WHERE id = $1`, [
        conflictId,
      ])
      return true
    })
  }

  private async tableConfig(client: PoolClient, table: string): Promise<{ predicate: string; pkColumns: string[] }> {
    const result = await client.query<{ predicate: string; pk_columns: string[] }>(
      'SELECT sync.key_predicate(table_name, pk_columns) AS predicate, pk_columns FROM sync.tables WHERE table_name = $1',
      [table]
    )
    const row = result.rows[0]
    if (!row) throw new Error(`tabela ${table} não sincronizada`)
    return { predicate: row.predicate, pkColumns: row.pk_columns }
  }

  /** "Manter a versão daqui": descarta a mudança recebida. */
  async discardConflict(conflictId: string): Promise<boolean> {
    const result = await this.pool.query(
      `UPDATE sync.conflicts SET status = 'discarded', resolved_at = now() WHERE id = $1 AND status IN ('open', 'retry')`,
      [conflictId]
    )
    return (result.rowCount ?? 0) > 0
  }
}

export { ZERO_CURSOR, compareCursor }
