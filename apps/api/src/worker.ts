/**
 * Serviço worker: só consome filas (nenhuma rota HTTP além do Bull Board, se ligado).
 * Mesma imagem da API, outro comando: `bun run src/worker.ts`. As migrations ficam com a API.
 */

import { buildContainer } from '@/infra/container'
import { checkDatabaseConnection } from '@/infra/database/connection'
import { checkRedisConnection } from '@/infra/redis/connection'
import { RedisProvider } from '@/infra/redis/RedisProvider'
import { WebSocketHub } from '@/infra/websocket/WebSocketHub'
import { startQueueWorkers } from '@/infra/queue/startQueueWorkers'

const SHUTDOWN_TIMEOUT_MS = 10_000

async function main(): Promise<void> {
  await checkDatabaseConnection()
  await checkRedisConnection()

  // Os casos de uso avisam o painel por `publishBroadcast` (Redis): a API, que tem os sockets, entrega.
  const container = buildContainer(new WebSocketHub(new RedisProvider()))
  const workers = startQueueWorkers(container.queueWorkerDependencies, 'worker')
  console.log(`[Worker] started with ${workers.length} queue consumer(s)`)

  const shutdown = async (signal: string): Promise<void> => {
    console.log(`[Worker] ${signal} received, draining`)
    const timeout = setTimeout(() => process.exit(1), SHUTDOWN_TIMEOUT_MS)
    await Promise.all(workers.map((worker) => worker.close()))
    clearTimeout(timeout)
    process.exit(0)
  }

  process.on('SIGTERM', () => void shutdown('SIGTERM'))
  process.on('SIGINT', () => void shutdown('SIGINT'))
}

main().catch((error: unknown) => {
  console.error('[Worker] Fatal startup error:', error)
  process.exit(1)
})
