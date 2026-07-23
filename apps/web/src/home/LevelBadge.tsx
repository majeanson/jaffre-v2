import { useEffect, useState } from 'react';
import { useLang, type Lang } from '@jaffre/ui';
import { levelProgress, xpFromStats, type LevelProgress } from '../progression.js';
import { fetchStats } from '../net/history.js';

const T: Record<Lang, { level: (n: number) => string; journey: string }> = {
  en: { level: (n) => `Level ${String(n)}`, journey: 'Journey' },
  fr: { level: (n) => `Niveau ${String(n)}`, journey: 'Parcours' },
};

/**
 * The Home identity column's progression pulse: your level + a slim XP bar,
 * linking to the Journey. Self-fetching and quiet — renders nothing until
 * stats arrive (and never for a brand-new offline visitor).
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
  const pct = progress.span === 0 ? 100 : (progress.into / progress.span) * 100;

  return (
    <a
      href="#journey"
      data-testid="level-badge"
      title={t.journey}
      className="flex w-full max-w-xs items-center gap-[0.7em] rounded-(--radius-ap-control) border-2 border-(--color-ap-ink) bg-(--color-ap-panel) px-[0.8em] py-[0.55em] shadow-(--shadow-ap-sm) transition-colors duration-(--duration-flick) hover:bg-(--color-ap-panel-hover)"
    >
      <span className="shrink-0 font-arcade-display text-[0.78em] uppercase tracking-wide text-(--color-ap-gold)">
        {t.level(progress.level)}
      </span>
      <span className="h-[0.55em] min-w-0 flex-1 overflow-hidden rounded-full border-2 border-(--color-ap-ink) bg-(--color-ap-ink)/20">
        <span
          className="block h-full bg-(--color-ap-violet)"
          style={{ width: `${String(pct)}%` }}
        />
      </span>
      <span
        aria-hidden
        className="shrink-0 font-arcade-display text-[0.8em] text-(--color-ap-muted)"
      >
        🧭
      </span>
    </a>
  );
}
