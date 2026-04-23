import { config as loadEnv } from 'dotenv';
import { defineConfig } from 'prisma/config';

// Load .env.local first (developer overrides), then .env as fallback.
loadEnv({ path: '.env.local' });
loadEnv({ path: '.env' });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    // Prefer the unpooled URL for migrate/db-push (direct connection);
    // fall back to the pooled URL if unpooled isn't provided.
    url: process.env['DATABASE_URL_UNPOOLED'] ?? process.env['DATABASE_URL'],
  },
});
