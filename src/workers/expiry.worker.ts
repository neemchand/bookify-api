import closeWithGrace from 'close-with-grace'
import { createPrismaClient } from '../lib/prisma.js'
import { createProducer, publishBookingEvent } from '../kafka/producer.js'

/**
 * Expires PENDING bookings whose hold window has passed and returns their
 * seats to the pool. Run with:  pnpm dev:worker
 *
 * The updateMany status guard makes each expiry a compare-and-swap, so this
 * worker is safe to run in multiple replicas — if another replica (or a
 * user confirming at the last second) got there first, count is 0 and we
 * skip. This "sweeper loop" is a classic production pattern; a fancier
 * version uses BullMQ delayed jobs or Postgres SKIP LOCKED.
 */
const POLL_INTERVAL_MS = 15_000
const BATCH_SIZE = 50

const prisma = createPrismaClient()
const producer = createProducer()
await producer.connect()

let running = true

async function sweep(): Promise<void> {
  const expired = await prisma.booking.findMany({
    where: { status: 'PENDING', expiresAt: { lt: new Date() } },
    take: BATCH_SIZE,
  })

  for (const booking of expired) {
    const didExpire = await prisma.$transaction(async (tx) => {
      const updated = await tx.booking.updateMany({
        where: { id: booking.id, status: 'PENDING' },
        data: { status: 'EXPIRED' },
      })
      if (updated.count === 0) return false

      await tx.ticketTier.update({
        where: { id: booking.tierId },
        data: { availableSeats: { increment: booking.quantity } },
      })
      return true
    })

    if (didExpire) {
      console.log(`[expiry] booking ${booking.id} expired, ${booking.quantity} seat(s) released`)
      await publishBookingEvent(producer, 'booking.expired', {
        bookingId: booking.id,
        userId: booking.userId,
        bookedEventId: booking.eventId,
        tierId: booking.tierId,
        quantity: booking.quantity,
        totalCents: booking.totalCents,
      }).catch((err) => console.error('[expiry] failed to publish event', err))
    }
  }
}

console.log(`[expiry] worker started, sweeping every ${POLL_INTERVAL_MS / 1000}s`)
while (running) {
  await sweep().catch((err) => console.error('[expiry] sweep failed', err))
  await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
}

closeWithGrace({ delay: 5_000 }, async () => {
  running = false
  await producer.disconnect()
  await prisma.$disconnect()
})
