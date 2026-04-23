import { NextResponse, type NextRequest } from 'next/server';

/**
 * Auth gate — T-01-04-01.
 *
 * Checks cookie presence only (cheap); the authoritative session check runs in
 * the dashboard layout's `auth.api.getSession()`. Better Auth 1.6.7 stores the
 * session cookie at `better-auth.session_token` (prefix "better-auth", default
 * separator "."). If that changes in a future release, update the lookup below.
 */
export function middleware(req: NextRequest) {
  // Better Auth prefixes the cookie with `__Secure-` on HTTPS (production).
  // Check both names so dev (HTTP) and prod (HTTPS) both work.
  const token =
    req.cookies.get('better-auth.session_token') ??
    req.cookies.get('__Secure-better-auth.session_token');
  if (!token) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', req.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ['/dashboard/:path*'] };
