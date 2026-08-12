import fp from 'fastify-plugin'
import type { PrismaClient } from '../generated/prisma/client.js'
import { createPrismaClient } from '../lib/prisma.js'

declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient
  }
}

export default fp(
  async (app) => {
    const prisma = createPrismaClient()
    await prisma.$connect()

    app.decorate('prisma', prisma)
    app.addHook('onClose', async () => {
      await prisma.$disconnect()
    })
  },
  { name: 'prisma' },
)
