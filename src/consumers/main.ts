import closeWithGrace from 'close-with-grace'
import { ensureTopics } from '../kafka/admin.js'
import { startNotificationConsumer } from './notification.consumer.js'
import { startAnalyticsConsumer } from './analytics.consumer.js'

/**
 * Consumer entrypoint — run alongside the API server:  pnpm dev:consumers
 *
 * Both consumers subscribe to the same topic in DIFFERENT consumer groups,
 * so each group receives every message. Scale a group horizontally by
 * running more instances of this process: Kafka rebalances partitions
 * across the group's members automatically.
 */
await ensureTopics()
const consumers = await Promise.all([startNotificationConsumer(), startAnalyticsConsumer()])

closeWithGrace({ delay: 10_000 }, async () => {
  await Promise.allSettled(consumers.map((c) => c.disconnect()))
})
