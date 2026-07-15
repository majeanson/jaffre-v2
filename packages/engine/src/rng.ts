/**
 * Deterministic PRNG. The engine's ONLY source of randomness: every deal is a
 * pure function of (game seed, round index), so state is a pure fold over
 * (seed, actions) and replays are bit-identical.
 */
export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Mix a seed with a round index into a fresh 32-bit seed (splitmix-style). */
export function hashSeed(seed: number, round: number): number {
  let h = (seed ^ Math.imul(round + 1, 0x9e3779b9)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}
