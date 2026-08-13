import type { Booking, PrismaClient } from '../../generated/prisma/client.js'
import { env } from '../../config/env.js'
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  SeatsUnavailableError,
} from '../../lib/errors.js'
import type { BookingEvent, BookingEventType } from '../../kafka/topics.js'
import type { CreateBookingBody } from './bookings.schemas.js'

type PublishFn = (type: BookingEventType, payload: BookingEvent['payload']) => Promise<void>

export class BookingsService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly publish: PublishFn,
  ) {}

  /**
   * Reserve seats. This is the race-condition-critical path:
   * thousands of users may hit the same tier at the same moment.
   *
   * The trick is the CONDITIONAL ATOMIC DECREMENT — `updateMany` with
   * `availableSeats >= quantity` in the WHERE clause compiles to:
   *
   *   UPDATE ticket_tiers SET available_seats = available_seats - $qty
   *   WHERE id = $tierId AND available_seats >= $qty
   *
   * Postgres row-locks during the update, so two concurrent requests can
   * never both pass the check — one gets count=1, the other count=0.
   * No SELECT-then-UPDATE gap, therefore no overselling.
   */
  async reserve(
    userId: string,
    input: CreateBookingBody,
    idempotencyKey?: string,
  ): Promise<Booking> {
    // Idempotency: a client retrying the same request (same key) gets the
    // original booking back instead of double-booking.
    if (idempotencyKey) {
      const existing = await this.prisma.booking.findUnique({ where: { idempotencyKey } })
      if (existing) return existing
    }

    const tier = await this.prisma.ticketTier.findUnique({
      where: { id: input.tierId },
      include: { event: true },
    })
    if (!tier || tier.eventId !== input.eventId) {
      throw new NotFoundError('Ticket tier not found for this event')
    }
    if (tier.event.status !== 'PUBLISHED' || tier.event.startsAt <= new Date()) {
      throw new ConflictError('This event is not open for booking')
    }

    const expiresAt = new Date(Date.now() + env.BOOKING_HOLD_MINUTES * 60_000)

    let booking: Booking
    try {
      booking = await this.prisma.$transaction(async (tx) => {
        const decremented = await tx.ticketTier.updateMany({
          where: { id: input.tierId, availableSeats: { gte: input.quantity } },
          data: { availableSeats: { decrement: input.quantity } },
        })
        if (decremented.count === 0) throw new SeatsUnavailableError()

        return tx.booking.create({
          data: {
            userId,
            eventId: input.eventId,
            tierId: input.tierId,
            quantity: input.quantity,
            totalCents: tier.priceCents * input.quantity,
            expiresAt,
            idempotencyKey: idempotencyKey ?? null,
          },
        })
      })
    } catch (err: unknown) {
      // Two concurrent requests with the same idempotency key: the loser of
      // the unique-constraint race returns the winner's booking.
      if (idempotencyKey && err instanceof Error && 'code' in err && err.code === 'P2002') {
        const existing = await this.prisma.booking.findUnique({ where: { idempotencyKey } })
        if (existing) return existing
      }
      throw err
    }

    await this.emit('booking.created', booking)
    return booking
  }

  /** Mock payment success → confirm. Swap for a Stripe webhook in Phase 3. */
  async confirm(userId: string, bookingId: string): Promise<Booking> {
    const booking = await this.getOwned(userId, bookingId)

    // Guarded state transition: only PENDING and unexpired bookings confirm.
    // updateMany returns a count instead of throwing, letting us treat the
    // WHERE clause as a compare-and-swap.
    const updated = await this.prisma.booking.updateMany({
      where: { id: bookingId, status: 'PENDING', expiresAt: { gt: new Date() } },
      data: { status: 'CONFIRMED' },
    })
    if (updated.count === 0) {
      throw new ConflictError('Booking cannot be confirmed (already processed or expired)')
    }

    const confirmed = { ...booking, status: 'CONFIRMED' as const }
    await this.emit('booking.confirmed', confirmed)
    return confirmed
  }

  async cancel(userId: string, bookingId: string): Promise<Booking> {
    const booking = await this.getOwned(userId, bookingId)

    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.booking.updateMany({
        where: { id: bookingId, status: { in: ['PENDING', 'CONFIRMED'] } },
        data: { status: 'CANCELLED' },
      })
      if (updated.count === 0) {
        throw new ConflictError('Booking cannot be cancelled')
      }
      // Return the seats to the pool atomically with the status change
      await tx.ticketTier.update({
        where: { id: booking.tierId },
        data: { availableSeats: { increment: booking.quantity } },
      })
    })

    const cancelled = { ...booking, status: 'CANCELLED' as const }
    await this.emit('booking.cancelled', cancelled)
    return cancelled
  }

  async listForUser(userId: string): Promise<Booking[]> {
    return this.prisma.booking.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    })
  }

  async getOwned(userId: string, bookingId: string): Promise<Booking> {
    const booking = await this.prisma.booking.findUnique({ where: { id: bookingId } })
    if (!booking) throw new NotFoundError('Booking not found')
    if (booking.userId !== userId) throw new ForbiddenError()
    return booking
  }

  private async emit(type: BookingEventType, booking: Booking): Promise<void> {
    await this.publish(type, {
      bookingId: booking.id,
      userId: booking.userId,
      bookedEventId: booking.eventId,
      tierId: booking.tierId,
      quantity: booking.quantity,
      totalCents: booking.totalCents,
    })
  }
}
