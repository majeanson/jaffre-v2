import { describe, expect, it } from 'vitest';
import { DEFAULT_NAME, displayName, publicId } from '../src/publicId.js';

/**
 * `displayName` is the one rule for what OTHER people see. A guest is minted as
 * "Player" the moment the home screen mounts, and the lobby's rename card is
 * the only thing that ever asked — but it guards exactly one path (a fresh
 * pre-game seat pick), so chat, the roster, the daily board, the ladder and
 * shared replay links could all fill with identical "Player" rows.
 */

describe('displayName', () => {
  it('keeps a name the player actually chose', () => {
    expect(displayName('Ginette', 'uid-1')).toBe('Ginette');
  });

  it('disambiguates the untouched default with the public id', () => {
    const shown = displayName(DEFAULT_NAME, 'uid-1');
    expect(shown).not.toBe(DEFAULT_NAME);
    expect(shown).toBe(`${DEFAULT_NAME} ${publicId('uid-1').slice(-4)}`);
  });

  it('gives two unnamed guests DIFFERENT labels — the whole point', () => {
    // Uids differing only in their LAST character are the hard case: FNV-1a
    // leaves the leading hex identical for those, so slicing the front of the
    // hash silently collided. Keep this pair exactly as it is.
    expect(displayName(DEFAULT_NAME, 'uid-1')).not.toBe(displayName(DEFAULT_NAME, 'uid-2'));
  });

  it('is stable for one uid across surfaces, so chat matches the roster', () => {
    expect(displayName(DEFAULT_NAME, 'uid-1')).toBe(displayName(null, 'uid-1'));
  });

  it('treats a missing or empty name as unnamed', () => {
    const expected = `${DEFAULT_NAME} ${publicId('uid-1').slice(-4)}`;
    expect(displayName(null, 'uid-1')).toBe(expected);
    expect(displayName(undefined, 'uid-1')).toBe(expected);
    expect(displayName('', 'uid-1')).toBe(expected);
  });

  it('falls back to the bare default when there is no account to derive from', () => {
    // An abandoned seat has nothing to disambiguate against — inventing a
    // suffix from nothing would be worse than saying plainly "Player".
    expect(displayName(null, null)).toBe(DEFAULT_NAME);
  });

  it('never leaks the raw uid, which doubles as the ?u= credential', () => {
    expect(displayName(DEFAULT_NAME, 'uid-1')).not.toContain('uid-1');
  });

  it('is idempotent — re-running it does not stack suffixes', () => {
    const once = displayName(DEFAULT_NAME, 'uid-1');
    expect(displayName(once, 'uid-1')).toBe(once);
  });
});
