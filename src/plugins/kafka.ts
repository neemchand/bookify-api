import fp from 'fastify-plugin'
import { ensureTopics } from '../kafka/admin.js'
import { createProducer, publishBookingEvent } from '../kafka/producer.js'
import type { BookingEvent, BookingEventType } from '../kafka/topics.js'

declare module 'fastify' {
  interface FastifyInstance {
    publishBookingEvent: (
      type: BookingEventType,
      payload: BookingEvent['payload'],
    ) => Promise<void>
  }
}

export default fp(
  async (app) => {
    await ensureTopics()
    const producer = createProducer()
    await producer.connect()

    app.decorate('publishBookingEvent', async (type, payload) => {
      // Publishing happens AFTER the DB commit. If Kafka is briefly down we
      // log and move on rather than failing the user's booking — the trade-off
      // is a possibly-lost event. The proper fix is the
      // Transactional Outbox pattern (see README roadmap, Phase 2).
      try {
        await publishBookingEvent(producer, type, payload)
      } catch (err) {
        app.log.error({ err, type, payload }, 'failed to publish booking event')
      }
    })

    app.addHook('onClose', async () => {
      await producer.disconnect()
    })
  },
  { name: 'kafka' },
)
