import { useLang, type Lang } from '@jaffre/ui';
import { useEffect, useRef } from 'react';

const T: Record<Lang, { gameLog: string; close: string; emptyLog: string }> = {
  en: {
    gameLog: 'Game log',
    close: 'Close log',
    emptyLog: 'No moves yet — the log fills in as the hand plays out.',
  },
  fr: {
    gameLog: 'Journal de partie',
    close: 'Fermer le journal',
    emptyLog: 'Aucun coup encore — le journal se remplit à mesure que la main se joue.',
  },
};

export interface GameLogPanelProps {
  readonly lines: readonly string[];
  readonly visible: boolean;
  readonly onClose: () => void;
}

/**
 * Owns the game log: the sr-only announcer (ALWAYS mounted, even with the
 * visible log collapsed) + the floating visible history panel.
 */
export function GameLogPanel({ lines, visible, onClose }: GameLogPanelProps) {
  const t = T[useLang()];
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight });
  }, [lines.length, visible]);
  useEffect(() => {
    if (!visible) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [visible, onClose]);
  const latest = lines[lines.length - 1] ?? '';
  return (
    <>
      {/* The announcer always runs, even with the visible log collapsed. */}
      <div aria-live="polite" className="sr-only">
        {latest}
      </div>
      {visible && (
        <div className="fixed bottom-[24vmin] left-1/2 z-40 w-[min(92vw,50rem)] -translate-x-1/2 overflow-hidden rounded-(--radius-ap-panel) border-2 border-(--color-ap-ink) bg-(--color-ap-panel) font-arcade-ui shadow-(--shadow-ap-lg)">
          <div className="flex items-center justify-between border-b-2 border-(--color-ap-ink) px-4 py-1.5">
            <span className="font-arcade-display text-[0.72em] uppercase tracking-[0.14em] text-(--color-ap-muted)">
              {t.gameLog}
            </span>
            <button
              type="button"
              aria-label={t.close}
              onClick={onClose}
              className="grid size-7 cursor-pointer place-items-center rounded-(--radius-ap-inner) text-(--color-ap-muted) hover:bg-(--color-ap-panel-hover)"
            >
              ✕
            </button>
          </div>
          <div
            ref={ref}
            data-testid="game-log"
            role="region"
            aria-label={t.gameLog}
            tabIndex={0}
            className="h-32 overflow-y-auto px-4 py-2 text-xs leading-5 text-(--color-ap-text)/80"
          >
            {lines.length === 0 ? (
              <p className="text-(--color-ap-muted)">{t.emptyLog}</p>
            ) : (
              lines.slice(-40).map((text, i) => <p key={i}>{text}</p>)
            )}
          </div>
        </div>
      )}
    </>
  );
}
