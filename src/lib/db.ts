/**
 * Database Client — Prisma + SQLite
 *
 * Thin wrapper around Prisma Client for consistent API.
 * Ensures the database directory exists before connecting.
 */

import { PrismaClient } from '@prisma/client'
import { mkdirSync } from 'fs'
import { dirname } from 'path'

// Ensure the database directory exists
const dbUrl = process.env.DATABASE_URL || 'file:./db/custom.db'
const dbPath = dbUrl.replace('file:', '')
try {
  mkdirSync(dirname(dbPath), { recursive: true })
} catch {
  // Directory already exists or cannot be created — Prisma will report the real error
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const prisma = globalForPrisma.prisma ?? new PrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma

export default prisma
