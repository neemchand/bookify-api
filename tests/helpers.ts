import { randomUUID } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../src/app.js'

export async function createTestApp(): Promise<FastifyInstance> {
  const app = await buildApp()
  await app.ready()
  return app
}

export async function registerUser(app: FastifyInstance): Promise<{ token: string; id: string }> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    payload: {
      email: `test-${randomUUID()}@test.dev`,
      password: 'password123',
      name: 'Test User',
    },
  })
  if (res.statusCode !== 201) throw new Error(`register failed: ${res.body}`)
  const body = res.json() as { token: string; user: { id: string } }
  return { token: body.token, id: body.user.id }
}

export async function createTestEvent(
  app: FastifyInstance,
  seats: number,
): Promise<{ eventId: string; tierId: string }> {
  // Bypass the admin API and create directly — tests target booking logic
  const event = await app.prisma.event.create({
    data: {
      title: `Test Event ${randomUUID()}`,
      description: 'test',
      venue: 'Test Venue',
      startsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      tiers: {
        create: [{ name: 'GA', priceCents: 1000, totalSeats: seats, availableSeats: seats }],
      },
    },
    include: { tiers: true },
  })
  return { eventId: event.id, tierId: event.tiers[0]!.id }
}
