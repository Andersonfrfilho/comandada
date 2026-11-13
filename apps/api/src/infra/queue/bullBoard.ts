import express, { type NextFunction, type Request, type Response } from 'express'
import { createBullBoard } from '@bull-board/api'
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter'
import { ExpressAdapter } from '@bull-board/express'
import type { Queue } from 'bullmq'
import { fiscalQueue } from './fiscalQueue'
import { stockExpiryQueue } from './stockQueue'
import { financeDueQueue } from './financeQueue'
import { ifoodPollingQueue } from './ifoodQueue'
import { productAffinityQueue } from './productAffinityQueue'

const BULLBOARD_PORT = Number(process.env.BULLBOARD_PORT ?? 4200)
const BULLBOARD_USER = process.env.BULLBOARD_USER ?? 'admin'

function basicAuth(request: Request, response: Response, next: NextFunction): void {
  const password = process.env.BULLBOARD_PASS
  const header = request.headers['authorization'] ?? ''
  const [scheme, encoded] = header.split(' ')

  if (scheme === 'Basic' && encoded) {
    const [user, pass] = Buffer.from(encoded, 'base64').toString('utf8').split(':')
    if (user === BULLBOARD_USER && pass === password) {
      next()
      return
    }
  }

  response.setHeader('WWW-Authenticate', 'Basic realm="Bull Board"')
  response.status(401).send('Authentication required')
}

// Queue observability dashboard on its own port, protected by basic auth. Never mount it on the
// public API domain — treat it as an internal ops tool (see queue-bullmq.md).
export function startBullBoard(): void {
  if (!process.env.BULLBOARD_PASS) {
    console.warn('[BullBoard] disabled — set BULLBOARD_PASS to enable')
    return
  }

  const serverAdapter = new ExpressAdapter()
  serverAdapter.setBasePath('/')
  createBullBoard({
    queues: [
      new BullMQAdapter(fiscalQueue as unknown as Queue),
      new BullMQAdapter(stockExpiryQueue as unknown as Queue),
      new BullMQAdapter(financeDueQueue as unknown as Queue),
      new BullMQAdapter(ifoodPollingQueue as unknown as Queue),
      new BullMQAdapter(productAffinityQueue as unknown as Queue),
    ],
    serverAdapter,
  })

  const app = express()
  app.use(basicAuth)
  app.use('/', serverAdapter.getRouter())
  app.listen(BULLBOARD_PORT, () => console.log(`[BullBoard] listening on :${BULLBOARD_PORT}`))
}
