import { describe, it, expect } from 'vitest';
import { safeNext } from './safe-next';

describe('safeNext', () => {
  it('falls back to /dashboard for null or empty', () => {
    expect(safeNext(null)).toBe('/dashboard');
    expect(safeNext(undefined)).toBe('/dashboard');
    expect(safeNext('')).toBe('/dashboard');
  });

  it('rejects protocol-relative URLs', () => {
    expect(safeNext('//evil.com')).toBe('/dashboard');
    expect(safeNext('//evil.com/path')).toBe('/dashboard');
  });

  it('rejects absolute URLs with a scheme', () => {
    expect(safeNext('https://evil.com')).toBe('/dashboard');
    expect(safeNext('http://evil.com/phish')).toBe('/dashboard');
  });

  it('rejects backslash tricks', () => {
    expect(safeNext('/\\evil.com')).toBe('/dashboard');
  });

  it('rejects relative paths without leading slash', () => {
    expect(safeNext('dashboard/plans')).toBe('/dashboard');
    expect(safeNext('evil.com')).toBe('/dashboard');
  });

  it('passes through well-formed same-origin paths', () => {
    expect(safeNext('/dashboard')).toBe('/dashboard');
    expect(safeNext('/dashboard/plans/new')).toBe('/dashboard/plans/new');
    expect(safeNext('/enroll/clinic-slug')).toBe('/enroll/clinic-slug');
  });

  it('honors the custom fallback', () => {
    expect(safeNext(null, '/login')).toBe('/login');
    expect(safeNext('//evil.com', '/login')).toBe('/login');
  });
});
