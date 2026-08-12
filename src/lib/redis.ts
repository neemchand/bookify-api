import { Redis } from 'ioredis'
import { env } from '../config/env.js'

export function createRedisClient(): Redis {
  return new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: 2,
    enableReadyCheck: true,
    keyPrefix: env.REDIS_KEY_PREFIX,
  })
}
