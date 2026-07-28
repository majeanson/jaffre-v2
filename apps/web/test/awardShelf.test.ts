import { describe, expect, it } from 'vitest';
import { arrangeIds, moveWithin } from '../src/awardShelf.js';
import { AWARDS } from '../src/awards.js';

/**
 * The shelf arrangement is the one piece of this screen that can silently LOSE
 * something: it is player-controlled, persisted, and read back long after the
 * award catalog has moved on. Every case below is a way a stale arrangement
 * could hide a trophy the player actually earned.
 */
describe('trophy shelf arrangement', () => {
  it('falls back to catalog order when nothing is stored', () => {
    expect(arrangeIds(['a', 'b', 'c'], null)).toEqual(['a', 'b', 'c']);
  });

  it('applies a stored order', () => {
    expect(arrangeIds(['a', 'b', 'c'], ['c', 'a', 'b'])).toEqual(['c', 'a', 'b']);
  });

  it('appends awards the arrangement never mentioned', () => {
    // The case that matters most: an award earned AFTER the shelf was saved.
    expect(arrangeIds(['a', 'b', 'c'], ['c', 'a'])).toEqual(['c', 'a', 'b']);
  });

  it('drops ids that are no longer earned or no longer exist', () => {
    expect(arrangeIds(['a', 'b'], ['zz', 'b', 'gone', 'a'])).toEqual(['b', 'a']);
  });

  it('collapses duplicates instead of showing a trophy twice', () => {
    expect(arrangeIds(['a', 'b'], ['a', 'a', 'b', 'a'])).toEqual(['a', 'b']);
  });

  it('never loses or invents an award, for any stored order', () => {
    const ids = AWARDS.map((a) => a.id);
    const orders: (readonly string[] | null)[] = [
      null,
      [],
      [...ids].reverse(),
      ids.slice(0, 2),
      ['not-an-award', ...ids],
      [...ids, ...ids],
    ];
    for (const order of orders) {
      const out = arrangeIds(ids, order);
      expect(new Set(out)).toEqual(new Set(ids));
      expect(out.length).toBe(ids.length);
    }
  });

  it('handles an empty shelf', () => {
    expect(arrangeIds([], ['a', 'b'])).toEqual([]);
    expect(arrangeIds([], null)).toEqual([]);
  });
});

describe('moving a trophy along the shelf', () => {
  it('swaps with its neighbour', () => {
    expect(moveWithin(['a', 'b', 'c'], 1, -1)).toEqual(['b', 'a', 'c']);
    expect(moveWithin(['a', 'b', 'c'], 1, 1)).toEqual(['a', 'c', 'b']);
  });

  it('is a no-op at either end, so the end buttons need no special case', () => {
    expect(moveWithin(['a', 'b', 'c'], 0, -1)).toEqual(['a', 'b', 'c']);
    expect(moveWithin(['a', 'b', 'c'], 2, 1)).toEqual(['a', 'b', 'c']);
  });

  it('never mutates the input', () => {
    const original = ['a', 'b', 'c'];
    moveWithin(original, 0, 1);
    expect(original).toEqual(['a', 'b', 'c']);
  });

  it('keeps the same set of trophies however far it is dragged around', () => {
    let ids = AWARDS.map((a) => a.id);
    const before = new Set(ids);
    for (let i = 0; i < ids.length - 1; i++) ids = moveWithin(ids, i, 1);
    for (let i = ids.length - 1; i > 0; i--) ids = moveWithin(ids, i, -1);
    expect(new Set(ids)).toEqual(before);
    expect(ids.length).toBe(before.size);
  });
});
