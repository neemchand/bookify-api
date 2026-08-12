import { randomUUID } from 'node:crypto'
import type { Producer } from 'kafkajs'
import { kafka } from './client.js'
import { TOPICS, type BookingEvent, type BookingEventType } from './topics.js'

export function createProducer(): Producer {
  // Idempotent producer: broker deduplicates retried sends, so a network
  // retry can never publish the same message twice.
  return kafka.producer({ idempotent: true, allowAutoTopicCreation: false })
}

export async function publishBookingEvent(
  producer: Producer,
  type: BookingEventType,
  payload: BookingEvent['payload'],
): Promise<void> {
  const event: BookingEvent = {
    eventId: randomUUID(),
    type,
    occurredAt: new Date().toISOString(),
    payload,
  }

  await producer.send({
    topic: TOPICS.BOOKING_EVENTS,
    messages: [
      {
        // Key by the venue event id → per-event ordering within a partition.
        key: payload.bookedEventId,
        value: JSON.stringify(event),
        headers: { 'event-type': type },
      },
    ],
  })
}
