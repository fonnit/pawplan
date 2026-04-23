# Pending database operations

Populated by `/gsd-execute-phase` Phase 1 execution. Each command must be run by the orchestrator (or Daniel) after a live Neon `DATABASE_URL` is provisioned and written to `.env.local`.

Run commands from `/Users/dfonnegrag/Projects/pawplan/` in sequence.

## 1. Push Prisma schema to Neon (Plan 01-03, Task 1)

```bash
pnpm prisma generate
pnpm prisma db push --skip-generate
```

Verifies tables exist:

```bash
pnpm prisma db execute --stdin <<'EOF'
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;
EOF
```

Expect: `Account`, `Clinic`, `Plan`, `PlanTier`, `Session`, `User`, `Verification`.

## 2a. Provision the restricted app role (Plan 01-03, T-01-03-03)

```bash
pnpm prisma db execute --file prisma/sql/000-roles.sql
```

Creates `pawplan_app` as `NOBYPASSRLS` + grants CRUD on public schema. Run
after `db push` so the `ALL TABLES IN SCHEMA public` GRANT picks up every
created table. Idempotent — safe to re-run.

Verifies the role cannot bypass RLS:

```bash
pnpm prisma db execute --stdin <<'EOF'
SELECT rolname, rolbypassrls FROM pg_roles WHERE rolname = 'pawplan_app';
EOF
# Expect: pawplan_app | f
```

## 2b. Apply RLS policies (Plan 01-03, Task 2)

```bash
pnpm prisma db execute --file prisma/sql/001-rls-policies.sql
```

Verifies RLS active on Clinic / Plan / PlanTier:

```bash
pnpm prisma db execute --stdin <<'EOF'
SELECT tablename, rowsecurity FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('Clinic', 'Plan', 'PlanTier');
EOF
```

Expect every row with `rowsecurity = true`.

## 3. Run the cross-tenant isolation test (Plan 01-03, Task 2)

```bash
pnpm test src/lib/tenant.test.ts
```

Expect 4 passing cases.

## 4. Record role / BYPASSRLS status in 01-03-SUMMARY.md

After the above runs, append to `.planning/phases/01-foundation/01-03-SUMMARY.md`:

```bash
pnpm prisma db execute --stdin <<'EOF'
SELECT rolname, rolbypassrls FROM pg_roles WHERE rolname = current_user;
EOF
```

If `rolbypassrls = true`, `FORCE ROW LEVEL SECURITY` in `001-rls-policies.sql` is
the thing keeping cross-tenant isolation working for the app-role — document
that and open a Phase 2 follow-up for a separate restricted app role.
