import { env } from '../config/env.js'

export const TOPICS = {
  /**
   * All booking lifecycle events for every event/venue.
   * Messages are KEYED BY eventId so all bookings for the same event land on
   * the same partition — Kafka only guarantees ordering within a partition.
   */
  BOOKING_EVENTS: `${env.KAFKA_TOPIC_PREFIX}bookify.booking-events`,
} as const

export const CONSUMER_GROUPS = {
  NOTIFICATIONS: 'bookify-notification-service',
  ANALYTICS: 'bookify-analytics-service',
} as const

export type BookingEventType =
  | 'booking.created'
  | 'booking.confirmed'
  | 'booking.cancelled'
  | 'booking.expired'

export interface BookingEvent {
  /** Unique id of this event message — lets consumers deduplicate (idempotency). */
  eventId: string
  type: BookingEventType
  occurredAt: string
  payload: {
    bookingId: string
    userId: string
    /** The venue event being booked (not to be confused with this Kafka message's eventId). */
    bookedEventId: string
    tierId: string
    quantity: number
    totalCents: number
  }
}
