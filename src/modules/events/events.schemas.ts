import { Type, type Static } from '@sinclair/typebox'

export const CreateEventBody = Type.Object({
  title: Type.String({ minLength: 1, maxLength: 200 }),
  description: Type.String({ maxLength: 5000 }),
  venue: Type.String({ minLength: 1, maxLength: 200 }),
  startsAt: Type.String({ format: 'date-time' }),
  tiers: Type.Array(
    Type.Object({
      name: Type.String({ minLength: 1, maxLength: 100 }),
      priceCents: Type.Integer({ minimum: 0 }),
      totalSeats: Type.Integer({ minimum: 1, maximum: 100000 }),
    }),
    { minItems: 1, maxItems: 20 },
  ),
})
export type CreateEventBody = Static<typeof CreateEventBody>

export const EventParams = Type.Object({
  id: Type.String({ format: 'uuid' }),
})

const Tier = Type.Object({
  id: Type.String(),
  name: Type.String(),
  priceCents: Type.Integer(),
  totalSeats: Type.Integer(),
  availableSeats: Type.Integer(),
})

export const EventResponse = Type.Object({
  id: Type.String(),
  title: Type.String(),
  description: Type.String(),
  venue: Type.String(),
  startsAt: Type.String(),
  status: Type.String(),
  tiers: Type.Array(Tier),
})

export const EventListResponse = Type.Object({
  data: Type.Array(EventResponse),
  cached: Type.Boolean(),
})

export const EventStatsResponse = Type.Object({
  eventId: Type.String(),
  stats: Type.Record(Type.String(), Type.Integer()),
})
