import { useEffect, useState } from 'react';
import { useLang, type Lang } from '@jaffre/ui';
import { trackRewardAt, xpFromStats, xpMoment } from '../progression.js';
import { trackRewardLabel } from '../trackReward.js';
import { bustStatsCache, fetchStats } from '../net/history.js';
import { playClick } from '../audio/clicks.js';

const SEEN_XP_KEY = 'jaffre-xp-seen';
/**
 * How long to wait before reading the aggregate a second time.
 *
 * The server writes this game's history row INSIDE the same game_over action
 * that sent us the recap, and there is no "persisted" signal on the wire to
 * wait on — so this read can genuinely arrive first. Every recorded game is
 * worth at least XP_PER_GAME, so a total that hasn't moved means the row hasn't
 * landed, not that the game was worth nothing.
 */
const REREAD_MS = 1200;

const T: Record<
  Lang,
  {
    level: (n: number) => string;
    gained: (n: number) => string;
    levelUp: string;
    levelUpReward: (label: string) => string;
  }
> = {
  en: {
    level: (n) => `Level ${String(n)}`,
    gained: (n) => `+${String(n)} XP`,
    levelUp: 'Level up!',
    levelUpReward: (label) => `Level up! — ${label}`,
  },
  fr: {
    level: (n) => `Niveau ${String(n)}`,
    gained: (n) => `+${String(n)} XP`,
    levelUp: 'Niveau supérieur!',
    levelUpReward: (label) => `Niveau supérieur! — ${label}`,
  },
};

interface Moment {
  readonly level: number;
  readonly pct: number;
  readonly gained: number;
  readonly levelUp: boolean;
  /** The cosmetic THIS level handed out, when the rung it just crossed has
   * one — the recap's "Level up!" beat is the whole reason to look, so it
   * should say what waiting there. First reward only when a rung carries
   * more than one (see LEVEL_TRACK in progression.ts); the badge is a single
   * line, not a list. */
  readonly rewardLabel: string | null;
}

/**
 * The recap's progression beat: your level + XP bar, with "+N XP" for what this
 * game just added and a gold "Level up!" flash when it crossed a rung. The
 * delta is measured against the last XP total this device showed (localStorage)
 * — stats are recomputed server-side, so this needs no new wire data. Quiet on
 * failure (offline / spectator identity / practice games, which aren't
 * recorded): renders nothing rather than a zeroed bar.
 */
export function XpStrip() {
  const t = T[useLang()];
  const [moment, setMoment] = useState<Moment | null>(null);

  useEffect(() => {
    let live = true;
    let timer: number | undefined;
    const seenRaw = localStorage.getItem(SEEN_XP_KEY);
    const seen = seenRaw === null || !Number.isFinite(Number(seenRaw)) ? null : Number(seenRaw);

    const read = (rereading: boolean): void => {
      fetchStats()
        .then((s) => {
          if (!live) return;
          const xp = xpFromStats(s);
          const m = xpMoment(xp, seen, rereading);
          if (m.kind === 'hide') return;
          if (m.kind === 'reread') {
            // Bust the 30s read cache first, or the second fetch hands back the
            // very same promise and learns nothing.
            bustStatsCache();
            timer = window.setTimeout(() => read(true), REREAD_MS);
            return;
          }
          if (m.advanceBaseline) localStorage.setItem(SEEN_XP_KEY, String(xp));
          const reward = m.levelUp ? trackRewardAt(m.level) : undefined;
          // J4 payout note: the gold flash gets its own brighter chime — a
          // no-op unless sound is on AND the context is already unlocked
          // (playClick's own gate), so this is silent for the common case.
          if (m.levelUp) playClick('levelUp');
          setMoment({
            level: m.level,
            pct: m.pct,
            gained: m.gained,
            levelUp: m.levelUp,
            rewardLabel: reward === undefined ? null : trackRewardLabel(reward),
          });
        })
        .catch(() => {
          /* offline: no strip */
        });
    };
    read(false);

    return () => {
      live = false;
      if (timer !== undefined) clearTimeout(timer);
    };
  }, []);

  if (moment === null) return null;

  return (
    <div
      data-testid="xp-strip"
      className="mt-[0.6em] flex items-center justify-center gap-[0.6em] font-arcade-ui text-[0.8em]"
    >
      {moment.levelUp && (
        <span className="pop-in rounded-(--radius-ap-inner) border-2 border-(--color-ap-ink) bg-(--color-ap-gold) px-[0.5em] py-[0.1em] font-arcade-display text-[0.85em] uppercase text-(--color-ap-ink)">
          {moment.rewardLabel !== null ? t.levelUpReward(moment.rewardLabel) : t.levelUp}
        </span>
      )}
      <span className="font-arcade-display text-[0.85em] uppercase text-(--color-ap-text)">
        {t.level(moment.level)}
      </span>
      <span className="h-[0.5em] w-[7em] overflow-hidden rounded-full border-2 border-(--color-ap-ink) bg-(--color-ap-ink)/20">
        <span
          className="block h-full bg-(--color-ap-violet) transition-[width] duration-500"
          style={{ width: `${String(moment.pct)}%` }}
        />
      </span>
      {moment.gained > 0 && (
        <span className="tabular-nums text-(--color-ap-ok)">{t.gained(moment.gained)}</span>
      )}
    </div>
  );
}
