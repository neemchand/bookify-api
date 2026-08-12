import argon2 from 'argon2'
import type { PrismaClient, User } from '../../generated/prisma/client.js'
import { ConflictError, UnauthorizedError } from '../../lib/errors.js'
import type { LoginBody, RegisterBody } from './auth.schemas.js'

export class AuthService {
  constructor(private readonly prisma: PrismaClient) {}

  async register(input: RegisterBody): Promise<User> {
    const passwordHash = await argon2.hash(input.password)

    try {
      return await this.prisma.user.create({
        data: { email: input.email.toLowerCase(), passwordHash, name: input.name },
      })
    } catch (err: unknown) {
      // P2002 = Prisma unique-constraint violation
      if (err instanceof Error && 'code' in err && err.code === 'P2002') {
        throw new ConflictError('An account with this email already exists')
      }
      throw err
    }
  }

  async login(input: LoginBody): Promise<User> {
    const user = await this.prisma.user.findUnique({
      where: { email: input.email.toLowerCase() },
    })

    // Verify against a dummy hash even when the user doesn't exist, so
    // response timing doesn't reveal which emails are registered.
    if (!user) {
      await argon2.verify(
        '$argon2id$v=19$m=65536,t=3,p=4$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        input.password,
      ).catch(() => false)
      throw new UnauthorizedError()
    }

    const valid = await argon2.verify(user.passwordHash, input.password)
    if (!valid) throw new UnauthorizedError()

    return user
  }
}
