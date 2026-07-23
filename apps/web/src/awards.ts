import type { Lang } from '@jaffre/ui';
import type { Stats } from './net/history.js';

/**
 * Award catalog — the CLIENT half: display copy (name/desc/icon), the progress
 * requirement for locked badges, and the cosmetic-reward mapping. The server
 * (apps/server/src/awards.ts) owns the ids + how they're earned; this owns how
 * they read. Ids must stay in lockstep across the two files.
 *
 * An award with a `reward` cosmetic id makes that cosmetic owned once the award
 * is earned — threaded into `owned()` (cosmetics.ts) as the granted set.
 */

const t = (lang: Lang, en: string, fr: string): string => (lang === 'fr' ? fr : en);

export interface AwardDef {
  readonly id: string;
  readonly icon: string;
  readonly name: (lang: Lang) => string;
  readonly desc: (lang: Lang) => string;
  /** Cosmetic id unlocked when this award is earned (feeds owned()). */
  readonly reward?: string;
  /** Progress toward earning it, for the showcase's locked tiles. Absent for
   * event awards (tutorial), whose progress isn't a stat. */
  readonly requirement?: (s: Stats, lang: Lang) => { text: string; have: number; need: number };
}

// Catalog order is the showcase's ladder — roughly the order a new player will
// earn them. An award whose criteria exactly match a challenge cosmetic carries
// it as `reward`, so every badge that CAN pay out shows what it pays.
export const AWARDS: readonly AwardDef[] = [
  {
    id: 'first-game',
    icon: '🃏',
    name: (l) => t(l, 'Deal Me In', 'Première brasse'),
    desc: (l) => t(l, 'Finish your first game.', 'Terminez votre première partie.'),
    requirement: (s, l) => ({
      text: t(l, 'Play 1 game', 'Jouez 1 partie'),
      have: s.games,
      need: 1,
    }),
  },
  {
    id: 'first-win',
    icon: '🎉',
    name: (l) => t(l, 'First Win', 'Première victoire'),
    desc: (l) => t(l, 'Win your first game.', 'Gagnez votre première partie.'),
    requirement: (s, l) => ({ text: t(l, 'Win 1 game', 'Gagnez 1 partie'), have: s.wins, need: 1 }),
  },
  {
    id: 'ten-wins',
    icon: '🏆',
    name: (l) => t(l, 'Ten Wins', 'Dix victoires'),
    desc: (l) => t(l, 'Win ten games.', 'Gagnez dix parties.'),
    reward: 'woodcut',
    requirement: (s, l) => ({
      text: t(l, 'Win 10 games', 'Gagnez 10 parties'),
      have: s.wins,
      need: 10,
    }),
  },
  {
    id: 'win-streak-5',
    icon: '🔥',
    name: (l) => t(l, 'On Fire', 'En feu'),
    desc: (l) => t(l, 'Win five games in a row.', 'Gagnez cinq parties de suite.'),
    reward: 'lamplight-foil',
    requirement: (s, l) => ({
      text: t(l, 'Win 5 in a row', 'Gagnez 5 fois de suite'),
      have: s.streak.best,
      need: 5,
    }),
  },
  {
    id: 'century',
    icon: '💯',
    name: (l) => t(l, 'Century', 'Centurion'),
    desc: (l) => t(l, 'Reach +100 net points.', 'Atteignez +100 points nets.'),
    reward: 'gilded',
    requirement: (s, l) => ({
      text: t(l, 'Reach +100 net points', 'Atteignez +100 points nets'),
      have: Math.max(0, s.netPoints),
      need: 100,
    }),
  },
  {
    id: 'sans-atout-master',
    icon: '🎯',
    name: (l) => t(l, 'Sans-Atout Master', 'Maître sans atout'),
    desc: (l) => t(l, 'Make three sans-atout bids.', 'Réussissez trois mises sans atout.'),
    reward: 'sans-atout',
    requirement: (s, l) => ({
      text: t(l, 'Make 3 sans-atout bids', 'Réussissez 3 mises sans atout'),
      have: s.sansAtout.made,
      need: 3,
    }),
  },
  {
    id: 'veteran',
    icon: '🎖️',
    name: (l) => t(l, 'Veteran', 'Vétéran'),
    desc: (l) => t(l, 'Play fifty games.', 'Jouez cinquante parties.'),
    requirement: (s, l) => ({
      text: t(l, 'Play 50 games', 'Jouez 50 parties'),
      have: s.games,
      need: 50,
    }),
  },
  {
    id: 'nemesis-born',
    icon: '😈',
    name: (l) => t(l, 'Rivalry', 'Rivalité'),
    desc: (l) => t(l, 'Earn a nemesis.', 'Faites-vous une némésis.'),
    reward: 'bloodmoon',
    requirement: (s, l) => ({
      text: t(l, 'Earn a nemesis', 'Faites-vous une némésis'),
      have: s.nemesis === null ? 0 : 1,
      need: 1,
    }),
  },
  {
    id: 'tutorial-complete',
    icon: '🎓',
    name: (l) => t(l, 'Graduate', 'Diplômé'),
    desc: (l) =>
      t(
        l,
        'Finish the practice tutorial. Unlocks the OG Deck.',
        'Terminez le tutoriel. Débloque le paquet OG.',
      ),
    reward: 'og-deck',
  },
];

/** The cosmetic ids unlocked by the given set of earned award ids. */
export function grantedRewardIds(earnedAwardIds: Iterable<string>): Set<string> {
  const earned = new Set(earnedAwardIds);
  return new Set(
    AWARDS.filter((a) => a.reward !== undefined && earned.has(a.id)).map((a) => a.reward as string),
  );
}
