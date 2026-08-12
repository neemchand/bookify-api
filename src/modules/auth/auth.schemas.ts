import { Type, type Static } from '@sinclair/typebox'

export const RegisterBody = Type.Object({
  email: Type.String({ format: 'email' }),
  password: Type.String({ minLength: 8, maxLength: 128 }),
  name: Type.String({ minLength: 1, maxLength: 100 }),
})
export type RegisterBody = Static<typeof RegisterBody>

export const LoginBody = Type.Object({
  email: Type.String({ format: 'email' }),
  password: Type.String(),
})
export type LoginBody = Static<typeof LoginBody>

export const AuthResponse = Type.Object({
  token: Type.String(),
  user: Type.Object({
    id: Type.String(),
    email: Type.String(),
    name: Type.String(),
    role: Type.String(),
  }),
})
