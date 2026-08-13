import { Type } from '@sinclair/typebox'
import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox'
import type { Booking } from '../../generated/prisma/client.js'
import { BookingsService } from './bookings.service.js'
import {
  BookingListResponse,
  BookingParams,
  BookingResponse,
  CreateBookingBody,
} from './bookings.schemas.js'

const serialize = (b: Booking) => ({
  id: b.id,
  eventId: b.eventId,
  tierId: b.tierId,
  quantity: b.quantity,
  totalCents: b.totalCents,
  status: b.status,
  expiresAt: b.expiresAt.toISOString(),
  createdAt: b.createdAt.toISOString(),
})

const bookingsRoutes: FastifyPluginAsyncTypebox = async (app) => {
  const service = new BookingsService(app.prisma, app.publishBookingEvent)

  app.post(
    '/',
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ['bookings'],
        security: [{ bearerAuth: [] }],
        body: CreateBookingBody,
        headers: Type.Object({
          'idempotency-key': Type.Optional(Type.String({ maxLength: 128 })),
        }),
        response: { 201: BookingResponse },
      },
    },
    async (req, reply) => {
      const booking = await service.reserve(
        req.user.sub,
        req.body,
        req.headers['idempotency-key'],
      )
      return reply.code(201).send(serialize(booking))
    },
  )

  app.get(
    '/',
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ['bookings'],
        security: [{ bearerAuth: [] }],
        response: { 200: BookingListResponse },
      },
    },
    async (req) => ({ data: (await service.listForUser(req.user.sub)).map(serialize) }),
  )

  app.get(
    '/:id',
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ['bookings'],
        security: [{ bearerAuth: [] }],
        params: BookingParams,
        response: { 200: BookingResponse },
      },
    },
    async (req) => serialize(await service.getOwned(req.user.sub, req.params.id)),
  )

  app.post(
    '/:id/confirm',
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ['bookings'],
        security: [{ bearerAuth: [] }],
        params: BookingParams,
        response: { 200: BookingResponse },
      },
    },
    async (req) => serialize(await service.confirm(req.user.sub, req.params.id)),
  )

  app.post(
    '/:id/cancel',
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ['bookings'],
        security: [{ bearerAuth: [] }],
        params: BookingParams,
        response: { 200: BookingResponse },
      },
    },
    async (req) => serialize(await service.cancel(req.user.sub, req.params.id)),
  )
}

export default bookingsRoutes
