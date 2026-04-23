/**
 * Slug safety — FOUND-05 + FOUND-06 (accent palette).
 * Consumed by: Plan 01-04 signup server action; server-side DB @unique is the final guard.
 */

export const ACCENT_COLORS = [
  'sage',
  'terracotta',
  'midnight',
  'wine',
  'forest',
  'clay',
] as const;

export type AccentColor = (typeof ACCENT_COLORS)[number];

export const RESERVED_SLUGS: ReadonlySet<string> = new Set([
  // App-route collision risks
  'admin',
  'api',
  'app',
  'auth',
  'dashboard',
  'enroll',
  'login',
  'signup',
  'logout',
  'settings',
  'profile',
  'plans',
  'builder',
  'members',
  'stripe',
  'webhook',
  'webhooks',
  'static',
  'public',
  '_next',
  // Marketing / brand / future routes
  'about',
  'pricing',
  'terms',
  'privacy',
  'support',
  'help',
  'docs',
  'blog',
  'contact',
  'home',
  'index',
  'root',
  'pawplan',
  'www',
  'mail',
  'email',
  'fonnit',
  'demo',
  'demos',
  'test',
]);

export function normalizeSlug(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export type SlugValidation =
  | { ok: true }
  | {
      ok: false;
      reason: 'too-short' | 'too-long' | 'invalid-chars' | 'reserved' | 'bad-hyphens';
    };

export function validateSlug(slug: string): SlugValidation {
  if (slug.length < 3) return { ok: false, reason: 'too-short' };
  if (slug.length > 40) return { ok: false, reason: 'too-long' };
  if (!/^[a-z0-9-]+$/.test(slug)) return { ok: false, reason: 'invalid-chars' };
  if (slug.startsWith('-') || slug.endsWith('-') || /--/.test(slug)) {
    return { ok: false, reason: 'bad-hyphens' };
  }
  if (RESERVED_SLUGS.has(slug)) return { ok: false, reason: 'reserved' };
  return { ok: true };
}
