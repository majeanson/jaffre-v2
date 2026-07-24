import { useEffect, useState } from 'react';
import { ARCADE, useLang, type Lang } from '@jaffre/ui';
import { ICON_BTN_LABELED } from '../components/IconButton.js';
import { levelProgress, xpFromStats, type LevelProgress } from '../progression.js';
import { fetchStats } from '../net/history.js';

const T: Record<Lang, { level: (n: number) => string; journey: string }> = {
  en: { level: (n) => `LV ${String(n)}`, journey: 'Journey' },
  fr: { level: (n) => `LV ${String(n)}`, journey: 'Parcours' },
};

/**
 * The Home chrome bar's progression pulse: a compact level chip linking to
 * the Journey. Self-fetching and quiet — renders nothing until stats arrive
 * (and never for a brand-new offline visitor). The full level + XP bar lives
 * on the Journey screen itself; this is just the door.
 */
export function LevelBadge() {
  const t = T[useLang()];
  const [progress, setProgress] = useState<LevelProgress | null>(null);

  useEffect(() => {
    let live = true;
    fetchStats()
      .then((s) => live && setProgress(levelProgress(xpFromStats(s))))
      .catch(() => {
        /* offline / no identity: no badge */
      });
    return () => {
      live = false;
    };
  }, []);

  if (progress === null) return null;

  return (
    <a
      href="#journey"
      data-testid="level-badge"
      title={t.journey}
      className={`${ICON_BTN_LABELED} ${ARCADE.iconBtnNeutral} font-arcade-display text-[0.68em] uppercase tracking-wide`}
    >
      {t.level(progress.level)}
    </a>
  );
}
