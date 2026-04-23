import sgMail from '@sendgrid/mail';
import { env } from '@/lib/env';

// @sendgrid/mail re-exports the helper types off its own module; we pull
// the single one we need without importing the unpublished submodule path.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MailDataRequired = Parameters<(typeof sgMail)['send']>[0] extends infer T
  ? T extends Array<infer U>
    ? U
    : T
  : never;

/**
 * SendGrid wrapper.
 *
 * Non-negotiable: sandbox mode is ALWAYS on unless SENDGRID_SANDBOX_MODE
 * is EXACTLY the string `'false'`. Any other value — unset, `'0'`, `'FALSE'`,
 * a typo — keeps sandbox on. This app is a public demo and we cannot ship
 * real email to pet owners by accident.
 *
 * The sandbox flag tells SendGrid to accept the request, run validation,
 * and return 200/202 WITHOUT delivering the message. No quota is consumed.
 *
 * The wrapper also short-circuits when SENDGRID_API_KEY is missing (local
 * dev without the secret) — it returns a shape-compatible result with
 * delivered=false instead of throwing, so tests and partial installs don't
 * break other code paths. The job handlers still treat that as success
 * for idempotency (nothing to retry when there's no key to try with).
 */

let apiKeySet = false;
function ensureApiKey(): boolean {
  if (apiKeySet) return true;
  const key = env.SENDGRID_API_KEY;
  if (!key) return false;
  sgMail.setApiKey(key);
  apiKeySet = true;
  return true;
}

export function isSandboxMode(): boolean {
  return env.SENDGRID_SANDBOX_MODE !== 'false';
}

export interface EmailAttachment {
  filename: string;
  /** Base64-encoded content (Buffer.toString('base64')). */
  content: string;
  /** MIME type, e.g. 'application/pdf'. */
  type: string;
  /** 'attachment' | 'inline' — we always use 'attachment' for PDFs. */
  disposition?: 'attachment' | 'inline';
}

export interface SendEmailInput {
  to: string;
  subject: string;
  /** HTML body. For plain-text-only emails, pass a minimal <pre> wrapper or use `text`. */
  html?: string;
  /** Plain-text body (alternative part). SendGrid recommends sending both. */
  text?: string;
  attachments?: EmailAttachment[];
  /** Optional override; defaults to env SENDGRID_FROM_EMAIL / SENDGRID_FROM_NAME. */
  from?: { email: string; name?: string };
  /** Optional reply-to (e.g. clinic email for owner replies). */
  replyTo?: string;
}

export interface SendEmailResult {
  delivered: boolean;
  sandbox: boolean;
  messageId: string | null;
  skippedReason?: string;
}

/**
 * Send a transactional email. Sandbox is forced on by default.
 *
 * Throws only on 4xx/5xx from SendGrid that are NOT the sandbox path — the
 * caller (pg-boss worker) will retry. Missing API key returns a skipped
 * result; that is treated as success by the idempotent handlers.
 */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const sandbox = isSandboxMode();
  if (!ensureApiKey()) {
    return {
      delivered: false,
      sandbox,
      messageId: null,
      skippedReason: 'SENDGRID_API_KEY not configured',
    };
  }

  const fromEmail = input.from?.email ?? env.SENDGRID_FROM_EMAIL;
  if (!fromEmail) {
    return {
      delivered: false,
      sandbox,
      messageId: null,
      skippedReason: 'SENDGRID_FROM_EMAIL not configured',
    };
  }
  const fromName = input.from?.name ?? env.SENDGRID_FROM_NAME ?? 'PawPlan';

  if (!input.html && !input.text) {
    return {
      delivered: false,
      sandbox,
      messageId: null,
      skippedReason: 'neither html nor text body provided',
    };
  }

  // Build the message. TS's MailDataRequired union can't see through the
  // conditional spreads, so we assemble then narrow-assert. The runtime
  // guard above guarantees html OR text is present.
  const msg: MailDataRequired = {
    to: input.to,
    from: { email: fromEmail, name: fromName },
    subject: input.subject,
    ...(input.html ? { html: input.html } : {}),
    ...(input.text ? { text: input.text } : {}),
    ...(input.attachments && input.attachments.length > 0
      ? {
          attachments: input.attachments.map((a) => ({
            filename: a.filename,
            content: a.content,
            type: a.type,
            disposition: a.disposition ?? 'attachment',
          })),
        }
      : {}),
    ...(input.replyTo ? { replyTo: input.replyTo } : {}),
    mailSettings: {
      // THIS IS THE LINE THAT KEEPS THE DEMO SAFE. Do not remove.
      sandboxMode: { enable: sandbox },
    },
  } as MailDataRequired;

  const [response] = await sgMail.send(msg);
  const messageId = response.headers['x-message-id'];
  return {
    delivered: response.statusCode >= 200 && response.statusCode < 300,
    sandbox,
    messageId: typeof messageId === 'string' ? messageId : null,
  };
}
