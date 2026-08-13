import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { createTestApp } from './helpers.js'

describe('auth', () => {
  let app: FastifyInstance
  const email = `auth-${randomUUID()}@test.dev`

  beforeAll(async () => {
    app = await createTestApp()
  })
  afterAll(async () => {
    await app.close()
  })

  it('registers a new user and returns a JWT', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email, password: 'password123', name: 'Auth Test' },
    })
    expect(res.statusCode).toBe(201)
    expect(res.json().token).toBeTypeOf('string')
  })

  it('rejects a duplicate email with 409', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email, password: 'password123', name: 'Auth Test' },
    })
    expect(res.statusCode).toBe(409)
  })

  it('logs in with correct credentials', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email, password: 'password123' },
    })
    expect(res.statusCode).toBe(200)
  })

  it('rejects a wrong password with 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email, password: 'wrong-password' },
    })
    expect(res.statusCode).toBe(401)
  })

  it('rejects an invalid email at the schema layer with 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email: 'not-an-email', password: 'password123', name: 'X' },
    })
    expect(res.statusCode).toBe(400)
  })

  it('blocks protected routes without a token', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/bookings' })
    expect(res.statusCode).toBe(401)
  })
})
