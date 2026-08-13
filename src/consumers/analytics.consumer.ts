import type { Consumer } from 'kafkajs'
import { kafka } from '../kafka/client.js'
import { createRedisClient } from '../lib/redis.js'
import { CONSUMER_GROUPS, TOPICS, type BookingEvent } from '../kafka/topics.js'

/**
 * Builds live per-event stats in Redis from the booking event stream.
 * Read them back via GET /api/v1/events/:id/stats (admin).
 *
 * This is a tiny "stream processing" job: the source of truth stays in
 * Postgres, the derived view lives in Redis and could be rebuilt at any
 * time by replaying the topic from offset 0.
 */
export async function startAnalyticsConsumer(): Promise<Consumer> {
  const redis = createRedisClient()
  const consumer = kafka.consumer({ groupId: CONSUMER_GROUPS.ANALYTICS })

  await consumer.connect()
  await consumer.subscribe({ topic: TOPICS.BOOKING_EVENTS, fromBeginning: true })

  await consumer.run({
    eachMessage: async ({ message }) => {
      if (!message.value) return
      const event = JSON.parse(message.value.toString()) as BookingEvent
      const key = `analytics:event:${event.payload.bookedEventId}`

      // Idempotency guard: skip Kafka messages we've already applied, so a
      // redelivery (at-least-once) doesn't double-count.
      const seen = await redis.set(`analytics:seen:${event.eventId}`, '1', 'EX', 86_400, 'NX')
      if (seen === null) return

      const pipeline = redis.pipeline()
      pipeline.hincrby(key, event.type, 1)
      if (event.type === 'booking.confirmed') {
        pipeline.hincrby(key, 'seats.sold', event.payload.quantity)
        pipeline.hincrby(key, 'revenue.cents', event.payload.totalCents)
      }
      await pipeline.exec()

      console.log(`[analytics] applied ${event.type} for event ${event.payload.bookedEventId}`)
    },
  })

  console.log(`[analytics] consumer running (group: ${CONSUMER_GROUPS.ANALYTICS})`)
  return consumer
}
