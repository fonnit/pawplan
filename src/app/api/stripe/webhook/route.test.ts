/**
 * Webhook route handler — retry semantics test (HI-01 regression).
 *
 * Focus: verify that when the dispatch handler throws, the route
 *   1. returns HTTP 500 (so Stripe's exponential-backoff retry engages), and
 *   2. on the next delivery of the SAME event.id, re-enters the dispatch
 *      path rather than short-circuiting with 200.
 *
 * We mock the four module seams the route depends on — webhook helpers,
 * connect helpers, and the Prisma client — so the test is deterministic
 * and does not touch Postgres. The in-memory store simulates the row
 * lifecycle (create → findUnique → update) with just enough fidelity to
 * drive the duplicate/alreadyProcessed branches in recordEvent.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type Stripe from 'stripe';

// ---- In-memory StripeEvent store --------------------------------------
// Keyed by event.id. Each row captures only what the route + recordEvent
// read back: processedAt (null = "prior attempt failed, retry me").
type Row = { id: string; processedAt: Date | null };
const rows = new Map<string, Row>();

// The P2002 shape Prisma emits for unique-constraint violations. We throw
// a plain object (not a PrismaClientKnownRequestError instance) because
// recordEvent detects by `err.code === 'P2002'` via a `code in err` check,
// not by instanceof — matches the real runtime behavior.
function p2002(): unknown {
  const err = new Error('Unique constraint failed on the primary key');
  (err as unknown as { code: string }).code = 'P2002';
  return err;
}

// ---- Mocks -----------------------------------------------------------
// Prisma: only the stripeEvent delegate is exercised in this suite. We
// mock at the module boundary (@/lib/db) so the webhook helpers pick up
// the same fake without any real network calls.
vi.mock('@/lib/db', () => ({
  prisma: {
    stripeEvent: {
      create: vi.fn(async ({ data }: { data: { id: string } }) => {
        if (rows.has(data.id)) throw p2002();
        rows.set(data.id, { id: data.id, processedAt: null });
        return rows.get(data.id);
      }),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        return rows.get(where.id) ?? null;
      }),
      update: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string };
          data: { processedAt?: Date | null };
        }) => {
          const row = rows.get(where.id);
          if (!row) throw new Error('row not found');
          if ('processedAt' in data) row.processedAt = data.processedAt ?? null;
          return row;
        },
      ),
    },
  },
}));

// Signature verification is not under test here — stub it to just parse
// the body as JSON. The real algorithm is covered in webhook.test.ts.
vi.mock('@/lib/stripe/webhook', async () => {
  const actual = await vi.importActual<typeof import('@/lib/stripe/webhook')>(
    '@/lib/stripe/webhook',
  );
  return {
    ...actual,
    verifyWebhookSignature: (rawBody: string) => JSON.parse(rawBody) as Stripe.Event,
  };
});

// Spy on persistAccountSnapshot so we can make attempt 1 throw and
// attempt 2 succeed — the canonical transient-failure-then-recover shape.
const persistMock = vi.fn();
vi.mock('@/lib/stripe/connect', () => ({
  persistAccountSnapshot: (...args: unknown[]) => persistMock(...args),
  // accountToSnapshot is pure; keep a trivial passthrough so dispatch
  // doesn't blow up destructuring the event.
  accountToSnapshot: (acct: Stripe.Account) => ({
    stripeAccountId: acct.id,
    chargesEnabled: acct.charges_enabled ?? false,
    payoutsEnabled: acct.payouts_enabled ?? false,
    detailsSubmitted: acct.details_submitted ?? false,
    disabledReason: null,
    requirements: {
      currently_due: [],
      eventually_due: [],
      past_due: [],
      pending_verification: [],
      disabled_reason: null,
    },
  }),
}));

// ---- Test fixtures ---------------------------------------------------
function buildEvent(id: string): Stripe.Event {
  return {
    id,
    object: 'event',
    type: 'account.updated',
    api_version: '2024-06-20',
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    pending_webhooks: 1,
    request: { id: null, idempotency_key: null },
    account: 'acct_test_retry',
    data: {
      object: {
        id: 'acct_test_retry',
        object: 'account',
        charges_enabled: true,
        payouts_enabled: true,
        details_submitted: true,
      },
    },
  } as unknown as Stripe.Event;
}

function buildRequest(event: Stripe.Event): Request {
  return new Request('https://pawplan.test/api/stripe/webhook', {
    method: 'POST',
    headers: { 'stripe-signature': 't=1,v1=stubbed' },
    body: JSON.stringify(event),
  });
}

describe('webhook route — retry semantics (HI-01)', () => {
  beforeEach(() => {
    rows.clear();
    persistMock.mockReset();
    vi.resetModules();
  });

  it('returns 500 when dispatch throws so Stripe retries', async () => {
    persistMock.mockRejectedValueOnce(new Error('Neon cold-start spike'));
    const { POST } = await import('./route');

    const res = await POST(buildRequest(buildEvent('evt_retry_1')));

    expect(res.status).toBe(500);
    // Row exists (created by recordEvent on first attempt) but is NOT
    // marked processed — this is what lets the next retry re-enter dispatch.
    expect(rows.get('evt_retry_1')?.processedAt).toBeNull();
  });

  it('re-dispatches on replay when prior attempt left processedAt=null', async () => {
    persistMock.mockRejectedValueOnce(new Error('transient DB error'));
    persistMock.mockResolvedValueOnce({ updated: true, clinicId: 'clinic_1' });

    const { POST } = await import('./route');
    const event = buildEvent('evt_retry_2');

    // Attempt 1 — dispatch fails, route returns 500, row stays unprocessed.
    const first = await POST(buildRequest(event));
    expect(first.status).toBe(500);
    expect(persistMock).toHaveBeenCalledTimes(1);

    // Attempt 2 — Stripe retries with the SAME event.id. recordEvent hits
    // P2002, sees processedAt=null, returns alreadyProcessed=false, and
    // the route must run dispatch AGAIN rather than ACK'ing the noop path.
    const second = await POST(buildRequest(event));
    expect(second.status).toBe(200);
    expect(persistMock).toHaveBeenCalledTimes(2);
    expect(rows.get('evt_retry_2')?.processedAt).toBeInstanceOf(Date);
  });

  it('short-circuits with 200 when a processed event is re-delivered', async () => {
    persistMock.mockResolvedValueOnce({ updated: true, clinicId: 'clinic_1' });
    const { POST } = await import('./route');
    const event = buildEvent('evt_retry_3');

    const first = await POST(buildRequest(event));
    expect(first.status).toBe(200);
    expect(rows.get('evt_retry_3')?.processedAt).toBeInstanceOf(Date);

    // Replay of an already-processed event must NOT re-run dispatch —
    // otherwise a handler with external side-effects (Phase 3: send email
    // on invoice.paid) would double-fire on every Stripe retry sweep.
    const second = await POST(buildRequest(event));
    expect(second.status).toBe(200);
    expect(persistMock).toHaveBeenCalledTimes(1);
  });
});
