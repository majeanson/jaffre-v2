import type { CapturedTrick } from '@jaffre/engine';
import type { TeamSpecials } from '@jaffre/ui';

/**
 * Which scoring specials (red 0 → +5, brown 0 → −3) each team has captured,
 * derived from the cards in their won tricks. Shared by the score header and
 * the round summary so both call the same cards out the same way.
 */
export function teamSpecialsFrom(tricks: readonly CapturedTrick[]): [TeamSpecials, TeamSpecials] {
  const out: [TeamSpecials, TeamSpecials] = [
    { red: false, brown: false },
    { red: false, brown: false },
  ];
  for (const t of tricks) {
    const team = (t.winner % 2) as 0 | 1;
    for (const c of t.cards) {
      if (c.suit === 'red' && c.value === 0) out[team] = { ...out[team], red: true };
      if (c.suit === 'brown' && c.value === 0) out[team] = { ...out[team], brown: true };
    }
  }
  return out;
}
