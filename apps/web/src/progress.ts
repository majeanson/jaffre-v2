import type { Lang } from '@jaffre/ui';
import { AWARDS } from './awards.js';
import { CARD_SKINS, BONHOMME_SKINS, bonhommeLabel } from './cosmetics.js';
import { FELTS } from './felt.js';
import { SWEEPS } from './sweeps.js';
import { THEMES } from './theme.js';
import { trackRewardAt } from './progression.js';

/**
 * Progress moments — the one place the game tells you something good happened.
 *
 * Before this, a level-up said nothing at all, an award said nothing, and a
 * cosmetic unlock got a bare "Unlocked: Tavern Wood" with no way to go and
 * wear it. Three different silences and one dead end.
 *
 * The design rule here is ONE announcement per thing that happened. Levelling
 * to 3 also grants a felt; earning Ten Wins also grants a deck. Those are one
 * event each, not two — so a moment that carries a reward absorbs the
 * cosmetic's own moment rather than toasting twice for the same instant.
 *
 * Every moment carries a `href`, because "you unlocked X" is only worth saying
 * if it can take you to X.
 */

export type ProgressMoment =
  | {
      readonly kind: 'level';
      readonly key: string;
      readonly level: number;
      /** The cosmetic this level handed out, if any. */
      readonly reward: { readonly id: string; readonly label: string } | null;
    }
  | {
      readonly kind: 'award';
      readonly key: string;
      readonly id: string;
      readonly icon: string;
      readonly name: string;
      readonly reward: { readonly id: string; readonly label: string } | null;
    }
  | {
      readonly kind: 'cosmetic';
      readonly key: string;
      readonly id: string;
      readonly label: string;
    };

/** Where a moment takes you. A cosmetic goes to its tile; a bare level or a
 * bare award goes to the screen that explains it. */
export function momentHref(m: ProgressMoment): string {
  if (m.kind === 'cosmetic') return `#collection/${m.id}`;
  if (m.reward !== null) return `#collection/${m.reward.id}`;
  return m.kind === 'level' ? '#journey' : '#awards';
}

/** Display label for any cosmetic id, across every catalog. */
export function cosmeticLabel(id: string, lang: Lang): string {
  if (BONHOMME_SKINS.some((c) => c.id === id)) return bonhommeLabel(id, lang);
  return (
    CARD_SKINS.find((c) => c.id === id)?.label ??
    THEMES.find((c) => c.id === id)?.label ??
    FELTS.find((c) => c.id === id)?.label ??
    SWEEPS.find((c) => c.id === id)?.label ??
    id
  );
}

/** What the last reconcile saw, so only genuine changes are announced. */
export interface ProgressSeen {
  readonly level: number;
  readonly awards: readonly string[];
  readonly cosmetics: readonly string[];
}

export const EMPTY_SEEN: ProgressSeen = { level: 0, awards: [], cosmetics: [] };

/**
 * Diff what is true now against what was last seen.
 *
 * `firstRun` seeds silently: a player opening the app for the first time (or
 * the first time after this shipped) has "gained" their entire history, and
 * replaying all of it as news would be noise, not celebration.
 */
export function detectMoments(
  now: { level: number; awards: readonly string[]; cosmetics: readonly string[] },
  seen: ProgressSeen,
  lang: Lang,
  firstRun: boolean,
): ProgressMoment[] {
  if (firstRun) return [];

  const moments: ProgressMoment[] = [];
  /** Cosmetics already spoken for by a level or award moment. */
  const claimed = new Set<string>();

  // Levels, oldest first — two levels in one session read as two moments,
  // because they are two things you did.
  //
  // Never announce level 1: that is where everyone starts, not somewhere you
  // arrive. A snapshot written before this shipped (or a corrupted one) can
  // read as level 0, and without this floor the very next visit would
  // congratulate the player on existing.
  for (let level = Math.max(seen.level, 1) + 1; level <= now.level; level++) {
    const track = trackRewardAt(level);
    const reward =
      track === undefined
        ? null
        : { id: track.cosmeticId, label: cosmeticLabel(track.cosmeticId, lang) };
    if (reward !== null) claimed.add(reward.id);
    moments.push({ kind: 'level', key: `level-${String(level)}`, level, reward });
  }

  const seenAwards = new Set(seen.awards);
  for (const id of now.awards) {
    if (seenAwards.has(id)) continue;
    const def = AWARDS.find((a) => a.id === id);
    // A foil grant rides in on the awards list but is not an award — it has no
    // catalog entry, and announcing "foil:noir" would be gibberish.
    if (def === undefined) continue;
    const reward =
      def.reward === undefined ? null : { id: def.reward, label: cosmeticLabel(def.reward, lang) };
    if (reward !== null) claimed.add(reward.id);
    moments.push({
      kind: 'award',
      key: `award-${id}`,
      id,
      icon: def.icon,
      name: def.name(lang),
      reward,
    });
  }

  const seenCosmetics = new Set(seen.cosmetics);
  for (const id of now.cosmetics) {
    if (seenCosmetics.has(id) || claimed.has(id)) continue;
    moments.push({ kind: 'cosmetic', key: `cosmetic-${id}`, id, label: cosmeticLabel(id, lang) });
  }

  return moments;
}
