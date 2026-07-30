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
    desc: (l) => t(l, 'Finish your first game.', 'Termine ta première partie.'),
    requirement: (s, l) => ({
      text: t(l, 'Play 1 game', 'Joue 1 partie'),
      have: s.games,
      need: 1,
    }),
  },
  {
    id: 'first-win',
    icon: '🎉',
    name: (l) => t(l, 'First Win', 'Première victoire'),
    desc: (l) => t(l, 'Win your first game.', 'Gagne ta première partie.'),
    requirement: (s, l) => ({ text: t(l, 'Win 1 game', 'Gagne 1 partie'), have: s.wins, need: 1 }),
  },
  {
    id: 'ten-wins',
    icon: '🏆',
    name: (l) => t(l, 'Ten Wins', 'Dix victoires'),
    desc: (l) => t(l, 'Win ten games.', 'Gagne dix parties.'),
    reward: 'woodcut',
    requirement: (s, l) => ({
      text: t(l, 'Win 10 games', 'Gagne 10 parties'),
      have: s.wins,
      need: 10,
    }),
  },
  {
    id: 'win-streak-5',
    icon: '🔥',
    name: (l) => t(l, 'On Fire', 'En feu'),
    desc: (l) => t(l, 'Win five games in a row.', 'Gagne cinq parties de suite.'),
    reward: 'lamplight-foil',
    requirement: (s, l) => ({
      text: t(l, 'Win 5 in a row', 'Gagne 5 fois de suite'),
      have: s.streak.best,
      need: 5,
    }),
  },
  {
    id: 'century',
    icon: '💯',
    name: (l) => t(l, 'Century', 'Centurion'),
    desc: (l) => t(l, 'Reach +100 net points.', 'Atteins +100 points nets.'),
    reward: 'gilded',
    requirement: (s, l) => ({
      text: t(l, 'Reach +100 net points', 'Atteins +100 points nets'),
      have: Math.max(0, s.netPoints),
      need: 100,
    }),
  },
  {
    id: 'sans-atout-master',
    icon: '🎯',
    name: (l) => t(l, 'Sans-Atout Master', 'Maître sans atout'),
    desc: (l) => t(l, 'Make three sans-atout bids.', 'Réussis trois mises sans atout.'),
    reward: 'sans-atout',
    requirement: (s, l) => ({
      text: t(l, 'Make 3 sans-atout bids', 'Réussis 3 mises sans atout'),
      have: s.sansAtout.made,
      need: 3,
    }),
  },
  {
    id: 'veteran',
    icon: '🎖️',
    name: (l) => t(l, 'Veteran', 'Vétéran'),
    desc: (l) => t(l, 'Play fifty games.', 'Joue cinquante parties.'),
    requirement: (s, l) => ({
      text: t(l, 'Play 50 games', 'Joue 50 parties'),
      have: s.games,
      need: 50,
    }),
  },
  {
    id: 'nemesis-born',
    icon: '😈',
    name: (l) => t(l, 'Rivalry', 'Rivalité'),
    desc: (l) => t(l, 'Earn a nemesis.', 'Fais-toi une némésis.'),
    reward: 'bloodmoon',
    requirement: (s, l) => ({
      text: t(l, 'Earn a nemesis', 'Fais-toi une némésis'),
      have: s.nemesis === null ? 0 : 1,
      need: 1,
    }),
  },
  // ── Spectating. Deliberately awards rather than XP: the XP constants are
  //    frozen, and watching is the least skill-bearing thing in the game. The
  //    reward is a FELT rather than a card skin — a commentator's surface fits
  //    the role better than a deck they weren't playing with.
  {
    id: 'watcher',
    icon: '👀',
    name: (l) => t(l, 'Watcher', 'Spectateur'),
    desc: (l) => t(l, 'Watch a game through to the end.', 'Regarde une partie jusqu’à la fin.'),
    requirement: (s, l) => ({
      text: t(l, 'Watch 1 game to the end', 'Regarde 1 partie jusqu’au bout'),
      have: s.spectated ?? 0,
      need: 1,
    }),
  },
  {
    id: 'commentator',
    icon: '🎙️',
    name: (l) => t(l, 'Commentator', 'Commentateur'),
    desc: (l) =>
      t(
        l,
        'Watch ten games to the end. Unlocks the Bare Slate felt.',
        'Regarde dix parties jusqu’à la fin. Débloque le tapis Ardoise nue.',
      ),
    reward: 'slate',
    requirement: (s, l) => ({
      text: t(l, 'Watch 10 games to the end', 'Regarde 10 parties jusqu’au bout'),
      have: s.spectated ?? 0,
      need: 10,
    }),
  },
  {
    id: 'the-rail',
    icon: '🪑',
    name: (l) => t(l, 'The Rail', 'La galerie'),
    desc: (l) => t(l, 'Watch fifty games to the end.', 'Regarde cinquante parties jusqu’à la fin.'),
    requirement: (s, l) => ({
      text: t(l, 'Watch 50 games to the end', 'Regarde 50 parties jusqu’au bout'),
      have: s.spectated ?? 0,
      need: 50,
    }),
  },
  // ── Monthly champion. Server-computed and lazily granted (see
  //    apps/server/src/awards.ts's MONTHLY_CHAMPION_AWARD_ID) whenever anyone
  //    reads the monthly ladder and last month's crown hadn't been handed out
  //    yet — no client attestation, so it can't be forged the way an `event`
  //    award could. No `requirement`: "finish a month on top" isn't a stat
  //    this client can compute a live progress bar for the way the others can.
  {
    id: 'monthly-champion',
    icon: '👑',
    name: (l) => t(l, 'Monthly Champion', 'Champion du mois'),
    desc: (l) =>
      t(
        l,
        'Finish a calendar month with the most wins on the ladder.',
        'Termine un mois civil avec le plus de victoires au classement.',
      ),
  },
  {
    id: 'tutorial-complete',
    icon: '🎓',
    name: (l) => t(l, 'Graduate', 'Diplômé'),
    desc: (l) =>
      t(
        l,
        'Finish the practice tutorial. Unlocks the Classic OG bonhomme.',
        'Termine le tutoriel. Débloque le bonhomme Classique OG.',
      ),
    // The 'og' BONHOMME skin — deliberately NOT the full og-deck card skin,
    // which is the level-8 track reward and must stay level-gated.
    reward: 'og',
  },
];

/** The cosmetic ids unlocked by the given set of earned award ids. */
export function grantedRewardIds(earnedAwardIds: Iterable<string>): Set<string> {
  const earned = new Set(earnedAwardIds);
  return new Set(
    AWARDS.filter((a) => a.reward !== undefined && earned.has(a.id)).map((a) => a.reward as string),
  );
}
