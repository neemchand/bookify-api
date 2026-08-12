import { kafka } from './client.js'
import { TOPICS } from './topics.js'

/**
 * Create our topics explicitly at startup. Relying on broker auto-creation
 * is a trap: consumers crash if they subscribe before the first message is
 * ever produced, and auto-created topics get default partition counts.
 * Production clusters usually disable auto-creation entirely.
 */
export async function ensureTopics(): Promise<void> {
  const admin = kafka.admin()
  await admin.connect()
  try {
    await admin.createTopics({
      waitForLeaders: true,
      topics: [
        {
          topic: TOPICS.BOOKING_EVENTS,
          // 3 partitions → up to 3 consumers per group can share the load.
          // Messages with the same key (eventId) always land on the same
          // partition, preserving per-event ordering.
          numPartitions: 3,
          replicationFactor: 1,
        },
      ],
    })
  } finally {
    await admin.disconnect()
  }
}
