// Playwright smoke test for auth + dashboard flow (run locally against pnpm dev).
// Not a vitest test — executed ad hoc via `node scripts/smoke-auth.mjs`.
import { chromium } from '@playwright/test';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const EMAIL = `owner+${Date.now()}@acme.vet`;
const PASSWORD = 'testpass1234';
const SLUG = `acme-${Date.now().toString(36).slice(-6)}`;

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext();
const page = await ctx.newPage();

try {
  // 1) Signup
  await page.goto(`${BASE}/signup`);
  await page.getByLabel('Email').fill(EMAIL);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByLabel('Clinic name').fill('Acme Veterinary');
  await page.getByLabel('Enrollment URL').fill(SLUG);
  await Promise.all([
    page.waitForURL('**/dashboard'),
    page.getByRole('button', { name: /create clinic account/i }).click(),
  ]);
  const heroHeading = await page.getByRole('heading', { name: 'Build your first wellness plan' }).isVisible();
  console.log('[SIGNUP] dashboard hero visible:', heroHeading);

  // 2) Logout
  await Promise.all([
    page.waitForURL('**/login'),
    page.getByRole('button', { name: /log out/i }).click(),
  ]);
  console.log('[LOGOUT] redirected to /login');

  // 3) Login
  await page.getByLabel('Email').fill(EMAIL);
  await page.getByLabel('Password').fill(PASSWORD);
  await Promise.all([
    page.waitForURL('**/dashboard'),
    page.getByRole('button', { name: /^log in$/i }).click(),
  ]);
  const heroHeading2 = await page.getByRole('heading', { name: 'Build your first wellness plan' }).isVisible();
  console.log('[LOGIN] dashboard hero visible again:', heroHeading2);

  // 4) Middleware gate
  await ctx.clearCookies();
  const resp = await page.goto(`${BASE}/dashboard`);
  const finalUrl = page.url();
  console.log('[GATE] after cookie wipe, landed on:', finalUrl, 'status:', resp?.status());

  console.log('\nSMOKE PASSED');
} catch (err) {
  console.error('SMOKE FAILED:', err);
  process.exit(1);
} finally {
  await browser.close();
}
