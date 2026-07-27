import type { Lang } from '@jaffre/ui';

/**
 * Curated practice deals. Practice normally seeds at random, so a first-timer
 * can't choose to meet the situation they're trying to learn. These three
 * seeds were picked by scanning the real engine for hands that put the lesson
 * in your hand on the very first round — the deal AND the bots' play are
 * deterministic from the seed, so the scenario is the same every time.
 *
 * `#practice/<seed>` was already the deep link; this only gives three of them
 * names, a goal line, and a door on the PLAY menu.
 */
export interface TeachingDeal {
  readonly id: string;
  readonly seed: number;
  readonly label: Record<Lang, string>;
  /** One line of what to try — shown as a chip blurb and again on the felt. */
  readonly goal: Record<Lang, string>;
}

export const TEACHING_DEALS: readonly TeachingDeal[] = [
  {
    id: 'bidding',
    // Red 7 + Red 6 + Red 0 and two more high cards: a hand worth bidding on.
    seed: 122,
    label: { en: 'Learn bidding', fr: 'Apprendre les mises' },
    goal: {
      en: 'You have a strong red suit and the Red 0. Bid for it — you need those points, not just tricks.',
      fr: 'Tu as du rouge fort et le 0 rouge. Mise dessus — ce sont les points qu’il te faut, pas juste des levées.',
    },
  },
  {
    id: 'red-zero',
    // Red 7 and Red 6 but NOT the Red 0 — leading red drags it out.
    seed: 34,
    label: { en: 'Hunt the Red 0', fr: 'Chasser le 0 rouge' },
    goal: {
      en: 'You hold the Red 7 and 6 but not the Red 0. Lead red: whoever holds it must follow, and it falls under your winner (+5).',
      fr: 'Tu as le 7 et le 6 de rouge, mais pas le 0. Entame rouge : celui qui l’a doit fournir, et il tombe sous ta gagnante (+5).',
    },
  },
  {
    id: 'defend',
    // No 7s, one 6, and the Brown 0 — you're defending, and holding a penalty.
    seed: 3,
    label: { en: 'Defend a contract', fr: 'Défendre contre un contrat' },
    goal: {
      en: 'A weak hand: let someone else take the contract, then take points off them — defenders keep everything they capture.',
      fr: 'Une main faible : laisse un autre prendre le contrat, puis vole-lui des points — les défenseurs gardent tout ce qu’ils prennent.',
    },
  },
];

/** The teaching deal a practice seed belongs to, if any. */
export function teachingDealForSeed(seed: number | null | undefined): TeachingDeal | null {
  if (seed === null || seed === undefined) return null;
  return TEACHING_DEALS.find((d) => d.seed === seed) ?? null;
}
