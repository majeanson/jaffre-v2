import { useLang, type Lang } from '@jaffre/ui';
import { useState } from 'react';

const KEY = 'jaffre:firstWinDay';

const T: Record<Lang, { chip: string; sub: string }> = {
  en: { chip: 'First win today', sub: 'Nice — see you tomorrow?' },
  fr: { chip: 'Première victoire du jour', sub: 'Beau travail — à demain?' },
};

/** Local calendar day, so "today" means the player's today. */
function today(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${String(d.getFullYear())}-${m}-${day}`;
}

/**
 * A small recognition beat on the recap the first time you win on a given
 * day. Deliberately NOT an XP claim: the progression constants are frozen and
 * this grants nothing, so it says what it is — a nod for coming back — rather
 * than inventing a reward the level track never pays out.
 */
export function DailyFirstWin({ won }: { readonly won: boolean }) {
  const t = T[useLang()];
  // Claim the day on first render of a won recap; a re-render (or a second
  // win the same day) then finds the day already taken and stays quiet.
  const [first] = useState(() => {
    if (!won) return false;
    try {
      if (localStorage.getItem(KEY) === today()) return false;
      localStorage.setItem(KEY, today());
      return true;
    } catch {
      return false;
    }
  });
  if (!first) return null;

  return (
    <div
      data-testid="daily-first-win"
      className="pop-in mt-[0.6em] flex items-center justify-center gap-[0.5em] font-arcade-ui text-[0.8em]"
    >
      <span className="rounded-(--radius-ap-inner) border-2 border-(--color-ap-ink) bg-(--color-ap-gold) px-[0.5em] py-[0.1em] font-arcade-display text-[0.85em] uppercase text-(--color-ap-ink)">
        ★ {t.chip}
      </span>
      <span className="text-(--color-ap-muted)">{t.sub}</span>
    </div>
  );
}
