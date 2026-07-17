import { useEffect, useRef } from 'react';

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
        <div className="fixed bottom-[24vmin] left-1/2 z-40 w-[min(92vw,50rem)] -translate-x-1/2 rounded-(--radius-ap-panel) border-2 border-(--color-ap-ink) bg-(--color-ap-panel) font-arcade-ui shadow-(--shadow-ap-lg)">
          <button
            type="button"
            aria-label="Close log"
            onClick={onClose}
            className="absolute top-1 right-1 z-10 grid size-7 cursor-pointer place-items-center rounded-(--radius-ap-inner) text-(--color-ap-muted) hover:bg-(--color-ap-panel-hover)"
          >
            ✕
          </button>
          <div
            ref={ref}
            data-testid="game-log"
            role="region"
            aria-label="Game log"
            tabIndex={0}
            className="h-32 overflow-y-auto px-4 py-2 pr-9 text-xs leading-5 text-(--color-ap-text)/80"
          >
            {lines.slice(-40).map((text, i) => (
              <p key={i}>{text}</p>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
