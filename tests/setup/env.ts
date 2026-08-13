/**
 * Runs in every vitest worker BEFORE any test file (and therefore before
 * src/config/env.ts) is imported. Repoints the app at the isolated test
 * database and namespaces all Redis keys so test runs never touch dev data.
 * Explicit assignment wins because dotenv/loadEnvFile never overrides
 * variables that are already set.
 */
process.loadEnvFile()

if (!process.env.TEST_DATABASE_URL) {
  throw new Error('TEST_DATABASE_URL is not set — add it to .env (see .env.example)')
}

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL
process.env.REDIS_KEY_PREFIX = 'test:'
process.env.KAFKA_TOPIC_PREFIX = 'test.'
