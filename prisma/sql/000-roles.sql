-- Provision the restricted app role (T-01-03-03).
--
-- The app connects as `pawplan_app` — a non-superuser role that:
--   - Cannot bypass RLS (NOBYPASSRLS — the complement to FORCE RLS; a single
--     policy drop would otherwise silently unlock cross-tenant reads).
--   - Can CONNECT to the database and USE the public schema.
--   - Has table-level SELECT/INSERT/UPDATE/DELETE on every current table, and
--     the same defaults for tables created later (so future migrations do not
--     silently lock the app out).
--   - Has USAGE + SELECT on sequences so Prisma-generated `serial`/identity
--     columns keep working.
--
-- Run this as a superuser (`pawplan` locally, the Neon project owner in
-- production) AFTER `prisma db push` has created the tables. The LOGIN
-- password is `dev` locally; in production, rotate it and store in
-- `DATABASE_URL`.
--
-- Verification:
--   SELECT rolname, rolbypassrls FROM pg_roles WHERE rolname = 'pawplan_app';
--   -- expect: pawplan_app | f
--
-- This file is tracked alongside `001-rls-policies.sql` and applied the same
-- way: `pnpm prisma db execute --file prisma/sql/000-roles.sql`.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pawplan_app') THEN
    CREATE ROLE pawplan_app LOGIN PASSWORD 'dev';
  END IF;
END $$;

-- Harden the role: explicitly strip BYPASSRLS and SUPERUSER. Idempotent.
ALTER ROLE pawplan_app NOBYPASSRLS NOSUPERUSER;

-- CONNECT to the database. `current_database()` keeps the script portable
-- between local Docker (`pawplan`) and Neon (per-branch DB names).
DO $$
BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO pawplan_app', current_database());
END $$;

-- Schema + table privileges.
GRANT USAGE ON SCHEMA public TO pawplan_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO pawplan_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO pawplan_app;

-- Future tables/sequences created by `prisma db push` inherit the same grants.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO pawplan_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO pawplan_app;
