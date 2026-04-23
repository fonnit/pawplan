/**
 * safeNext — validate a post-auth redirect target is a same-origin relative path.
 *
 * Mitigation for CR-01 (open redirect via `?next=`). The login/signup forms
 * accept a `next` query parameter that the middleware fills in with
 * `req.nextUrl.pathname` (safe), but an attacker can craft a login link like
 * `/login?next=//evil.com/phish` and the form cannot distinguish the two. A
 * protocol-relative URL handed to `router.replace()` becomes a full off-site
 * navigation, so we lock the accepted shape to a strict same-origin path:
 *
 *   - MUST start with '/'
 *   - MUST NOT start with '//' (protocol-relative)
 *   - MUST NOT start with '/\' (backslash trick — some routers normalize it)
 *
 * Anything else — absolute URLs, empty strings, null — falls back to the
 * default landing page.
 */
export function safeNext(raw: string | null | undefined, fallback = '/dashboard'): string {
  if (!raw) return fallback;
  if (!raw.startsWith('/')) return fallback;
  if (raw.startsWith('//')) return fallback;
  if (raw.startsWith('/\\')) return fallback;
  return raw;
}
