import { envSchema } from 'env-schema'
import { Type, type Static } from '@sinclair/typebox'

const schema = Type.Object({
  NODE_ENV: Type.Union(
    [Type.Literal('development'), Type.Literal('production'), Type.Literal('test')],
    { default: 'development' },
  ),
  PORT: Type.Number({ default: 3010 }),
  HOST: Type.String({ default: '0.0.0.0' }),
  LOG_LEVEL: Type.String({ default: 'info' }),
  DATABASE_URL: Type.String(),
  REDIS_URL: Type.String(),
  // Namespaces every Redis key (tests use 'test:' so runs never collide with dev)
  REDIS_KEY_PREFIX: Type.String({ default: '' }),
  KAFKA_BROKERS: Type.String(),
  KAFKA_CLIENT_ID: Type.String({ default: 'bookify-api' }),
  // Namespaces topics (tests use 'test.' so dev consumers never see test events)
  KAFKA_TOPIC_PREFIX: Type.String({ default: '' }),
  JWT_SECRET: Type.String({ minLength: 16 }),
  JWT_EXPIRES_IN: Type.String({ default: '1h' }),
  BOOKING_HOLD_MINUTES: Type.Number({ default: 10 }),
  RATE_LIMIT_MAX: Type.Number({ default: 300 }),
})

export type Env = Static<typeof schema>

export const env = envSchema<Env>({ schema, dotenv: true })

export const isProduction = env.NODE_ENV === 'production'
