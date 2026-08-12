import fp from 'fastify-plugin'
import fastifySwagger from '@fastify/swagger'
import fastifySwaggerUi from '@fastify/swagger-ui'

export default fp(
  async (app) => {
    await app.register(fastifySwagger, {
      openapi: {
        openapi: '3.1.0',
        info: {
          title: 'Bookify API',
          description:
            'Event booking API — Fastify 5, Prisma 7, PostgreSQL, Redis, Kafka',
          version: '1.0.0',
        },
        components: {
          securitySchemes: {
            bearerAuth: {
              type: 'http',
              scheme: 'bearer',
              bearerFormat: 'JWT',
            },
          },
        },
      },
    })

    await app.register(fastifySwaggerUi, {
      routePrefix: '/docs',
    })
  },
  { name: 'swagger' },
)
