import type { Consumer } from 'kafkajs'
import { kafka } from '../kafka/client.js'
import { CONSUMER_GROUPS, TOPICS, type BookingEvent } from '../kafka/topics.js'

/**
 * Simulates an email/SMS service. In a real system this would call a
 * provider (SES, Twilio, ...). Runs in its OWN consumer group, so it gets
 * every message independently of the analytics consumer.
 */
export async function startNotificationConsumer(): Promise<Consumer> {
  const consumer = kafka.consumer({ groupId: CONSUMER_GROUPS.NOTIFICATIONS })

  await consumer.connect()
  await consumer.subscribe({ topic: TOPICS.BOOKING_EVENTS, fromBeginning: false })

  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      if (!message.value) return
      const event = JSON.parse(message.value.toString()) as BookingEvent

      // If this throws, kafkajs does NOT commit the offset and the message
      // is redelivered — at-least-once delivery. That's why handlers must be
      // idempotent (sending the same email twice is annoying; charging a
      // card twice is a disaster).
      const templates: Record<BookingEvent['type'], string> = {
        'booking.created': `📧 [email] Booking ${event.payload.bookingId} received — complete payment within the hold window!`,
        'booking.confirmed': `📧 [email] Booking ${event.payload.bookingId} CONFIRMED — ${event.payload.quantity} ticket(s), see you there!`,
        'booking.cancelled': `📧 [email] Booking ${event.payload.bookingId} cancelled — refund on its way.`,
        'booking.expired': `📧 [email] Booking ${event.payload.bookingId} expired — seats released.`,
      }

      console.log(
        `[notifications] p${partition}@${message.offset} ${event.type} → ${templates[event.type]}`,
      )
    },
  })

  console.log(`[notifications] consumer running (group: ${CONSUMER_GROUPS.NOTIFICATIONS})`)
  return consumer
}
