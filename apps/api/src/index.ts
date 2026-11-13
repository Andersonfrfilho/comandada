import { createServer } from './infra/http/server'

createServer()
  .then((server) => server.listen())
  .catch((error: unknown) => {
    console.error('[API] Fatal startup error:', error)
    process.exit(1)
  })
