import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox'
import { EventsService } from './events.service.js'
import {
  CreateEventBody,
  EventListResponse,
  EventParams,
  EventResponse,
  EventStatsResponse,
} from './events.schemas.js'

const serialize = (event: {
  id: string
  title: string
  description: string
  venue: string
  startsAt: Date | string
  status: string
  tiers: {
    id: string
    name: string
    priceCents: number
    totalSeats: number
    availableSeats: number
  }[]
}) => ({
  ...event,
  startsAt: new Date(event.startsAt).toISOString(),
})

const eventsRoutes: FastifyPluginAsyncTypebox = async (app) => {
  const service = new EventsService(app.prisma, app.redis)

  app.get(
    '/',
    {
      schema: { tags: ['events'], response: { 200: EventListResponse } },
    },
    async () => {
      const { events, cached } = await service.list()
      return { data: events.map(serialize), cached }
    },
  )

  app.get(
    '/:id',
    {
      schema: { tags: ['events'], params: EventParams, response: { 200: EventResponse } },
    },
    async (req) => serialize(await service.getById(req.params.id)),
  )

  app.post(
    '/',
    {
      onRequest: [app.requireAdmin],
      schema: {
        tags: ['events'],
        security: [{ bearerAuth: [] }],
        body: CreateEventBody,
        response: { 201: EventResponse },
      },
    },
    async (req, reply) => {
      const event = await service.create(req.body)
      return reply.code(201).send(serialize(event))
    },
  )

  app.get(
    '/:id/stats',
    {
      onRequest: [app.requireAdmin],
      schema: {
        tags: ['events'],
        security: [{ bearerAuth: [] }],
        params: EventParams,
        response: { 200: EventStatsResponse },
      },
    },
    async (req) => ({
      eventId: req.params.id,
      stats: await service.getStats(req.params.id),
    }),
  )
}

export default eventsRoutes
