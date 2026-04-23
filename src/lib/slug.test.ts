import { describe, it, expect } from 'vitest';
import { ACCENT_COLORS, normalizeSlug, validateSlug } from './slug';

describe('normalizeSlug', () => {
  it('lowercases', () => {
    expect(normalizeSlug('Hillside')).toBe('hillside');
  });

  it('strips non-ASCII (homoglyph defense)', () => {
    // Cyrillic small letter "i" (U+0456) replaces the Latin "i"
    const cyrillic = 'h' + String.fromCodePoint(0x0456) + 'llside';
    expect(normalizeSlug(cyrillic)).toBe('h-llside');
  });

  it('collapses multi-hyphens', () => {
    expect(normalizeSlug('foo--bar')).toBe('foo-bar');
  });

  it('trims leading and trailing hyphens', () => {
    expect(normalizeSlug('-foo-')).toBe('foo');
  });

  it('converts spaces to hyphens', () => {
    expect(normalizeSlug('Hillside Animal Hospital')).toBe('hillside-animal-hospital');
  });
});

describe('validateSlug', () => {
  it('accepts a valid slug', () => {
    expect(validateSlug('hillside-animal')).toEqual({ ok: true });
  });

  it('rejects too-short', () => {
    expect(validateSlug('ab')).toEqual({ ok: false, reason: 'too-short' });
  });

  it('rejects too-long', () => {
    expect(validateSlug('a'.repeat(41))).toEqual({ ok: false, reason: 'too-long' });
  });

  it('rejects reserved slug "admin"', () => {
    expect(validateSlug('admin')).toEqual({ ok: false, reason: 'reserved' });
  });

  it('rejects reserved slug "api"', () => {
    expect(validateSlug('api')).toEqual({ ok: false, reason: 'reserved' });
  });

  it('rejects reserved slug "enroll"', () => {
    expect(validateSlug('enroll')).toEqual({ ok: false, reason: 'reserved' });
  });

  it('rejects leading hyphen', () => {
    expect(validateSlug('-foo')).toEqual({ ok: false, reason: 'bad-hyphens' });
  });

  it('rejects trailing hyphen', () => {
    expect(validateSlug('foo-')).toEqual({ ok: false, reason: 'bad-hyphens' });
  });

  it('rejects consecutive hyphens', () => {
    expect(validateSlug('foo--bar')).toEqual({ ok: false, reason: 'bad-hyphens' });
  });

  it('rejects uppercase', () => {
    expect(validateSlug('Hillside')).toEqual({ ok: false, reason: 'invalid-chars' });
  });

  it('rejects underscore', () => {
    expect(validateSlug('foo_bar')).toEqual({ ok: false, reason: 'invalid-chars' });
  });
});

describe('ACCENT_COLORS', () => {
  it('has exactly 6 presets per CONTEXT Q2', () => {
    expect(ACCENT_COLORS).toHaveLength(6);
  });

  it('matches the sage/terracotta/midnight/wine/forest/clay preset names', () => {
    expect(new Set(ACCENT_COLORS)).toEqual(
      new Set(['sage', 'terracotta', 'midnight', 'wine', 'forest', 'clay']),
    );
  });
});
