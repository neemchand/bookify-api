import closeWithGrace from 'close-with-grace'
import { buildApp } from './app.js'
import { env } from './config/env.js'

const app = await buildApp()

await app.listen({ port: env.PORT, host: env.HOST })

// Graceful shutdown: stop accepting connections, drain in-flight requests,
// then let the plugins' onClose hooks disconnect Prisma/Redis/Kafka.
closeWithGrace({ delay: 10_000 }, async ({ err }) => {
  if (err) app.log.error({ err }, 'server closing due to error')
  await app.close()
})
