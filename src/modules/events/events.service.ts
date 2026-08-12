import type { Redis } from 'ioredis'
import type { Event, PrismaClient, TicketTier } from '../../generated/prisma/client.js'
import { NotFoundError } from '../../lib/errors.js'
import type { CreateEventBody } from './events.schemas.js'

const LIST_CACHE_KEY = 'cache:events:list'
const LIST_CACHE_TTL_SECONDS = 30

type EventWithTiers = Event & { tiers: TicketTier[] }

export class EventsService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly redis: Redis,
  ) {}

  async create(input: CreateEventBody): Promise<EventWithTiers> {
    const event = await this.prisma.event.create({
      data: {
        title: input.title,
        description: input.description,
        venue: input.venue,
        startsAt: new Date(input.startsAt),
        tiers: {
          create: input.tiers.map((t) => ({
            name: t.name,
            priceCents: t.priceCents,
            totalSeats: t.totalSeats,
            availableSeats: t.totalSeats,
          })),
        },
      },
      include: { tiers: true },
    })

    // A new event invalidates the cached list (cache-aside pattern)
    await this.redis.del(LIST_CACHE_KEY)
    return event
  }

  async list(): Promise<{ events: EventWithTiers[]; cached: boolean }> {
    const cached = await this.redis.get(LIST_CACHE_KEY)
    if (cached) {
      return { events: JSON.parse(cached) as EventWithTiers[], cached: true }
    }

    const events = await this.prisma.event.findMany({
      where: { status: 'PUBLISHED', startsAt: { gt: new Date() } },
      include: { tiers: true },
      orderBy: { startsAt: 'asc' },
      take: 100,
    })

    await this.redis.set(LIST_CACHE_KEY, JSON.stringify(events), 'EX', LIST_CACHE_TTL_SECONDS)
    return { events, cached: false }
  }

  async getById(id: string): Promise<EventWithTiers> {
    const event = await this.prisma.event.findUnique({
      where: { id },
      include: { tiers: true },
    })
    if (!event) throw new NotFoundError('Event not found')
    return event
  }

  /** Live counters maintained by the Kafka analytics consumer. */
  async getStats(id: string): Promise<Record<string, number>> {
    await this.getById(id) // 404 if the event doesn't exist
    const raw = await this.redis.hgetall(`analytics:event:${id}`)
    return Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Number(v)]))
  }
}
