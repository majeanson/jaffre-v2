import { type CSSProperties } from 'react';
import { useLang, type Lang } from '@jaffre/ui';

const STORAGE_KEY = 'jaffre:practiceNudge';

/** Whether the first-visit "try Practice" nudge is still due. It shows until
 * the player taps it, dismisses it, or has a standing table (see Home).
 * Exported because Home keys the slot on it: while this nudge is due, it is
 * the ONE "start here" row — the DailyDoor waits its turn. */
export function practiceNudgeDue(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === null;
  } catch {
    return false;
  }
}

function dismissPracticeNudge(): void {
  try {
    localStorage.setItem(STORAGE_KEY, 'done');
  } catch {
    // Storage unavailable — the nudge simply shows again next visit.
  }
}

const T: Record<Lang, { nudge: string; dismiss: string }> = {
  en: {
    nudge: 'New to Jaffre? Try a practice game — the Coach will guide you.',
    dismiss: 'Dismiss',
  },
  fr: {
    nudge: 'Nouveau ici? Essaie une partie de pratique — le Coach te guide.',
    dismiss: 'Fermer',
  },
};

/**
 * First-visit nudge above the PLAY door: one line pointing a newcomer at the
 * coached practice game. One-shot — tapping it (or its ✕) retires it for good.
 *
 * It carries the most important sentence on a first visit, so it is set at the
 * shell's readable size with a gold rule down its edge rather than the muted
 * fine print it started as — it was reading as a caption for the PLAY button
 * below it instead of as its own door.
 */
export function PracticeNudge({
  onPractice,
  onRetire,
}: {
  readonly onPractice: () => void;
  /** Home owns visibility (it decides which "start here" row gets the slot),
   * so retiring must tell it — the latch alone wouldn't re-render Home. */
  readonly onRetire: () => void;
}) {
  const t = T[useLang()];
  const retire = () => {
    dismissPracticeNudge();
    onRetire();
  };
  return (
    <div
      data-testid="practice-nudge"
      className="rise-in flex items-center gap-2 rounded-(--radius-ap-control) border-2 border-l-[6px] border-(--color-ap-ink) border-l-(--color-ap-gold) bg-(--color-ap-panel) py-1 pr-1 pl-3 shadow-(--shadow-ap-sm)"
      style={{ '--rise-delay': '20ms' } as CSSProperties}
    >
      <span aria-hidden className="shrink-0 text-(--color-ap-gold)">
        ✦
      </span>
      <button
        type="button"
        onClick={() => {
          retire();
          onPractice();
        }}
        className="min-w-0 flex-1 cursor-pointer py-1.5 text-left font-arcade-ui text-(length:--text-fluid-sm) leading-snug font-semibold text-(--color-ap-text) hover:text-(--color-ap-gold)"
      >
        {t.nudge}
        <span aria-hidden> →</span>
      </button>
      <button
        type="button"
        onClick={retire}
        aria-label={t.dismiss}
        className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-(--radius-ap-control) text-(--color-ap-muted) hover:bg-(--color-ap-panel-hover) hover:text-(--color-ap-text)"
      >
        ✕
      </button>
    </div>
  );
}
