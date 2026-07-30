import { describe, expect, it } from 'vitest';
import { backTarget } from '../src/keys/backNav.js';

/**
 * Where the B button goes. The interesting half of this map is what it
 * REFUSES: a screen you leave on purpose must not be leavable by a stray
 * Escape.
 */

describe('backing out of a meta screen', () => {
  it('lands on the corner they were opened from', () => {
    for (const hash of [
      '#journey',
      '#collection',
      '#awards',
      '#stats',
      '#history',
      '#leaderboard',
      '#daily',
    ]) {
      expect(backTarget(hash), hash).toBe('#corner');
    }
  });

  it('reads a deep link as the screen it belongs to', () => {
    expect(backTarget('#collection/noir')).toBe('#corner');
    expect(backTarget('#h2h/0123456789abcdef')).toBe('#corner');
  });

  it('steps from the corner out to home', () => {
    expect(backTarget('#corner')).toBe('');
    expect(backTarget('#lobby')).toBe('');
  });

  it('does nothing once already home', () => {
    expect(backTarget('')).toBeNull();
    expect(backTarget('#')).toBeNull();
  });
});

describe('screens you leave on purpose', () => {
  it('never walks out of a game, a replay, or unsaved pixels', () => {
    // A live table, a room, a replay and the paint studio all have their own
    // deliberate exits — some with a confirm. Escape must not shortcut them.
    for (const hash of [
      '#practice',
      '#room/ABCD',
      '#room/ABCD/watch',
      '#replay/42',
      '#paint',
      '#scenes',
      '#scenes/deal',
    ]) {
      expect(backTarget(hash), hash).toBeNull();
    }
  });

  it('ignores a hash it has never heard of', () => {
    expect(backTarget('#nonsense')).toBeNull();
  });
});
