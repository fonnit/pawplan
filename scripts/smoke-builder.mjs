// Playwright smoke for Plan 05 — builder + live break-even + draft persistence.
// Run against `pnpm dev`.
import { chromium } from '@playwright/test';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const EMAIL = `builder+${Date.now()}@acme.vet`;
const PASSWORD = 'testpass1234';
const SLUG = `builder-${Date.now().toString(36).slice(-6)}`;

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext();
const page = await ctx.newPage();

function assert(label, v) {
  if (!v) throw new Error(`[ASSERT FAILED] ${label}`);
  console.log(`[OK] ${label}`);
}

try {
  // 1) Signup
  await page.goto(`${BASE}/signup`);
  await page.getByLabel('Email').fill(EMAIL);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByLabel('Clinic name').fill('Builder Test Vet');
  await page.getByLabel('Enrollment URL').fill(SLUG);
  await Promise.all([
    page.waitForURL('**/dashboard'),
    page.getByRole('button', { name: /create clinic account/i }).click(),
  ]);
  assert('signed up → dashboard', page.url().endsWith('/dashboard'));

  // 2) Empty state visible
  await page.waitForSelector('text=Build your first wellness plan');
  assert('empty-state hero visible', true);

  // 3) Navigate to builder
  await Promise.all([
    page.waitForURL('**/dashboard/plans/new'),
    page.getByRole('link', { name: /start plan builder/i }).click(),
  ]);
  assert('reached builder', page.url().includes('/dashboard/plans/new'));

  // 4) Break-even panel renders with default numbers
  await page.waitForSelector('text=Break-even math');
  const panel = page.locator('aside', { hasText: 'Break-even math' }).first();
  const defaultFee = await panel.locator('text=/\\$\\d+\\.\\d{2}\\/mo/').first().textContent();
  assert(`default preventive monthly fee rendered: ${defaultFee}`, Boolean(defaultFee));

  // 5) Change an input → break-even updates live (BLDR-03).
  const beforeText = await panel.textContent();
  const examPriceInput = page.locator('input[type="number"]').first();
  await examPriceInput.fill('150');
  await page.waitForTimeout(200);
  const afterText = await panel.textContent();
  assert(
    `panel re-renders after exam price change`,
    beforeText !== afterText,
  );

  // 6) Save draft
  await page.getByRole('button', { name: /save draft/i }).click();
  await page.waitForSelector('text=/Last saved/i', { timeout: 5000 });
  assert('Save draft confirmed ("Last saved …")', true);

  // 7) Logout
  await Promise.all([
    page.waitForURL('**/login'),
    page.getByRole('button', { name: /log out/i }).click(),
  ]);

  // 8) Login again → dashboard should show draft card (BLDR-04 + BLDR-05)
  await page.getByLabel('Email').fill(EMAIL);
  await page.getByLabel('Password').fill(PASSWORD);
  await Promise.all([
    page.waitForURL('**/dashboard'),
    page.getByRole('button', { name: /^log in$/i }).click(),
  ]);
  await page.waitForSelector('text=Plan draft — last edited', { timeout: 5000 });
  assert('draft card visible after logout/login', true);

  // 9) Resume builder → inputs restored
  await Promise.all([
    page.waitForURL('**/dashboard/plans/new'),
    page.getByRole('link', { name: /resume builder/i }).click(),
  ]);
  await page.waitForSelector('text=Edit plan draft');
  assert('resumed draft — heading reads "Edit plan draft"', true);

  // 10) Delete draft → dashboard returns to empty state
  await page.goto(`${BASE}/dashboard`);
  await page.getByRole('button', { name: /^delete draft$/i }).first().click();
  await page.getByRole('button', { name: /^delete draft$/i }).last().click();
  await page.waitForSelector('text=Build your first wellness plan', { timeout: 5000 });
  assert('empty state returned after delete', true);

  console.log('\nBUILDER SMOKE PASSED');
} catch (err) {
  console.error('BUILDER SMOKE FAILED:', err.message);
  process.exit(1);
} finally {
  await browser.close();
}
