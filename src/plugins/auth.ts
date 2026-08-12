import fp from 'fastify-plugin'
import fastifyJwt from '@fastify/jwt'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { env } from '../config/env.js'
import { ForbiddenError, UnauthorizedError } from '../lib/errors.js'

export interface JwtUser {
  sub: string
  email: string
  role: 'USER' | 'ADMIN'
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: JwtUser
    user: JwtUser
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>
    requireAdmin: (req: FastifyRequest, reply: FastifyReply) => Promise<void>
  }
}

export default fp(
  async (app) => {
    await app.register(fastifyJwt, {
      secret: env.JWT_SECRET,
      sign: { expiresIn: env.JWT_EXPIRES_IN },
    })

    app.decorate('authenticate', async (req: FastifyRequest) => {
      try {
        await req.jwtVerify()
      } catch {
        throw new UnauthorizedError('Missing or invalid access token')
      }
    })

    app.decorate('requireAdmin', async (req: FastifyRequest) => {
      try {
        await req.jwtVerify()
      } catch {
        throw new UnauthorizedError('Missing or invalid access token')
      }
      if (req.user.role !== 'ADMIN') {
        throw new ForbiddenError('Admin access required')
      }
    })
  },
  { name: 'auth' },
)
