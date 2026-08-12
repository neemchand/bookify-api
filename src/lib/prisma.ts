import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../generated/prisma/client.js'
import { env } from '../config/env.js'

/**
 * Prisma 7 uses driver adapters instead of the old Rust query engine.
 * A single factory so the API server, Kafka consumers, and workers all
 * construct the client the same way.
 */
export function createPrismaClient(): PrismaClient {
  const adapter = new PrismaPg({ connectionString: env.DATABASE_URL })
  return new PrismaClient({ adapter })
}
