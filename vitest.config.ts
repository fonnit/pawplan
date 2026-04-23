import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { config as loadEnv } from 'dotenv';

// Load .env.local so tests can talk to the local Docker Postgres (port 5433)
// without requiring the developer to export DATABASE_URL manually. Prefer
// .env.local (developer overrides) then .env (fallback).
loadEnv({ path: path.resolve(__dirname, '.env.local') });
loadEnv({ path: path.resolve(__dirname, '.env') });

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
