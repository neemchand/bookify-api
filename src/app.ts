import Fastify, { type FastifyError } from 'fastify'
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox'
import sensible from '@fastify/sensible'
import helmet from '@fastify/helmet'
import cors from '@fastify/cors'
import rateLimit from '@fastify/rate-limit'
import { env, isProduction } from './config/env.js'
import { AppError } from './lib/errors.js'
import prismaPlugin from './plugins/prisma.js'
import redisPlugin from './plugins/redis.js'
import kafkaPlugin from './plugins/kafka.js'
import authPlugin from './plugins/auth.js'
import swaggerPlugin from './plugins/swagger.js'
import authRoutes from './modules/auth/auth.routes.js'
import eventsRoutes from './modules/events/events.routes.js'
import bookingsRoutes from './modules/bookings/bookings.routes.js'
import healthRoutes from './modules/health/health.routes.js'

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      ...(isProduction
        ? {}
        : { transport: { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss' } } }),
    },
    // Trust exactly one reverse proxy (nginx) in front of us in production
    trustProxy: isProduction,
  }).withTypeProvider<TypeBoxTypeProvider>()

  // --- Core plugins -------------------------------------------------------
  await app.register(sensible)
  await app.register(helmet)
  await app.register(cors, { origin: isProduction ? [] : true })
  await app.register(prismaPlugin)
  await app.register(redisPlugin)
  await app.register(rateLimit, {
    max: env.RATE_LIMIT_MAX,
    timeWindow: '1 minute',
    // Redis-backed so limits hold across multiple API instances
    redis: app.redis,
    nameSpace: 'rate-limit:',
  })
  await app.register(kafkaPlugin)
  await app.register(authPlugin)
  await app.register(swaggerPlugin)

  // --- Error handling -----------------------------------------------------
  app.setErrorHandler((err: FastifyError, req, reply) => {
    if (err instanceof AppError) {
      return reply.code(err.statusCode).send({
        error: { code: err.code, message: err.message },
      })
    }

    // Fastify validation / rate-limit / jwt errors carry a statusCode
    if (err.statusCode && err.statusCode < 500) {
      return reply.code(err.statusCode).send({
        error: { code: err.code ?? 'BAD_REQUEST', message: err.message },
      })
    }

    // Unknown = 500. Log everything, leak nothing.
    req.log.error({ err }, 'unhandled error')
    return reply.code(500).send({
      error: { code: 'INTERNAL', message: 'Internal server error' },
    })
  })

  // --- Routes -------------------------------------------------------------
  await app.register(healthRoutes)
  await app.register(authRoutes, { prefix: '/api/v1/auth' })
  await app.register(eventsRoutes, { prefix: '/api/v1/events' })
  await app.register(bookingsRoutes, { prefix: '/api/v1/bookings' })

  return app
}
