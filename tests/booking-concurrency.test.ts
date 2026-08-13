import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { createTestApp, createTestEvent, registerUser } from './helpers.js'

/**
 * THE test that justifies the whole architecture.
 *
 * 20 users race for 5 seats at the same instant. If the reservation logic
 * had a SELECT-then-UPDATE gap, more than 5 would win and we would
 * oversell. The conditional atomic decrement guarantees exactly 5 succeed.
 */
describe('booking concurrency', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await createTestApp()
  })
  afterAll(async () => {
    await app.close()
  })

  it('never oversells: 20 concurrent requests for 5 seats → exactly 5 succeed', async () => {
    const { eventId, tierId } = await createTestEvent(app, 5)
    const users = await Promise.all(Array.from({ length: 20 }, () => registerUser(app)))

    const responses = await Promise.all(
      users.map((u) =>
        app.inject({
          method: 'POST',
          url: '/api/v1/bookings',
          headers: { authorization: `Bearer ${u.token}` },
          payload: { eventId, tierId, quantity: 1 },
        }),
      ),
    )

    const succeeded = responses.filter((r) => r.statusCode === 201)
    const rejected = responses.filter((r) => r.statusCode === 409)

    expect(succeeded).toHaveLength(5)
    expect(rejected).toHaveLength(15)

    const tier = await app.prisma.ticketTier.findUniqueOrThrow({ where: { id: tierId } })
    expect(tier.availableSeats).toBe(0)
  })

  it('is idempotent: same Idempotency-Key twice → same booking, seats decremented once', async () => {
    const { eventId, tierId } = await createTestEvent(app, 10)
    const user = await registerUser(app)
    const key = `retry-${eventId}`

    const inject = () =>
      app.inject({
        method: 'POST',
        url: '/api/v1/bookings',
        headers: { authorization: `Bearer ${user.token}`, 'idempotency-key': key },
        payload: { eventId, tierId, quantity: 2 },
      })

    const first = await inject()
    const second = await inject()

    expect(first.statusCode).toBe(201)
    expect(second.statusCode).toBe(201)
    expect(second.json().id).toBe(first.json().id)

    const tier = await app.prisma.ticketTier.findUniqueOrThrow({ where: { id: tierId } })
    expect(tier.availableSeats).toBe(8)
  })

  it('returns seats to the pool on cancel', async () => {
    const { eventId, tierId } = await createTestEvent(app, 10)
    const user = await registerUser(app)

    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/bookings',
      headers: { authorization: `Bearer ${user.token}` },
      payload: { eventId, tierId, quantity: 3 },
    })
    expect(created.statusCode).toBe(201)

    const cancelled = await app.inject({
      method: 'POST',
      url: `/api/v1/bookings/${created.json().id}/cancel`,
      headers: { authorization: `Bearer ${user.token}` },
    })
    expect(cancelled.statusCode).toBe(200)

    const tier = await app.prisma.ticketTier.findUniqueOrThrow({ where: { id: tierId } })
    expect(tier.availableSeats).toBe(10)
  })

  it('confirm transitions PENDING → CONFIRMED exactly once', async () => {
    const { eventId, tierId } = await createTestEvent(app, 10)
    const user = await registerUser(app)

    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/bookings',
      headers: { authorization: `Bearer ${user.token}` },
      payload: { eventId, tierId, quantity: 1 },
    })
    const id = created.json().id

    const confirm = () =>
      app.inject({
        method: 'POST',
        url: `/api/v1/bookings/${id}/confirm`,
        headers: { authorization: `Bearer ${user.token}` },
      })

    expect((await confirm()).statusCode).toBe(200)
    // Second confirm hits the compare-and-swap guard
    expect((await confirm()).statusCode).toBe(409)
  })

  it("blocks access to another user's booking", async () => {
    const { eventId, tierId } = await createTestEvent(app, 10)
    const owner = await registerUser(app)
    const stranger = await registerUser(app)

    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/bookings',
      headers: { authorization: `Bearer ${owner.token}` },
      payload: { eventId, tierId, quantity: 1 },
    })

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/bookings/${created.json().id}`,
      headers: { authorization: `Bearer ${stranger.token}` },
    })
    expect(res.statusCode).toBe(403)
  })
})
