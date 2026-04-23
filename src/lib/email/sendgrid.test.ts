import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Sandbox-mode enforcement — the single most important test in Phase 5.
 *
 * If `SENDGRID_SANDBOX_MODE` is anything other than the literal string
 * `'false'`, every `sendEmail()` call MUST ride with
 * `mailSettings.sandboxMode.enable = true`. The pet-owner demo cannot
 * deliver real email.
 */

const { mockSend, mockSetApiKey } = vi.hoisted(() => ({
  mockSend: vi.fn(),
  mockSetApiKey: vi.fn(),
}));

vi.mock('@sendgrid/mail', () => ({
  default: {
    setApiKey: mockSetApiKey,
    send: mockSend,
  },
}));

// env.ts reads from process.env at import time, so we have to mutate the
// env BEFORE importing the module and reset modules between cases.
const ORIGINAL_ENV = { ...process.env };

async function importFresh(overrides: Record<string, string | undefined>) {
  vi.resetModules();
  for (const [k, v] of Object.entries(overrides)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  return await import('./sendgrid');
}

beforeEach(() => {
  mockSend.mockReset();
  mockSetApiKey.mockReset();
  mockSend.mockResolvedValue([
    { statusCode: 202, headers: { 'x-message-id': 'msg_1' } },
    {},
  ]);
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('sendEmail — sandbox mode is ALWAYS on by default', () => {
  it('sandbox ON when SENDGRID_SANDBOX_MODE=true (explicit)', async () => {
    const { sendEmail } = await importFresh({
      SENDGRID_SANDBOX_MODE: 'true',
      SENDGRID_API_KEY: 'SG.test',
      SENDGRID_FROM_EMAIL: 'noreply@demos.fonnit.com',
    });
    await sendEmail({ to: 'x@y.test', subject: 's', text: 'body' });
    const msg = mockSend.mock.calls[0]![0];
    expect(msg.mailSettings.sandboxMode.enable).toBe(true);
  });

  it('sandbox ON when SENDGRID_SANDBOX_MODE is unset (default fail-closed)', async () => {
    const { sendEmail } = await importFresh({
      SENDGRID_SANDBOX_MODE: undefined,
      SENDGRID_API_KEY: 'SG.test',
      SENDGRID_FROM_EMAIL: 'noreply@demos.fonnit.com',
    });
    await sendEmail({ to: 'x@y.test', subject: 's', text: 'body' });
    const msg = mockSend.mock.calls[0]![0];
    expect(msg.mailSettings.sandboxMode.enable).toBe(true);
  });

  it('sandbox ON when SENDGRID_SANDBOX_MODE is the string "FALSE" (case-sensitive guard)', async () => {
    const { sendEmail } = await importFresh({
      SENDGRID_SANDBOX_MODE: 'FALSE',
      SENDGRID_API_KEY: 'SG.test',
      SENDGRID_FROM_EMAIL: 'noreply@demos.fonnit.com',
    });
    await sendEmail({ to: 'x@y.test', subject: 's', text: 'body' });
    expect(mockSend.mock.calls[0]![0].mailSettings.sandboxMode.enable).toBe(true);
  });

  it('sandbox ON when SENDGRID_SANDBOX_MODE is "0" (the only accepted OFF value is "false")', async () => {
    const { sendEmail } = await importFresh({
      SENDGRID_SANDBOX_MODE: '0',
      SENDGRID_API_KEY: 'SG.test',
      SENDGRID_FROM_EMAIL: 'noreply@demos.fonnit.com',
    });
    await sendEmail({ to: 'x@y.test', subject: 's', text: 'body' });
    expect(mockSend.mock.calls[0]![0].mailSettings.sandboxMode.enable).toBe(true);
  });

  it('sandbox OFF only when SENDGRID_SANDBOX_MODE is exactly "false"', async () => {
    const { sendEmail } = await importFresh({
      SENDGRID_SANDBOX_MODE: 'false',
      SENDGRID_API_KEY: 'SG.test',
      SENDGRID_FROM_EMAIL: 'noreply@demos.fonnit.com',
    });
    await sendEmail({ to: 'x@y.test', subject: 's', text: 'body' });
    expect(mockSend.mock.calls[0]![0].mailSettings.sandboxMode.enable).toBe(false);
  });
});

describe('sendEmail — payload shape', () => {
  it('includes attachments when provided and sets from name/email', async () => {
    const { sendEmail } = await importFresh({
      SENDGRID_SANDBOX_MODE: 'true',
      SENDGRID_API_KEY: 'SG.test',
      SENDGRID_FROM_EMAIL: 'noreply@demos.fonnit.com',
      SENDGRID_FROM_NAME: 'PawPlan',
    });
    await sendEmail({
      to: 'owner@example.com',
      subject: 'Welcome',
      html: '<p>hi</p>',
      attachments: [
        {
          filename: 'welcome.pdf',
          content: Buffer.from('%PDF-1.4').toString('base64'),
          type: 'application/pdf',
        },
      ],
    });
    const msg = mockSend.mock.calls[0]![0];
    expect(msg.from).toEqual({ email: 'noreply@demos.fonnit.com', name: 'PawPlan' });
    expect(msg.attachments).toHaveLength(1);
    expect(msg.attachments[0]).toMatchObject({
      filename: 'welcome.pdf',
      type: 'application/pdf',
      disposition: 'attachment',
    });
  });

  it('returns skipped result when API key is missing (no throw)', async () => {
    const { sendEmail } = await importFresh({
      SENDGRID_SANDBOX_MODE: 'true',
      SENDGRID_API_KEY: undefined,
      SENDGRID_FROM_EMAIL: 'noreply@demos.fonnit.com',
    });
    const result = await sendEmail({ to: 'x@y.test', subject: 's', text: 'body' });
    expect(result.delivered).toBe(false);
    expect(result.skippedReason).toMatch(/SENDGRID_API_KEY/);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('returns skipped result when neither html nor text provided', async () => {
    const { sendEmail } = await importFresh({
      SENDGRID_SANDBOX_MODE: 'true',
      SENDGRID_API_KEY: 'SG.test',
      SENDGRID_FROM_EMAIL: 'noreply@demos.fonnit.com',
    });
    const result = await sendEmail({ to: 'x@y.test', subject: 's' });
    expect(result.delivered).toBe(false);
    expect(result.skippedReason).toMatch(/html.*text/);
    expect(mockSend).not.toHaveBeenCalled();
  });
});
