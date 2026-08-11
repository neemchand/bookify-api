// Prisma 7: config lives here (schema files no longer hold connection URLs,
// and .env is no longer auto-loaded by the CLI)
process.loadEnvFile()

import { defineConfig, env } from 'prisma/config'

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: env('DATABASE_URL'),
  },
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
})
