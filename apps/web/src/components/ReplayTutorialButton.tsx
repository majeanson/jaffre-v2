import { useState } from 'react';
import { useLang, type Lang } from '@jaffre/ui';
import { resetTutorial } from '../table/tutorialPref.js';

const T: Record<Lang, { ask: string; go: string; cancel: string }> = {
  en: {
    ask: 'Start a fresh practice game with the tutorial marks turned back on?',
    go: 'Start it',
    cancel: 'Not now',
  },
  fr: {
    ask: 'Partir une nouvelle partie d’entraînement avec les repères du tutoriel remis à zéro?',
    go: 'Pars-la',
    cancel: 'Pas tout de suite',
  },
};

const BTN =
  'cursor-pointer rounded-(--radius-ap-control) border-2 border-(--color-ap-ink) bg-(--color-ap-panel) px-3 py-2 font-arcade-display text-(length:--text-fluid-xs) uppercase tracking-wide text-(--color-ap-text) shadow-(--shadow-ap-sm) hover:bg-(--color-ap-panel-hover)';

export interface ReplayTutorialButtonProps {
  /** The button's own wording — each sheet keeps its existing label. */
  readonly label: string;
  /** Run just before the jump: close the sheet, clear a local checklist. */
  readonly onConfirm?: () => void;
}

/**
 * "Replay tutorial", in the two sheets that offer it (Help, Settings). It
 * asks first — the tutorial replays on a NEW practice table, which walks you
 * off whatever you were doing — and only then resets the marks and takes you
 * there. Before, one stray tap silently armed the marks (Help) or dropped you
 * into a new game with no warning (Settings).
 */
export function ReplayTutorialButton({ label, onConfirm }: ReplayTutorialButtonProps) {
  const t = T[useLang()];
  const [asking, setAsking] = useState(false);

  if (!asking) {
    return (
      <button type="button" onClick={() => setAsking(true)} className={BTN}>
        {label}
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-(length:--text-fluid-xs) leading-snug text-(--color-ap-muted)">{t.ask}</p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => {
            resetTutorial();
            onConfirm?.();
            location.hash = '#practice';
          }}
          className={`${BTN} bg-(--color-ap-gold) text-(--color-ap-ink) hover:brightness-105`}
        >
          {t.go}
        </button>
        <button type="button" onClick={() => setAsking(false)} className={BTN}>
          {t.cancel}
        </button>
      </div>
    </div>
  );
}
