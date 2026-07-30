import type { Lang } from '@jaffre/ui';
import { AWARDS } from './awards.js';
import { CARD_SKINS, BONHOMME_SKINS, bonhommeLabel } from './cosmetics.js';
import { FELTS } from './felt.js';
import { SWEEPS } from './sweeps.js';
import { THEMES } from './theme.js';
import { trackRewardsAt } from './progression.js';
import { FOIL_PREFIX } from './foils.js';

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
      /** Every cosmetic this level handed out. Usually one, but a felt or
       * sweep rung can land on the SAME level as an existing skin/theme rung
       * (see LEVEL_TRACK in progression.ts) — that is still one thing that
       * happened, not two, so it rides in one moment rather than splitting
       * into a second announcement. */
      readonly rewards: readonly { readonly id: string; readonly label: string }[];
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
    }
  | {
      // A foil grant (see foils.ts): the skin you already own, with a sheen.
      // Its own kind, not a 'cosmetic' — it names no new possession, just a
      // rarer version of one you have, so it reads as "Foil <skin>!" rather
      // than "Unlocked: <skin>" (which would be a lie — you already had it).
      readonly kind: 'foil';
      readonly key: string;
      readonly skinId: string;
      readonly label: string;
    };

/** Where a moment takes you. A cosmetic (or a foil, which lives on one) goes to
 * its tile; a bare level or a bare award goes to the screen that explains it. */
export function momentHref(m: ProgressMoment): string {
  if (m.kind === 'cosmetic') return `#collection/${m.id}`;
  if (m.kind === 'foil') return `#collection/${m.skinId}`;
  if (m.kind === 'level') {
    const first = m.rewards[0];
    return first === undefined ? '#journey' : `#collection/${first.id}`;
  }
  return m.reward !== null ? `#collection/${m.reward.id}` : '#awards';
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
    const rewards = trackRewardsAt(level).map((track) => {
      const reward = { id: track.cosmeticId, label: cosmeticLabel(track.cosmeticId, lang) };
      claimed.add(reward.id);
      return reward;
    });
    moments.push({ kind: 'level', key: `level-${String(level)}`, level, rewards });
  }

  const seenAwards = new Set(seen.awards);
  for (const id of now.awards) {
    if (seenAwards.has(id)) continue;
    // A foil grant rides in on the awards list but is not an award — it has no
    // AWARDS catalog entry. It still deserves its own moment ("Foil Noir!"),
    // just resolved against the cosmetic catalog instead. Unresolvable (a skin
    // id the client's catalog doesn't know, e.g. removed since the grant) is
    // skipped rather than announcing gibberish.
    if (id.startsWith(FOIL_PREFIX)) {
      const skinId = id.slice(FOIL_PREFIX.length);
      if (CARD_SKINS.some((c) => c.id === skinId)) {
        moments.push({
          kind: 'foil',
          key: `foil-${id}`,
          skinId,
          label: cosmeticLabel(skinId, lang),
        });
      }
      continue;
    }
    const def = AWARDS.find((a) => a.id === id);
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

/** localStorage key for the reconcile's "what was last seen" snapshot. MUST
 * match cosmeticsBoot.ts's own `PROGRESS_KEY` — kept private there (that file
 * owns reading/writing the full snapshot every reconcile) and duplicated here
 * as a literal rather than imported, so this module never has to reach into
 * cosmeticsBoot.ts (which reaches net/awards.ts's fetchAwards — see this
 * function's own caller for why that path must stay one-way). */
const PROGRESS_SEEN_KEY = 'jaffre-progress-seen';

/**
 * Stamp a just-granted award id into the progress-seen baseline directly,
 * without waiting for the next full reconcile.
 *
 * `grantAward()` (net/awards.ts) already pops a "you earned X" toast the
 * instant the server confirms the grant (NoticeToast). Without this, the NEXT
 * reconcile — a hashchange into a menu surface, or the next app load — would
 * still find that award id missing from the seen set and announce it a
 * SECOND time via ProgressToast: the same award, told twice, by two different
 * toast systems. Best-effort: a storage failure here just means the award MAY
 * be re-announced once, not that the grant itself failed.
 */
export function stampAwardSeen(awardId: string): void {
  try {
    const raw = localStorage.getItem(PROGRESS_SEEN_KEY);
    const parsed = raw === null ? null : (JSON.parse(raw) as Partial<ProgressSeen>);
    const seen: ProgressSeen = {
      level: typeof parsed?.level === 'number' ? parsed.level : 0,
      awards: Array.isArray(parsed?.awards) ? parsed.awards : [],
      cosmetics: Array.isArray(parsed?.cosmetics) ? parsed.cosmetics : [],
    };
    if (seen.awards.includes(awardId)) return;
    localStorage.setItem(
      PROGRESS_SEEN_KEY,
      JSON.stringify({ ...seen, awards: [...seen.awards, awardId] } satisfies ProgressSeen),
    );
  } catch {
    /* best-effort — see doc comment above */
  }
}
