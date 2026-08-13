import { execSync } from 'node:child_process'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../../src/generated/prisma/client.js'

/**
 * Runs ONCE before the test suite (vitest globalSetup): syncs the isolated
 * test database to the current Prisma schema and wipes all rows.
 */
export default async function globalSetup(): Promise<void> {
  process.loadEnvFile()

  const testUrl = process.env.TEST_DATABASE_URL
  if (!testUrl) {
    throw new Error('TEST_DATABASE_URL is not set — add it to .env (see .env.example)')
  }
  if (testUrl === process.env.DATABASE_URL) {
    throw new Error('TEST_DATABASE_URL must point to a different database than DATABASE_URL')
  }
  // Belt and braces before wiping: the db name must look like a test db
  if (!/test/i.test(new URL(testUrl).pathname)) {
    throw new Error(`Refusing to wipe "${new URL(testUrl).pathname}" — name must contain "test"`)
  }

  // Creates bookify_test if missing and syncs the schema (no migration files
  // needed for a throwaway db)
  execSync('pnpm prisma db push', {
    env: { ...process.env, DATABASE_URL: testUrl },
    stdio: 'inherit',
  })

  // Clean slate for this run
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: testUrl }) })
  try {
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE "bookings", "ticket_tiers", "events", "users" RESTART IDENTITY CASCADE',
    )
  } finally {
    await prisma.$disconnect()
  }
}
