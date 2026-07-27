import { useLang, type Lang } from '@jaffre/ui';
import { useState } from 'react';
import { teachingDealForSeed } from '../home/teachingDeals.js';

const T: Record<Lang, { dismiss: string; goal: string }> = {
  en: { dismiss: 'Dismiss', goal: 'Try this' },
  fr: { dismiss: 'Fermer', goal: 'Essaie ça' },
};

/**
 * The goal line for a curated practice deal: what this hand is here to teach.
 * Without it the teaching chips would just deal a hand and say nothing. Sits
 * under the score strip, dismissible, and only for a seed that names a deal.
 */
export function TeachingGoal({ seed }: { readonly seed: number | null }) {
  const lang = useLang();
  const t = T[lang];
  const deal = teachingDealForSeed(seed);
  const [shown, setShown] = useState(true);
  if (deal === null || !shown) return null;

  return (
    <div
      data-testid="teaching-goal"
      className="pop-in z-30 mt-1 flex w-[min(94vw,34rem)] items-start gap-2.5 rounded-(--radius-ap-panel) border-2 border-(--color-ap-gold) bg-(--color-ap-ink) px-3 py-2 shadow-(--shadow-ap)"
    >
      <span aria-hidden className="mt-0.5 text-(--color-ap-gold)">
        ❖
      </span>
      <span className="min-w-0 flex-1">
        <span className="font-arcade-display text-(length:--text-fluid-xs) uppercase tracking-wide text-(--color-ap-gold)">
          {deal.label[lang]} · {t.goal}
        </span>
        <p className="mt-0.5 font-arcade-ui text-(length:--text-fluid-xs) leading-snug text-white/90">
          {deal.goal[lang]}
        </p>
      </span>
      <button
        type="button"
        aria-label={t.dismiss}
        onClick={() => setShown(false)}
        className="-mr-1 -mt-1 grid size-6 shrink-0 cursor-pointer place-items-center rounded-(--radius-ap-control) text-white/60 hover:bg-white/10 hover:text-white"
      >
        ✕
      </button>
    </div>
  );
}
