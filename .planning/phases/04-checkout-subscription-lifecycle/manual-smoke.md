# Phase 4 Manual Smoke — Stripe CLI walkthrough

Operator-run procedure. Not automated because it drives a real Stripe test-mode
account end-to-end. Run ONCE after the full Phase 4 branch merges; then after
any future dispatch-layer change.

## Prerequisites

- `stripe` CLI logged in to the PawPlan test-mode account (`stripe login`).
- Local Postgres on `localhost:5433` with migrations applied.
- `pnpm dev` running on `localhost:3000`.
- A published test clinic. Sign up → connect Stripe (`4000...` test card or
  OAuth a test-mode account) → build + publish a 2- or 3-tier plan. Note the
  clinic slug (e.g. `hillside`).

## Walkthrough

1. **Forward webhooks locally.** In a dedicated terminal:
   ```bash
   stripe listen --forward-to localhost:3000/api/stripe/webhook
   ```
   Keep this tab open for the full walkthrough — it prints every inbound
   event and PawPlan's response status.

2. **Complete a Checkout as a pet owner.** In another tab visit
   `http://localhost:3000/<slug>/enroll`. Click "Start {tier} membership",
   land on Stripe Checkout, fill:
   - Email: anything (e.g. `owner@example.test`)
   - Card: `4242 4242 4242 4242`, any future date, any CVC, any ZIP
   - Pet's name: `Rex`
   - Species: `Dog`
   Submit. You should land on `/{slug}/enroll/success` with the clinic header
   and a confirmation message.

3. **Verify the Member row exists** (one row, status=active):
   ```bash
   psql "$DATABASE_URL_UNPOOLED" -c 'SELECT "petName", species, "ownerEmail", status, "currentPeriodEnd" FROM "Member";'
   ```

4. **Replay the event 5× and confirm idempotency.** Find the event id in the
   `stripe listen` tab (e.g. `evt_1Ab...`), then:
   ```bash
   for i in 1 2 3 4 5; do stripe events resend evt_1Ab...; done
   psql "$DATABASE_URL_UNPOOLED" -c 'SELECT COUNT(*) FROM "Member";'
   # expect: 1
   psql "$DATABASE_URL_UNPOOLED" -c 'SELECT id, "processedAt" IS NOT NULL AS done FROM "StripeEvent" WHERE id = '"'evt_1Ab...'"';'
   # expect: done=t, exactly one row
   ```

5. **Simulate a failed renewal.** With Stripe CLI:
   ```bash
   stripe trigger invoice.payment_failed \
     --override invoice:parent[subscription_details][subscription]=<sub_id>
   psql "$DATABASE_URL_UNPOOLED" -c 'SELECT status, "paymentFailedAt" FROM "Member" WHERE "stripeSubscriptionId" = '"'<sub_id>'"';'
   # expect: status=past_due, paymentFailedAt set
   ```

6. **Simulate recovery.** Trigger `invoice.paid`:
   ```bash
   stripe trigger invoice.paid \
     --override invoice:parent[subscription_details][subscription]=<sub_id>
   psql "$DATABASE_URL_UNPOOLED" -c 'SELECT status, "paymentFailedAt", "currentPeriodEnd" FROM "Member" WHERE "stripeSubscriptionId" = '"'<sub_id>'"';'
   # expect: status=active, paymentFailedAt=NULL, currentPeriodEnd refreshed
   ```

7. **Simulate owner cancellation.** From `/dashboard/members`, click Cancel +
   Confirm on the enrolled row. Verify in the `stripe listen` tab a
   `customer.subscription.updated` event arrives with `cancel_at_period_end: true`.
   Then simulate period end:
   ```bash
   stripe trigger customer.subscription.deleted \
     --override subscription:id=<sub_id>
   psql "$DATABASE_URL_UNPOOLED" -c 'SELECT status, "canceledAt" FROM "Member" WHERE "stripeSubscriptionId" = '"'<sub_id>'"';'
   # expect: status=canceled, canceledAt=(optimistic click timestamp or webhook time,
   #          whichever is earlier)
   ```

8. **Cross-tenant smoke.** Sign in as a second test clinic. Manually call
   the cancelMember server action with the memberId from the first clinic
   (devtools network tab → edit the payload). The action must return
   `{ ok: false, code: 'not_found' }` and no Stripe call should appear in
   the `stripe listen` tab.

## What failure looks like

- Step 3 returns zero Member rows → webhook dispatch is not reaching the
  handler. Check `stripe listen` for 500s and the StripeEvent table for
  `processingError` content.
- Step 4 returns `COUNT > 1` → the composite unique index failed. Rerun the
  RLS + index migration.
- Step 5 shows `status=active` after failure → check
  `src/lib/stripe/webhook-handlers/invoice-payment-failed.ts` is actually
  wired into `WEBHOOK_HANDLERS`.
- Step 7 writes a `canceledAt` LATER than the owner click → the canceled_at
  merge logic regressed; inspect `customer-subscription-deleted.ts`.
