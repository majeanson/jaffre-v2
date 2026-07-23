import { useEffect, useState } from 'react';
import { useLang, type Lang } from '@jaffre/ui';
import { levelFromXp, levelProgress, xpFromStats } from '../progression.js';
import { fetchStats } from '../net/history.js';

const SEEN_XP_KEY = 'jaffre-xp-seen';

const T: Record<Lang, { level: (n: number) => string; gained: (n: number) => string; levelUp: string }> = {
  en: {
    level: (n) => `Level ${String(n)}`,
    gained: (n) => `+${String(n)} XP`,
    levelUp: 'Level up!',
  },
  fr: {
    level: (n) => `Niveau ${String(n)}`,
    gained: (n) => `+${String(n)} XP`,
    levelUp: 'Niveau supérieur!',
  },
};

interface Moment {
  readonly level: number;
  readonly pct: number;
  readonly gained: number;
  readonly levelUp: boolean;
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
    fetchStats()
      .then((s) => {
        if (!live) return;
        const xp = xpFromStats(s);
        if (xp <= 0) return; // nothing recorded yet — no strip
        const seenRaw = localStorage.getItem(SEEN_XP_KEY);
        const seen = seenRaw === null ? null : Number(seenRaw);
        localStorage.setItem(SEEN_XP_KEY, String(xp));
        const p = levelProgress(xp);
        const gained = seen === null || !Number.isFinite(seen) ? 0 : Math.max(0, xp - seen);
        setMoment({
          level: p.level,
          pct: p.span === 0 ? 100 : (p.into / p.span) * 100,
          gained,
          levelUp: seen !== null && Number.isFinite(seen) && p.level > levelFromXp(seen),
        });
      })
      .catch(() => {
        /* offline: no strip */
      });
    return () => {
      live = false;
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
          {t.levelUp}
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
