import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox'

const healthRoutes: FastifyPluginAsyncTypebox = async (app) => {
  // Liveness: is the process up at all
  app.get('/health', { schema: { tags: ['health'] } }, async () => ({ status: 'ok' }))

  // Readiness: are our dependencies reachable
  app.get('/ready', { schema: { tags: ['health'] } }, async (req, reply) => {
    const checks: Record<string, 'ok' | 'error'> = { postgres: 'ok', redis: 'ok' }

    try {
      await app.prisma.$queryRaw`SELECT 1`
    } catch {
      checks.postgres = 'error'
    }
    try {
      await app.redis.ping()
    } catch {
      checks.redis = 'error'
    }

    const healthy = Object.values(checks).every((c) => c === 'ok')
    return reply.code(healthy ? 200 : 503).send({ status: healthy ? 'ok' : 'degraded', checks })
  })
}

export default healthRoutes
