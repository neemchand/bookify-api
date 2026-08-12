import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox'
import type { User } from '../../generated/prisma/client.js'
import { AuthService } from './auth.service.js'
import { AuthResponse, LoginBody, RegisterBody } from './auth.schemas.js'

const authRoutes: FastifyPluginAsyncTypebox = async (app) => {
  const service = new AuthService(app.prisma)

  const toAuthResponse = (user: User) => ({
    token: app.jwt.sign({ sub: user.id, email: user.email, role: user.role }),
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
  })

  app.post(
    '/register',
    {
      schema: {
        tags: ['auth'],
        body: RegisterBody,
        response: { 201: AuthResponse },
      },
    },
    async (req, reply) => {
      const user = await service.register(req.body)
      return reply.code(201).send(toAuthResponse(user))
    },
  )

  app.post(
    '/login',
    {
      schema: {
        tags: ['auth'],
        body: LoginBody,
        response: { 200: AuthResponse },
      },
      config: {
        // Tighter limit on login to slow down credential stuffing
        rateLimit: { max: 10, timeWindow: '1 minute' },
      },
    },
    async (req) => {
      const user = await service.login(req.body)
      return toAuthResponse(user)
    },
  )
}

export default authRoutes
