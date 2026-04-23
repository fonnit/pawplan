import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * NOTIF-04 defense — the webhook hot path must NEVER pull in SendGrid,
 * React-PDF, or any other heavy notification module. Those belong in
 * `src/lib/jobs/*`, which is only imported by the worker route.
 *
 * This suite grep-asserts the source files themselves. If a future change
 * adds `import '@sendgrid/mail'` to the webhook route, this test fires
 * before the bundle bloats or the webhook latency regresses.
 */

const HOT_PATH_FILES = [
  'src/app/api/stripe/webhook/route.ts',
  'src/lib/stripe/webhook.ts',
  'src/lib/stripe/webhook-handlers/index.ts',
  'src/lib/stripe/webhook-handlers/checkout-completed.ts',
  'src/lib/stripe/webhook-handlers/invoice-paid.ts',
  'src/lib/stripe/webhook-handlers/invoice-payment-failed.ts',
  'src/lib/stripe/webhook-handlers/customer-subscription-deleted.ts',
];

// Match only actual `import` / `require` / dynamic-import statements — the
// regex passes over code comments and string literals that happen to quote
// the module name (e.g. a docstring that explains what MUST NOT be imported).
const FORBIDDEN = [
  /(?:^|\n)\s*import\s[^;]*['"]@sendgrid\/mail['"]/,
  /(?:^|\n)\s*import\s[^;]*['"]@react-pdf\/renderer['"]/,
  /(?:^|\n)\s*import\s[^;]*['"]@react-email\//,
  /(?:^|\n)\s*import\s[^;]*['"]resend['"]/,
  /require\(\s*['"]@sendgrid\/mail['"]\s*\)/,
  /require\(\s*['"]@react-pdf\/renderer['"]\s*\)/,
  /require\(\s*['"]resend['"]\s*\)/,
];

// src/lib/queue is the approved enqueue surface; it must NOT transitively
// pull in sendgrid or react-pdf either. We verify the queue barrel directly
// here and rely on the forbidden-import grep on jobs/* not being imported
// by queue/* (enforced by queue/* files living in a different folder).
const QUEUE_SURFACE_FILES = [
  'src/lib/queue/index.ts',
  'src/lib/queue/boss.ts',
  'src/lib/queue/enqueue.ts',
];

describe('webhook hot path — NOTIF-04 bundle discipline', () => {
  for (const rel of HOT_PATH_FILES) {
    it(`${rel} contains no email or PDF imports`, () => {
      const src = readFileSync(resolve(process.cwd(), rel), 'utf8');
      for (const forbidden of FORBIDDEN) {
        expect(src, `found ${forbidden} in ${rel}`).not.toMatch(forbidden);
      }
    });
  }

  for (const rel of QUEUE_SURFACE_FILES) {
    it(`${rel} contains no email or PDF imports (queue surface)`, () => {
      const src = readFileSync(resolve(process.cwd(), rel), 'utf8');
      for (const forbidden of FORBIDDEN) {
        expect(src, `found ${forbidden} in ${rel}`).not.toMatch(forbidden);
      }
      // Nor should the queue barrel import anything under @/lib/jobs —
      // that would flatten the worker-only module into the webhook bundle.
      // Match only import/require statements, not comment references.
      expect(src, `queue surface must not import @/lib/jobs`).not.toMatch(
        /(?:^|\n)\s*import\s[^;]*['"]@\/lib\/jobs/,
      );
      expect(src, `queue surface must not import @/lib/jobs`).not.toMatch(
        /require\(\s*['"]@\/lib\/jobs/,
      );
    });
  }

  it('checkout-completed.ts imports from @/lib/queue (approved surface)', () => {
    const src = readFileSync(
      resolve(process.cwd(), 'src/lib/stripe/webhook-handlers/checkout-completed.ts'),
      'utf8',
    );
    expect(src).toMatch(/from ['"]@\/lib\/queue['"]/);
  });
});
