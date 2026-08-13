import argon2 from 'argon2'
import { createPrismaClient } from '../src/lib/prisma.js'

const prisma = createPrismaClient()

const admin = await prisma.user.upsert({
  where: { email: 'admin@bookify.dev' },
  update: {},
  create: {
    email: 'admin@bookify.dev',
    passwordHash: await argon2.hash('admin12345'),
    name: 'Bookify Admin',
    role: 'ADMIN',
  },
})

const user = await prisma.user.upsert({
  where: { email: 'alice@example.com' },
  update: {},
  create: {
    email: 'alice@example.com',
    passwordHash: await argon2.hash('alice12345'),
    name: 'Alice Example',
    role: 'USER',
  },
})

const existing = await prisma.event.findFirst({ where: { title: 'Node.js Conf 2026' } })
const event =
  existing ??
  (await prisma.event.create({
    data: {
      title: 'Node.js Conf 2026',
      description: 'Two days of talks on the modern Node.js ecosystem.',
      venue: 'ExCeL London',
      startsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      tiers: {
        create: [
          { name: 'General Admission', priceCents: 9900, totalSeats: 500, availableSeats: 500 },
          { name: 'VIP', priceCents: 24900, totalSeats: 50, availableSeats: 50 },
        ],
      },
    },
  }))

console.log('Seeded:')
console.log(`  admin: ${admin.email} / admin12345`)
console.log(`  user:  ${user.email} / alice12345`)
console.log(`  event: ${event.title} (${event.id})`)

await prisma.$disconnect()
