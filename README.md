# Bookify — Event Booking API

An event ticketing API for high-contention seat inventory: users race for limited seats,
bookings hold inventory with an expiry window, payments confirm them, and every state
change flows through **Kafka** to independent consumer services.

## Stack (all latest majors)

| Layer      | Tech                                             | Why                                                        |
| ---------- | ------------------------------------------------ | ---------------------------------------------------------- |
| Runtime    | Node.js 24, TypeScript 7, ESM                    | Modern baseline                                             |
| HTTP       | Fastify 5 + TypeBox                              | Fastest mainstream framework; schema-validated I/O + OpenAPI |
| Database   | PostgreSQL 17 + Prisma 7 (driver adapters)       | Transactions & constraints — non-negotiable for bookings    |
| Cache      | Redis 8 (ioredis)                                | Cache-aside event lists, distributed rate limiting, analytics counters |
| Events     | Apache Kafka 4 (KRaft, no ZooKeeper) via KafkaJS | Booking lifecycle stream → notification + analytics consumers |
| Auth       | JWT (@fastify/jwt) + argon2                      | Stateless auth, modern password hashing                     |
| Testing    | Vitest + fastify.inject()                        | Real integration tests incl. a concurrency/oversell test    |

## Architecture

```
                                   ┌─────────────────────┐
  POST /bookings                   │  Kafka topic:        │
 ┌────────┐   ┌───────────────┐    │  bookify.booking-    │   ┌──────────────────────┐
 │ Client │──▶│  Fastify API  │───▶│  events              │──▶│ notification consumer │──▶ "email"
 └────────┘   │  (server.ts)  │    │  (keyed by eventId,  │   ├──────────────────────┤
              └──────┬────────┘    │   3 partitions)      │──▶│ analytics consumer    │──▶ Redis stats
                     │             └─────────────────────┘    └──────────────────────┘
              ┌──────▼────────┐         ▲
              │  PostgreSQL   │         │ booking.expired
              │  (source of   │   ┌─────┴──────────┐
              │   truth)      │◀──│ expiry worker   │  sweeps PENDING bookings
              └───────────────┘   └────────────────┘  past their hold window
```

Three independent processes — API, consumers, worker — exactly how you'd deploy them
as separate services/pods in production.

## Quickstart

```bash
pnpm install
pnpm infra:up            # Postgres :5440, Redis :6390, Kafka :9092, Kafka UI :8085
pnpm db:migrate          # create schema
pnpm db:seed             # admin@bookify.dev/admin12345, alice@example.com/alice12345, demo event

pnpm dev                 # API           → http://localhost:3010  (Swagger at /docs)
pnpm dev:consumers       # Kafka consumers (separate terminal)
pnpm dev:worker          # booking-expiry worker (separate terminal)

pnpm test                # integration tests (needs infra up)
```

Kafka UI: <http://localhost:8085> — watch messages, partitions, consumer groups and lag live.

## Walk the core flow

```bash
# login (seeded user)
TOKEN=$(curl -s -X POST localhost:3010/api/v1/auth/login -H 'content-type: application/json' \
  -d '{"email":"alice@example.com","password":"alice12345"}' | jq -r .token)

# browse events (second call within 30s returns "cached": true)
curl -s localhost:3010/api/v1/events | jq

# reserve 2 seats — creates a PENDING booking holding inventory for 10 minutes
curl -s -X POST localhost:3010/api/v1/bookings \
  -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -H 'idempotency-key: my-retry-key-1' \
  -d '{"eventId":"<eventId>","tierId":"<tierId>","quantity":2}' | jq

# confirm (mock payment) → emits booking.confirmed to Kafka
curl -s -X POST localhost:3010/api/v1/bookings/<bookingId>/confirm \
  -H "authorization: Bearer $TOKEN" | jq

# watch the consumers terminal: notification "email" + analytics counters update

# admin: live stats built by the analytics consumer from the Kafka stream
ADMIN=$(curl -s -X POST localhost:3010/api/v1/auth/login -H 'content-type: application/json' \
  -d '{"email":"admin@bookify.dev","password":"admin12345"}' | jq -r .token)
curl -s localhost:3010/api/v1/events/<eventId>/stats -H "authorization: Bearer $ADMIN" | jq
```

## Design highlights

The details that make Bookify correct under load:

1. **No overselling under concurrency** — `bookings.service.ts` uses a *conditional atomic
   decrement* (`UPDATE ... WHERE available_seats >= qty`) instead of SELECT-then-UPDATE.
   Proven by `tests/booking-concurrency.test.ts`: 20 parallel requests, 5 seats, exactly 5 win.
2. **Idempotency keys** — retrying `POST /bookings` with the same `Idempotency-Key` header
   returns the original booking instead of double-charging. Unique constraint = the referee.
3. **Guarded state transitions** — confirm/cancel/expire use `updateMany` with the expected
   current state in the WHERE clause (a compare-and-swap), so double-confirms and
   confirm-vs-expire races resolve safely.
4. **Kafka fundamentals** — messages keyed by `eventId` for per-event ordering; two consumer
   *groups* each get every message; the analytics consumer replays `fromBeginning` and
   deduplicates via Redis `SET NX` (at-least-once delivery demands idempotent handlers).
5. **Explicit topic creation** — `kafka/admin.ts` creates topics at startup; relying on
   broker auto-creation crashes consumers that subscribe before the first message exists.
6. **Cache-aside + invalidation** — event list cached in Redis for 30s, invalidated on writes.
7. **Distributed rate limiting** — Redis-backed, so limits hold across API replicas;
   login gets a stricter per-route limit than the global one.
8. **Graceful shutdown** — `close-with-grace` drains in-flight requests, then plugins'
   `onClose` hooks disconnect Prisma/Redis/Kafka in order.
9. **Schema-validated I/O** — TypeBox schemas validate requests AND serialize responses
   (never leak `passwordHash`), and generate the Swagger docs at `/docs` for free.
10. **Timing-safe login** — verifies a dummy hash when the email doesn't exist so response
    time doesn't reveal which emails are registered.

## Operating the Kafka pipeline

- Run `pnpm dev:consumers` on **more than one** instance — Kafka rebalances the 3 partitions
  across the instances of each group, giving you horizontal scaling.
- Kill the consumers, make bookings, restart them — the analytics group resumes from its
  committed offset; nothing is lost.
- To rebuild analytics from scratch, delete the analytics Redis keys
  (`redis-cli -p 6390 --scan --pattern 'analytics:*' | xargs redis-cli -p 6390 del`),
  reset the group's offsets in Kafka UI, and restart — the stats replay from the event log.
- Errors thrown inside `eachMessage` trigger redelivery (at-least-once delivery), so
  handlers must stay idempotent.

## Testing

`pnpm test` runs real integration tests through `app.inject()` against fully **isolated
infrastructure** — you can run them any time without touching your dev data:

- **Postgres**: `TEST_DATABASE_URL` points at `bookify_test`; a vitest `globalSetup` syncs
  the schema (`prisma db push`) and truncates all tables before each run.
- **Redis**: every key is namespaced with `test:` via ioredis `keyPrefix` (rate-limit and
  cache TTLs make the keys self-cleaning).
- **Kafka**: topics are prefixed with `test.`, so dev consumers never see test events.

The wiring lives in `tests/setup/` — `env.ts` (per-worker env overrides, runs before the
app is imported) and `global-setup.ts` (one-time database reset).

## Roadmap

- **Reliability**: Transactional Outbox pattern (write events to an `outbox` table
  in the same DB transaction as the booking, publish from a relay — fixes the "DB committed
  but Kafka publish failed" gap in `plugins/kafka.ts`). Add a dead-letter topic + retry
  topic for poison messages.
- **Payments**: replace mock confirm with Stripe test-mode checkout + webhook
  handling (signature verification, webhook idempotency, refunds on cancel).
- **Observability**: OpenTelemetry traces (API → Kafka → consumer, one trace),
  Prometheus metrics + Grafana dashboard, structured log correlation via request ids.
- **Delivery**: GitHub Actions CI (lint, test with service containers, build the
  Dockerfile), then deploy API/consumers/worker as three services (Fly.io/Railway/k8s).
- **Scale**: load-test the booking endpoint with k6, add WebSocket seat-availability
  push, try Redis-based seat holds instead of DB decrements and compare under load,
  introduce a schema registry (Avro/JSON Schema) for the Kafka events.

## Project layout

```
src/
├── app.ts                  # buildApp(): plugins, error handler, routes
├── server.ts               # entrypoint + graceful shutdown
├── config/env.ts           # validated env (fail fast on misconfig)
├── lib/                    # prisma/redis factories, error types
├── plugins/                # fastify plugins: prisma, redis, kafka, auth, swagger
├── kafka/                  # client, typed event contracts, producer, admin
├── modules/                # auth / events / bookings / health (routes+service+schemas)
├── consumers/              # notification + analytics consumer processes
└── workers/                # booking-expiry sweeper
```

Seeded logins — admin: `admin@bookify.dev` / `admin12345`, user: `alice@example.com` / `alice12345`.
