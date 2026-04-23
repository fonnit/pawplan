// PawPlan PUB-06 load test — public enrollment page under newsletter-blast traffic.
//
// Purpose: Validate PITFALLS #8 mitigation (ISR + CDN cache) absorbs 500 req/s
// against a published clinic page, with p95 < 500ms.
//
// Runbook (operator-run before demo, NOT in CI):
//   1. Seed a test clinic and publish a plan locally:
//        pnpm db:push
//        psql "$DATABASE_URL_UNPOOLED" -f prisma/sql/003-plan-publish-rls.sql
//        psql "$DATABASE_URL_UNPOOLED" -f prisma/sql/004-public-clinic-view.sql
//        # then via the dashboard (or a seed script): create Clinic + Plan + tiers,
//        # flip Plan.status = 'published', set tier.stripePriceId.
//   2. Build & start the production server:
//        pnpm build && pnpm start
//   3. Run the load test:
//        k6 run -e SLUG=<published-clinic-slug> -e BASE_URL=http://localhost:3000 tests/load/enroll-page.k6.js
//   4. Thresholds that must hold:
//        - http_req_duration p95 < 500ms
//        - http_req_failed rate < 1%
//        - status = 200 on every request
//
// Smoke run (no seed, just check the script parses):
//   k6 run --duration 5s --vus 10 tests/load/enroll-page.k6.js
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  scenarios: {
    newsletter_blast: {
      executor: 'constant-arrival-rate',
      rate: 500, // 500 requests/sec
      timeUnit: '1s',
      duration: '60s',
      preAllocatedVUs: 100,
      maxVUs: 500,
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<500'],
    http_req_failed: ['rate<0.01'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const SLUG = __ENV.SLUG || 'load-test-clinic';

export default function () {
  const res = http.get(`${BASE_URL}/${SLUG}/enroll`);
  check(res, {
    'status is 200': (r) => r.status === 200,
    'body is non-trivial (>1KB)': (r) => r.body && r.body.length > 1000,
  });
  // Small think time so we don't synthetic-stampede — constant-arrival-rate
  // controls the actual pacing. A tiny sleep helps the VU pool breathe.
  sleep(0.01);
}
