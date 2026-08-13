/**
 * Database Client — Prisma + SQLite
 *
 * Ensures the database directory exists before connecting.
 * Uses a global singleton to survive HMR in development.
 */

import { PrismaClient } from '@prisma/client'
import { mkdirSync } from 'fs'
import { dirname, resolve } from 'path'

// Resolve relative to project root (wherever node runs from)
const dbUrl = process.env.DATABASE_URL || 'file:./db/custom.db'
const dbPath = dbUrl.replace(/^file:/, '')
const absoluteDbPath = resolve(process.cwd(), dbPath)

try {
  mkdirSync(dirname(absoluteDbPath), { recursive: true })
} catch {
  // Directory exists or cannot be created — Prisma will report the real error
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const prisma = globalForPrisma.prisma ?? new PrismaClient({
  datasources: {
    db: { url: `file:${absoluteDbPath}` },
  },
})

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma

export default prisma
