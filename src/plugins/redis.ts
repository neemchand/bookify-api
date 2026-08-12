import fp from 'fastify-plugin'
import type { Redis } from 'ioredis'
import { createRedisClient } from '../lib/redis.js'

declare module 'fastify' {
  interface FastifyInstance {
    redis: Redis
  }
}

export default fp(
  async (app) => {
    const redis = createRedisClient()

    app.decorate('redis', redis)
    app.addHook('onClose', async () => {
      await redis.quit()
    })
  },
  { name: 'redis' },
)
