import { ARCADE, useLang, type Lang } from '@jaffre/ui';
import { useEffect, useRef } from 'react';
import { useDismissLayer } from '../keys/layers.js';

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
  // A panel, not a modal: no Tab trap, and it takes no focus on open — you
  // press L mid-trick and the keyboard stays on your hand. Escape closes it
  // through the same stack as every other surface.
  const panel = useRef<HTMLDivElement>(null);
  useDismissLayer(panel, onClose, { enabled: visible, initialFocus: () => null });
  const latest = lines[lines.length - 1] ?? '';
  return (
    <>
      {/* The announcer always runs, even with the visible log collapsed. */}
      <div aria-live="polite" className="sr-only">
        {latest}
      </div>
      {/* Soft scrim: the panel floats over live controls (seat chips, sort);
          dimming them signals they're behind it, and a tap anywhere dismisses. */}
      {visible && (
        <div aria-hidden className="fixed inset-0 z-[39] bg-black/30" onClick={onClose} />
      )}
      {visible && (
        <div
          ref={panel}
          className={`${ARCADE.popover} fixed bottom-[24vmin] left-1/2 z-40 w-[min(92vw,50rem)] -translate-x-1/2 overflow-hidden font-arcade-ui`}
        >
          <div className="flex items-center justify-between border-b-2 border-(--color-ap-ink) px-4 py-1.5">
            <span className="font-arcade-display text-[0.72em] uppercase tracking-[0.14em] text-(--color-ap-muted)">
              {t.gameLog}
            </span>
            <button
              type="button"
              aria-label={t.close}
              onClick={onClose}
              className="grid size-9 cursor-pointer place-items-center rounded-(--radius-ap-inner) text-(--color-ap-muted) hover:bg-(--color-ap-panel-hover)"
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
