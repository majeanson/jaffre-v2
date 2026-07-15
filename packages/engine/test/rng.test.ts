import { describe, expect, it } from 'vitest';
import { hashSeed, mulberry32 } from '../src/rng.js';

describe('mulberry32', () => {
  it('is deterministic for a given seed', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const seqA = Array.from({ length: 10 }, () => a());
    const seqB = Array.from({ length: 10 }, () => b());
    expect(seqA).toEqual(seqB);
  });

  it('produces different sequences for different seeds', () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    expect(Array.from({ length: 5 }, () => a())).not.toEqual(Array.from({ length: 5 }, () => b()));
  });

  it('stays within [0, 1)', () => {
    const rng = mulberry32(123456789);
    for (let i = 0; i < 10_000; i++) {
      const x = rng();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });
});

describe('hashSeed', () => {
  it('is deterministic', () => {
    expect(hashSeed(7, 3)).toBe(hashSeed(7, 3));
  });

  it('differs across rounds for the same seed', () => {
    const hashes = new Set(Array.from({ length: 50 }, (_, r) => hashSeed(99, r)));
    expect(hashes.size).toBe(50);
  });

  it('returns an unsigned 32-bit integer', () => {
    for (const [seed, round] of [
      [0, 0],
      [-1, 5],
      [2 ** 31, 100],
    ] as const) {
      const h = hashSeed(seed, round);
      expect(Number.isInteger(h)).toBe(true);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThanOrEqual(0xffffffff);
    }
  });
});
