import { PrismaClient } from '@prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';
import { PrismaPg } from '@prisma/adapter-pg';
import { env } from './env';

/**
 * Prisma client — picks the right driver adapter at startup.
 *
 * Production (Vercel Neon integration) → @prisma/adapter-neon, speaks
 * Neon's serverless HTTP/WebSocket protocol. Matches what `neon.tech`
 * expects and avoids the "TCP not supported in serverless functions"
 * footgun.
 *
 * Local dev + tests (Docker Postgres on localhost:5433) → @prisma/adapter-pg,
 * plain TCP via node-postgres. The Neon adapter cannot talk to a standard
 * Postgres, so we detect the host and switch.
 *
 * Detection is a regex on the URL host: Neon endpoints always include
 * "neon.tech" (or the internal "neon.build" CI domain). Everything else
 * uses node-postgres.
 */
function makeAdapter() {
  const url = env.DATABASE_URL;
  const isNeon = /neon\.(tech|build)/i.test(url);
  if (isNeon) {
    return new PrismaNeon({ connectionString: url });
  }
  return new PrismaPg({ connectionString: url });
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ?? new PrismaClient({ adapter: makeAdapter() });

if (process.env['NODE_ENV'] !== 'production') {
  globalForPrisma.prisma = prisma;
}
