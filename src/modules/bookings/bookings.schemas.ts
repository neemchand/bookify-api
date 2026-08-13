import { Type, type Static } from '@sinclair/typebox'

export const CreateBookingBody = Type.Object({
  eventId: Type.String({ format: 'uuid' }),
  tierId: Type.String({ format: 'uuid' }),
  quantity: Type.Integer({ minimum: 1, maximum: 10 }),
})
export type CreateBookingBody = Static<typeof CreateBookingBody>

export const BookingParams = Type.Object({
  id: Type.String({ format: 'uuid' }),
})

export const BookingResponse = Type.Object({
  id: Type.String(),
  eventId: Type.String(),
  tierId: Type.String(),
  quantity: Type.Integer(),
  totalCents: Type.Integer(),
  status: Type.String(),
  expiresAt: Type.String(),
  createdAt: Type.String(),
})

export const BookingListResponse = Type.Object({
  data: Type.Array(BookingResponse),
})
